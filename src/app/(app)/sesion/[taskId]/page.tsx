import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, FileText, ListChecks, SkipForward, Timer } from "lucide-react";
import { QuickModeButton } from "@/components/practice/test-builder";
import { minutesLabel, STATUS_LABELS } from "@/components/plan/plan-format";
import { SessionPanel } from "@/components/plan/session-panel";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { buttonClass, cardClass } from "@/components/ui/styles";
import { TASK_TYPE_LABELS } from "@/domain/scheduler/plan";
import { skipTaskAction } from "@/server/actions/planning";
import { listAssessments, listSubjects, listTopics } from "@/server/repositories/academic";
import { listDocuments } from "@/server/repositories/documents";
import { getTask } from "@/server/repositories/planning";

export const metadata: Metadata = { title: "Sesión de estudio" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SessionPage({ params }: PageProps<"/sesion/[taskId]">) {
  const { taskId } = await params;
  if (!UUID.test(taskId)) notFound();
  const task = await getTask(taskId);
  if (!task) notFound();
  const [subjects, topics, assessments, documents] = await Promise.all([
    listSubjects(),
    listTopics(task.subjectId),
    listAssessments(task.subjectId),
    listDocuments({ subjectId: task.subjectId }),
  ]);
  const subject = subjects.find((s) => s.id === task.subjectId);
  const topic = topics.find((t) => t.id === task.topicId);
  const assessment = assessments.find((a) => a.id === task.assessmentId);
  const topicDocs = topic ? documents.filter((d) => d.topicIds.includes(topic.id)) : [];
  const docs = (topicDocs.length ? topicDocs : documents).slice(0, 6);
  const closed = ["done", "skipped", "rescheduled"].includes(task.status);

  const what = (() => {
    switch (task.type) {
      case "theory":
        return `Estudia la teoría${topic ? ` de ${topic.name}` : ""}: lee, subraya y resume lo importante.`;
      case "exercises":
        return `Haz ejercicios${topic ? ` de ${topic.name}` : ""}. Si tienes preguntas del tema, practica con ellas.`;
      case "practice":
        return `Trabaja en ${topic?.name ?? "la práctica"}.`;
      case "review":
        return task.questionCount
          ? `Repaso espaciado: un test corto de ${task.questionCount} preguntas${topic ? ` de ${topic.name}` : ""}.`
          : `Repaso espaciado: repasa tus apuntes${topic ? ` de ${topic.name}` : ""} y haz un resumen de memoria.`;
      case "exam_simulation":
        return `Simulacro de ${assessment?.name ?? "examen"}: como el examen real, con tiempo y sin mirar soluciones.`;
      default:
        return "Test de repaso.";
    }
  })();

  return (
    <>
      <header className="mb-6">
        <Link href="/hoy" className="text-sm text-muted hover:underline">
          ← Hoy
        </Link>
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold">
          <span className="size-3 rounded-full" style={{ backgroundColor: subject?.color }} aria-hidden />
          {subject?.code ?? subject?.name}
          {assessment && <span className="font-normal text-muted">· {assessment.name}</span>}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          {topic?.name ?? (task.type === "exam_simulation" ? "Simulacro" : "Sesión")}
        </h1>
        <p className="mt-1 text-muted">
          <span className="first-letter:uppercase">{TASK_TYPE_LABELS[task.type]}</span> · {minutesLabel(task.minutes)}
          {task.status !== "pending" && ` · ${STATUS_LABELS[task.status]}`}
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <section aria-label="Qué hacer" className={`${cardClass} flex flex-col gap-3 p-5`}>
          <p>{what}</p>
          {task.type === "review" && task.questionCount && topic && (
            <div className="self-start">
              <QuickModeButton mode="topic" subjectId={task.subjectId} topicId={topic.id} count={task.questionCount} label="Hacer el test de repaso" />
            </div>
          )}
          {task.type === "exercises" && topic && (
            <Link href={`/tests?asignatura=${task.subjectId}&tema=${topic.id}`} className={`${buttonClass.secondary} self-start`}>
              <ListChecks className="size-4" aria-hidden />
              Practicar con preguntas del tema
            </Link>
          )}
          {task.type === "exam_simulation" && assessment && (
            <Link href={`/simulacro?parcial=${assessment.id}`} className={`${buttonClass.primary} self-start`}>
              <Timer className="size-4" aria-hidden />
              Preparar el simulacro
            </Link>
          )}
          {(task.type === "review" || task.type === "exam_simulation") && (
            <p className="text-xs text-muted">Al acabar el test, vuelve aquí para cerrar la sesión.</p>
          )}
          {docs.length > 0 && ["theory", "exercises", "practice", "review"].includes(task.type) && (
            <div>
              <p className="mb-1 text-sm font-medium text-muted">{topicDocs.length ? "Material del tema" : "Material de la asignatura"}</p>
              <ul className="flex flex-col gap-1 text-sm">
                {docs.map((d) => (
                  <li key={d.id}>
                    <Link href={`/biblioteca/${d.id}`} className="inline-flex items-center gap-2 text-primary hover:underline">
                      <FileText className="size-4 shrink-0" aria-hidden />
                      {d.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {docs.length === 0 && task.type === "theory" && (
            <Link href={`/biblioteca/subir?asignatura=${task.subjectId}`} className="inline-flex items-center gap-2 text-sm text-primary underline">
              <BookOpen className="size-4" aria-hidden /> Sube tus apuntes para tenerlos a mano
            </Link>
          )}
        </section>

        {closed ? (
          <p className={`${cardClass} p-5 text-muted`}>
            Esta tarea ya está {STATUS_LABELS[task.status].toLowerCase()}.{" "}
            <Link href="/hoy" className="text-primary underline">
              Volver a Hoy
            </Link>
          </p>
        ) : (
          <>
            <SessionPanel taskId={task.id} plannedMinutes={task.minutes} topicName={topic?.name ?? null} />
            <form action={skipTaskAction} className="text-center">
              <input type="hidden" name="id" value={task.id} />
              <ConfirmButton message="¿Saltar esta tarea? Su trabajo se repartirá en los próximos días." className="inline-flex items-center gap-1 text-sm text-muted underline">
                <SkipForward className="size-4" aria-hidden />
                Saltar esta tarea
              </ConfirmButton>
            </form>
          </>
        )}
      </div>
    </>
  );
}
