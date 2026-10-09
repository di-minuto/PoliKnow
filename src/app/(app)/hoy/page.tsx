import type { Metadata } from "next";
import Link from "next/link";
import { Check, Play, RotateCcw, Timer } from "lucide-react";
import { CountdownBadge } from "@/components/academic/countdown-badge";
import { PageHeader } from "@/components/layout/page-header";
import { PlanNotices } from "@/components/plan/plan-notices";
import { isStudyTask, minutesLabel, taskLabel } from "@/components/plan/plan-format";
import { cardClass } from "@/components/ui/styles";
import type { Subject } from "@/domain/academic/types";
import { daysUntil, formatDateTime, formatDayHeading } from "@/lib/dates";
import { replan } from "@/server/planner";
import { listTasks, type PlanTask } from "@/server/repositories/planning";

export const metadata: Metadata = { title: "Hoy" };

const OPEN = new Set(["pending", "in_progress", "partial"]);

function TaskRow({ task, label }: { task: PlanTask; label: string }) {
  const finished = task.status === "done";
  const skipped = task.status === "skipped";
  return (
    <li>
      <Link
        href={`/sesion/${task.id}`}
        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-primary-soft/60 ${skipped ? "text-muted line-through" : ""}`}
      >
        {finished ? (
          <Check className="size-4 shrink-0 text-success" aria-label="Hecha" />
        ) : (
          <span className={`size-2 shrink-0 rounded-full ${task.status === "in_progress" || task.status === "partial" ? "bg-warning" : "bg-border"}`} aria-hidden />
        )}
        <span className={finished ? "text-muted" : ""}>{label}</span>
        {task.status === "partial" && <span className="text-xs text-warning">a medias</span>}
      </Link>
    </li>
  );
}

export default async function TodayPage({ searchParams }: PageProps<"/hoy">) {
  const { sesion } = await searchParams;
  const now = new Date();
  const ctx = await replan(now);
  const tasks = (await listTasks(ctx.today, ctx.today)).filter((t) => t.status !== "rescheduled");
  const subjectById = new Map<string, Subject>(ctx.subjects.map((s) => [s.id, s]));
  const topicName = new Map(ctx.topics.map((t) => [t.id, t.name]));
  const subjectLabel = (id: string) => subjectById.get(id)?.code ?? subjectById.get(id)?.name ?? "";
  const heading = formatDayHeading(now, ctx.timezone);

  const study = tasks.filter((t) => isStudyTask(t.type));
  const reviews = tasks.filter((t) => t.type === "review" || t.type === "test");
  const sims = tasks.filter((t) => t.type === "exam_simulation");
  const total = tasks.filter((t) => t.status !== "skipped").reduce((s, t) => s + t.minutes, 0);
  const done = tasks.filter((t) => t.status === "done").reduce((s, t) => s + t.minutes, 0);
  const next = tasks.find((t) => t.status === "in_progress") ?? tasks.find((t) => OPEN.has(t.status));

  // Estudio agrupado por asignatura y tema, en el orden del plan.
  const groups: { subjectId: string; topics: { topicId: string | null; tasks: PlanTask[] }[] }[] = [];
  for (const t of study) {
    let g = groups.find((x) => x.subjectId === t.subjectId);
    if (!g) groups.push((g = { subjectId: t.subjectId, topics: [] }));
    let topic = g.topics.find((x) => x.topicId === t.topicId);
    if (!topic) g.topics.push((topic = { topicId: t.topicId, tasks: [] }));
    topic.tasks.push(t);
  }

  const upcoming = ctx.assessments
    .filter((a) => a.status === "upcoming" && a.examAt && daysUntil(a.examAt, now, ctx.timezone) >= 0)
    .sort((a, b) => a.examAt!.localeCompare(b.examAt!))
    .slice(0, 5);

  return (
    <>
      <PageHeader title="Hoy" subtitle={<span className="first-letter:uppercase">{heading}</span>} />

      <div className="flex flex-col gap-6">
        {sesion === "hecha" && (
          <p role="status" className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
            Sesión guardada. El plan se ha ajustado.
          </p>
        )}

        <PlanNotices
          warnings={ctx.result.warnings}
          notices={ctx.notices}
          assessments={ctx.assessments}
          subjects={ctx.subjects}
          availabilityTotal={ctx.availabilityTotal}
        />

        {ctx.subjects.length === 0 ? (
          <section className={`${cardClass} p-5`}>
            <h2 className="font-semibold">Plan de hoy</h2>
            <p className="mt-2 text-sm text-muted">
              Cuando añadas tus asignaturas, temas y fechas de examen, aquí aparecerán las tareas de cada día.
            </p>
            <Link href="/asignaturas" className="mt-4 inline-block rounded-lg bg-primary-soft px-4 py-2 text-sm font-semibold text-primary">
              Configurar asignaturas
            </Link>
          </section>
        ) : tasks.length === 0 ? (
          <section className={`${cardClass} p-5`}>
            <h2 className="font-semibold">Plan de hoy</h2>
            <p className="mt-2 text-sm text-muted">
              {ctx.input.assessments.length === 0
                ? "No hay exámenes con fecha y temas que planificar."
                : "Hoy no hay nada planificado. ¡Descansa o adelanta con un test!"}
            </p>
          </section>
        ) : (
          <section aria-label="Plan de hoy" className={`${cardClass} flex flex-col gap-4 p-5`}>
            {groups.map((g) => (
              <div key={g.subjectId}>
                <h2 className="flex items-center gap-2 font-bold">
                  <span className="size-3 rounded-full" style={{ backgroundColor: subjectById.get(g.subjectId)?.color }} aria-hidden />
                  {subjectLabel(g.subjectId)}
                </h2>
                {g.topics.map((topic) => (
                  <div key={topic.topicId ?? "none"} className="mt-1 pl-5">
                    <p className="font-medium">{topic.topicId ? topicName.get(topic.topicId) : "General"}</p>
                    <ul className="text-sm">
                      {topic.tasks.map((t) => (
                        <TaskRow key={t.id} task={t} label={taskLabel(t)} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}

            {reviews.length > 0 && (
              <div>
                <h2 className="flex items-center gap-2 font-bold">
                  <RotateCcw className="size-4 text-primary" aria-hidden /> REPASO
                </h2>
                <ul className="pl-5 text-sm">
                  {reviews.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      label={`${subjectLabel(t.subjectId)} ${t.topicId ? topicName.get(t.topicId) : ""} · ${taskLabel(t)}`}
                    />
                  ))}
                </ul>
              </div>
            )}

            {sims.length > 0 && (
              <div>
                <h2 className="flex items-center gap-2 font-bold">
                  <Timer className="size-4 text-primary" aria-hidden /> SIMULACRO
                </h2>
                <ul className="pl-5 text-sm">
                  {sims.map((t) => {
                    const a = ctx.assessments.find((x) => x.id === t.assessmentId);
                    return <TaskRow key={t.id} task={t} label={`${subjectLabel(t.subjectId)} ${a?.name ?? ""} · ${taskLabel(t)}`} />;
                  })}
                </ul>
              </div>
            )}

            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="font-bold">TOTAL</span>
              <span className="text-lg font-bold" aria-label={`Total ${minutesLabel(total)}`}>
                {minutesLabel(total)}
              </span>
            </div>
            {done > 0 && <p className="-mt-3 text-right text-sm text-muted">Hecho: {minutesLabel(done)}</p>}
          </section>
        )}

        {next ? (
          <Link
            href={`/sesion/${next.id}`}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-lg font-bold text-primary-foreground"
          >
            <Play className="size-5" aria-hidden />
            {next.status === "in_progress" ? "CONTINUAR SESIÓN" : "EMPEZAR SESIÓN"}
          </Link>
        ) : (
          tasks.length > 0 && (
            <p className="rounded-xl bg-success-soft px-4 py-4 text-center font-semibold text-success">¡Plan de hoy terminado!</p>
          )
        )}

        {upcoming.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Próximos exámenes</h2>
            <ul className="flex flex-col gap-2">
              {upcoming.map((a) => {
                const subject = subjectById.get(a.subjectId);
                return (
                  <li key={a.id}>
                    <Link
                      href={`/asignaturas/${a.subjectId}/evaluaciones/${a.id}`}
                      className={`${cardClass} flex items-center gap-3 p-4 hover:border-primary`}
                    >
                      <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: subject?.color }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {subject?.code ?? subject?.name} · {a.name}
                        </span>
                        <span className="block text-sm text-muted">{formatDateTime(a.examAt!, ctx.timezone)}</span>
                      </span>
                      <CountdownBadge days={daysUntil(a.examAt!, now, ctx.timezone)} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <Link href="/plan" className="text-center text-sm text-primary underline">
          Ver el plan de los próximos días
        </Link>
      </div>
    </>
  );
}
