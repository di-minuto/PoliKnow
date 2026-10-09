import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Plus, Trash2 } from "lucide-react";
import { ExamFields } from "@/components/questions/exam-fields";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Disclosure } from "@/components/ui/disclosure";
import { buttonClass, cardClass } from "@/components/ui/styles";
import { deleteOfficialExamAction, updateOfficialExamAction } from "@/server/actions/questions";
import { loadExamOptions } from "@/server/exam-options";
import { listQuestionTypes, getOfficialExam, listExamQuestions } from "@/server/repositories/questions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

async function load(id: string) {
  if (!UUID.test(id)) notFound();
  const exam = await getOfficialExam(id);
  if (!exam) notFound();
  return exam;
}

export async function generateMetadata({ params }: PageProps<"/examenes/[examId]">): Promise<Metadata> {
  return { title: (await load((await params).examId)).title };
}

export default async function ExamPage({ params }: PageProps<"/examenes/[examId]">) {
  const { examId } = await params;
  const exam = await load(examId);
  const [questions, options, types] = await Promise.all([listExamQuestions(exam.id), loadExamOptions(), listQuestionTypes()]);
  const subject = options.subjects.find((s) => s.id === exam.subjectId);
  const assessment = options.assessments.find((a) => a.id === exam.assessmentId);
  const docTitle = new Map(options.documents.map((d) => [d.id, d.title]));
  const typeLabel = new Map(types.map((t) => [t.code, t.label]));
  const pointsSum = questions.reduce((sum, q) => sum + (q.points ?? 0), 0);

  return (
    <>
      <header className="mb-6">
        <Link href="/examenes" className="text-sm text-muted hover:underline">
          ← Exámenes
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{exam.title}</h1>
        <p className="mt-1 text-muted">
          {[
            subject?.label,
            [exam.examSession, exam.year].filter(Boolean).join(" "),
            assessment?.name,
            exam.durationMinutes ? `${exam.durationMinutes} min` : null,
            exam.rules.wrongAnswerPenalty ? `resta ${fmt(exam.rules.wrongAnswerPenalty)} por fallo` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <div className="flex flex-col gap-6">
        {(exam.documentId || exam.solutionDocumentId) && (
          <div className="flex flex-wrap gap-2">
            {exam.documentId && (
              <Link href={`/biblioteca/${exam.documentId}`} className={buttonClass.secondary}>
                <FileText className="size-4" aria-hidden />
                Enunciado: {docTitle.get(exam.documentId) ?? "documento"}
              </Link>
            )}
            {exam.solutionDocumentId && (
              <Link href={`/biblioteca/${exam.solutionDocumentId}`} className={buttonClass.secondary}>
                <FileText className="size-4" aria-hidden />
                Soluciones: {docTitle.get(exam.solutionDocumentId) ?? "documento"}
              </Link>
            )}
          </div>
        )}

        <section aria-labelledby="preguntas">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="preguntas" className="text-lg font-semibold">
              Preguntas ({questions.length})
            </h2>
            <p className="text-sm text-muted">
              {fmt(pointsSum)}
              {exam.totalPoints !== null ? ` / ${fmt(exam.totalPoints)}` : ""} ptos.
            </p>
          </div>
          {exam.totalPoints !== null && questions.length > 0 && Math.abs(pointsSum - exam.totalPoints) > 0.001 && (
            <p className="mb-3 text-sm text-danger">Los puntos de las preguntas no suman el total del examen.</p>
          )}
          {questions.length > 0 && (
            <ol className={`${cardClass} mb-3 divide-y divide-border`}>
              {questions.map((q) => (
                <li key={q.id}>
                  <Link href={`/preguntas/${q.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-primary-soft/50">
                    <span className="w-7 shrink-0 font-semibold text-muted">{q.officialPosition ?? "–"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 whitespace-pre-line">{q.stem}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {typeLabel.get(q.questionType) ?? q.questionType}
                        {q.points !== null && ` · ${fmt(q.points)} ptos.`}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          <Link href={`/preguntas/nueva?examen=${exam.id}`} className={buttonClass.primary}>
            <Plus className="size-4" aria-hidden />
            Añadir pregunta
          </Link>
        </section>

        <Disclosure summary="Editar examen">
          <ActionForm action={updateOfficialExamAction} submitLabel="Guardar cambios" successMessage="Guardado.">
            <input type="hidden" name="id" value={exam.id} />
            <ExamFields options={options} values={exam} />
          </ActionForm>
        </Disclosure>

        <form action={deleteOfficialExamAction}>
          <input type="hidden" name="id" value={exam.id} />
          <ConfirmButton message={`¿Borrar «${exam.title}» y sus ${questions.length} preguntas? No se puede deshacer.`}>
            <Trash2 className="size-4" aria-hidden />
            Borrar examen y sus preguntas
          </ConfirmButton>
        </form>
      </div>
    </>
  );
}
