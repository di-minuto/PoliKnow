import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, Check, Copy, Plus, Trash2, X } from "lucide-react";
import { QuestionBodyView } from "@/components/questions/question-body-view";
import { QuestionEditor } from "@/components/questions/question-editor";
import { RichText } from "@/components/questions/rich-text";
import { SourceBadge } from "@/components/questions/source-badge";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Disclosure } from "@/components/ui/disclosure";
import { buttonClass, cardClass } from "@/components/ui/styles";
import { REVIEW_STATUS_LABELS } from "@/domain/questions/schemas";
import {
  deleteQuestionAction,
  setQuestionArchivedAction,
  setQuestionReviewAction,
  updateQuestionAction,
} from "@/server/actions/questions";
import { getQuestion } from "@/server/repositories/questions";
import { loadQuestionOptions } from "@/server/question-options";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEVELS = ["", "muy baja", "baja", "media", "alta", "muy alta"];

async function load(id: string) {
  if (!UUID.test(id)) notFound();
  const q = await getQuestion(id);
  if (!q) notFound();
  return q;
}

export async function generateMetadata({ params }: PageProps<"/preguntas/[questionId]">): Promise<Metadata> {
  const q = await load((await params).questionId);
  return { title: q.stem.slice(0, 60) };
}

export default async function QuestionPage({ params, searchParams }: PageProps<"/preguntas/[questionId]">) {
  const { questionId } = await params;
  const { creada } = await searchParams;
  const [q, options] = await Promise.all([load(questionId), loadQuestionOptions()]);

  const subject = options.subjects.find((s) => s.id === q.subjectId);
  const topic = options.topics.find((t) => t.id === q.topicId);
  const exam = options.exams.find((e) => e.id === q.officialExamId);
  const document = options.documents.find((d) => d.id === q.documentId);
  const typeLabel = options.questionTypes.find((t) => t.code === q.questionType)?.label ?? q.questionType;
  const addAnother = exam
    ? `/preguntas/nueva?examen=${exam.id}`
    : `/preguntas/nueva?asignatura=${q.subjectId}${q.topicId ? `&tema=${q.topicId}` : ""}`;

  return (
    <>
      <header className="mb-6">
        <Link href={exam ? `/examenes/${exam.id}` : `/preguntas?asignatura=${q.subjectId}`} className="text-sm text-muted hover:underline">
          ← {exam ? exam.title : "Preguntas"}
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
          <SourceBadge
            source={q.sourceType}
            detail={exam ? `${exam.title}${q.officialPosition ? ` · nº ${q.officialPosition}` : ""}` : q.aiModel}
          />
          {q.reviewStatus !== "approved" && (
            <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
              {REVIEW_STATUS_LABELS[q.reviewStatus]}
            </span>
          )}
          {q.archived && <span className="rounded-full bg-border/60 px-2 py-0.5 text-xs">Archivada</span>}
          <span>{typeLabel}</span>
          <span>· dificultad {LEVELS[q.difficulty]}</span>
          {q.points !== null && <span>· {String(q.points).replace(".", ",")} ptos.</span>}
        </div>
      </header>

      {creada && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          Pregunta guardada.
          <Link href={addAnother} className={buttonClass.secondary}>
            <Plus className="size-4" aria-hidden />
            Añadir otra
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-6">
        <section className={`${cardClass} flex flex-col gap-4 p-5`}>
          <RichText text={q.stem} className="text-lg" />
          <QuestionBodyView question={q} />
          {q.explanation && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Explicación</p>
              <RichText text={q.explanation} />
            </div>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {subject && (
              <>
                <dt className="text-muted">Asignatura</dt>
                <dd>
                  <Link href={`/asignaturas/${subject.id}`} className="hover:underline">
                    {subject.label}
                  </Link>
                </dd>
              </>
            )}
            {topic && (
              <>
                <dt className="text-muted">Tema</dt>
                <dd>
                  {topic.name}
                  {q.subtopic ? ` · ${q.subtopic}` : ""}
                </dd>
              </>
            )}
            {(document || q.sourceRef) && (
              <>
                <dt className="text-muted">Origen</dt>
                <dd>
                  {document && (
                    <Link href={`/biblioteca/${document.id}`} className="text-primary underline">
                      {document.title}
                    </Link>
                  )}
                  {document && q.sourceRef && ", "}
                  {q.sourceRef}
                </dd>
              </>
            )}
            {q.tags.length > 0 && (
              <>
                <dt className="text-muted">Etiquetas</dt>
                <dd>{q.tags.join(", ")}</dd>
              </>
            )}
            {q.variantOf && (
              <>
                <dt className="text-muted">Variante de</dt>
                <dd>
                  <Link href={`/preguntas/${q.variantOf}`} className="text-primary underline">
                    pregunta original
                  </Link>
                </dd>
              </>
            )}
          </dl>
          {q.originalText && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">Texto literal del examen</summary>
              <p className="mt-2 whitespace-pre-line">{q.originalText}</p>
            </details>
          )}
        </section>

        {q.reviewStatus !== "approved" && (
          <section className={`${cardClass} flex flex-wrap items-center gap-3 p-4`}>
            <p className="flex-1 text-sm">Revísala antes de usarla en tests.</p>
            <form action={setQuestionReviewAction}>
              <input type="hidden" name="id" value={q.id} />
              <input type="hidden" name="reviewStatus" value="approved" />
              <SubmitButton>
                <Check className="size-4" aria-hidden />
                Aprobar
              </SubmitButton>
            </form>
            {q.reviewStatus === "draft" && (
              <form action={setQuestionReviewAction}>
                <input type="hidden" name="id" value={q.id} />
                <input type="hidden" name="reviewStatus" value="rejected" />
                <SubmitButton className={buttonClass.secondary}>
                  <X className="size-4" aria-hidden />
                  Descartar
                </SubmitButton>
              </form>
            )}
          </section>
        )}

        <Disclosure summary="Editar pregunta">
          <ActionForm action={updateQuestionAction} submitLabel="Guardar cambios" successMessage="Guardado.">
            <input type="hidden" name="id" value={q.id} />
            <QuestionEditor options={options} values={q} />
          </ActionForm>
        </Disclosure>

        <div className="flex flex-wrap gap-2">
          <Link href={`/preguntas/nueva?variante=${q.id}`} className={buttonClass.secondary}>
            <Copy className="size-4" aria-hidden />
            Crear variante
          </Link>
          <form action={setQuestionArchivedAction}>
            <input type="hidden" name="id" value={q.id} />
            <input type="hidden" name="archived" value={q.archived ? "false" : "true"} />
            <SubmitButton className={buttonClass.secondary}>
              {q.archived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
              {q.archived ? "Recuperar" : "Archivar"}
            </SubmitButton>
          </form>
          <form action={deleteQuestionAction}>
            <input type="hidden" name="id" value={q.id} />
            <ConfirmButton message="¿Borrar esta pregunta y su historial? No se puede deshacer.">
              <Trash2 className="size-4" aria-hidden />
              Borrar
            </ConfirmButton>
          </form>
        </div>
      </div>
    </>
  );
}
