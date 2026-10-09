import type { Metadata } from "next";
import Link from "next/link";
import { FileJson, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SourceBadge } from "@/components/questions/source-badge";
import { SelectNav } from "@/components/ui/select-nav";
import { buttonClass, cardClass, inputClass } from "@/components/ui/styles";
import { descendantIds } from "@/domain/academic/logic";
import { REVIEW_STATUS_LABELS } from "@/domain/questions/schemas";
import { SOURCE_TYPES, SOURCE_TYPE_LABELS, type SourceType } from "@/domain/questions/types";
import { listTopics } from "@/server/repositories/academic";
import { QUESTIONS_PAGE_SIZE, listQuestions } from "@/server/repositories/questions";
import { loadQuestionOptions } from "@/server/question-options";

export const metadata: Metadata = { title: "Preguntas" };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v.trim() : undefined);

type Params = { asignatura?: string; tipo?: string; fuente?: string; tema?: string; estado?: string; q?: string; archivadas?: string; pagina?: string };

function href(p: Params) {
  const search = new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => Boolean(e[1])));
  const query = search.toString();
  return query ? `/preguntas?${query}` : "/preguntas";
}

const chip = (active: boolean) =>
  `shrink-0 rounded-full border px-3 py-1.5 text-sm ${
    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface"
  }`;

export default async function QuestionsPage({ searchParams }: PageProps<"/preguntas">) {
  const raw = await searchParams;
  const options = await loadQuestionOptions();
  const subjectId = options.subjects.some((s) => s.id === one(raw.asignatura)) ? one(raw.asignatura) : undefined;
  const type = options.questionTypes.some((t) => t.code === one(raw.tipo)) ? one(raw.tipo) : undefined;
  const source = (SOURCE_TYPES as readonly string[]).includes(one(raw.fuente) ?? "") ? (one(raw.fuente) as SourceType) : undefined;
  const topicId = subjectId && options.topics.some((t) => t.id === one(raw.tema) && t.subjectId === subjectId) ? one(raw.tema) : undefined;
  const pending = one(raw.estado) === "revisar";
  const archived = one(raw.archivadas) === "1";
  const text = one(raw.q)?.slice(0, 200);
  const page = Math.max(0, Number(one(raw.pagina) ?? 0) || 0);
  const current: Params = {
    asignatura: subjectId,
    tipo: type,
    fuente: source,
    tema: topicId,
    estado: pending ? "revisar" : undefined,
    q: text,
    archivadas: archived ? "1" : undefined,
  };

  // Un tema incluye sus subtemas.
  const topicIds = topicId && subjectId ? [...descendantIds(await listTopics(subjectId), topicId)] : undefined;
  const { questions, total } = await listQuestions(
    {
      subjectId,
      questionType: type,
      sourceType: source,
      topicIds,
      reviewStatus: pending ? "draft" : undefined,
      archived,
      text,
    },
    page,
  );

  const subjectById = new Map(options.subjects.map((s) => [s.id, s]));
  const typeLabel = new Map(options.questionTypes.map((t) => [t.code, t.label]));
  const topicName = new Map(options.topics.map((t) => [t.id, t.name]));
  const examTitle = new Map(options.exams.map((e) => [e.id, e.title]));
  const topics = options.topics.filter((t) => t.subjectId === subjectId);
  const pages = Math.ceil(total / QUESTIONS_PAGE_SIZE);
  const filtered = Object.values(current).some(Boolean);

  return (
    <>
      <PageHeader
        title="Preguntas"
        subtitle={`${total} ${total === 1 ? "pregunta" : "preguntas"}${filtered ? " con estos filtros" : ""}`}
        actions={
          <Link href={subjectId ? `/preguntas/nueva?asignatura=${subjectId}${topicId ? `&tema=${topicId}` : ""}` : "/preguntas/nueva"} className={buttonClass.primary}>
            <Plus className="size-4" aria-hidden />
            Nueva
          </Link>
        }
      />

      <nav aria-label="Filtrar por asignatura" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={href({ ...current, asignatura: undefined, tema: undefined })} className={chip(!subjectId)}>
          Todas
        </Link>
        {options.subjects.map((s) => (
          <Link key={s.id} href={href({ ...current, asignatura: s.id, tema: undefined })} className={chip(s.id === subjectId)}>
            {s.label.split(" · ")[0]}
          </Link>
        ))}
      </nav>

      <form role="search" action="/preguntas" className="mb-3 flex gap-2">
        {Object.entries(current)
          .filter(([k, v]) => v && k !== "q")
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <input type="search" name="q" defaultValue={text} placeholder="Buscar en los enunciados" aria-label="Buscar en los enunciados" className={inputClass} />
        <button type="submit" className={buttonClass.secondary} aria-label="Buscar">
          <Search className="size-4" aria-hidden />
        </button>
      </form>

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <SelectNav
          label="Tipo de pregunta"
          value={type ?? ""}
          options={[
            { value: "", label: "Todos los tipos", href: href({ ...current, tipo: undefined }) },
            ...options.questionTypes.map((t) => ({ value: t.code, label: t.label, href: href({ ...current, tipo: t.code }) })),
          ]}
        />
        <SelectNav
          label="Procedencia"
          value={source ?? ""}
          options={[
            { value: "", label: "Cualquier procedencia", href: href({ ...current, fuente: undefined }) },
            ...SOURCE_TYPES.map((s) => ({ value: s, label: SOURCE_TYPE_LABELS[s], href: href({ ...current, fuente: s }) })),
          ]}
        />
        {subjectId && topics.length > 0 && (
          <SelectNav
            label="Tema"
            value={topicId ?? ""}
            options={[
              { value: "", label: "Todos los temas", href: href({ ...current, tema: undefined }) },
              ...topics.map((t) => ({
                value: t.id,
                label: `${"  ".repeat(t.depth)}${t.name}`,
                href: href({ ...current, tema: t.id }),
              })),
            ]}
          />
        )}
      </div>

      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        <Link href={href({ ...current, estado: pending ? undefined : "revisar" })} className={chip(pending)}>
          {REVIEW_STATUS_LABELS.draft}
        </Link>
        <Link href={href({ ...current, archivadas: archived ? undefined : "1" })} className={chip(archived)}>
          Archivadas
        </Link>
        <Link href="/preguntas/importar" className="ml-auto inline-flex items-center gap-1 px-1 py-1.5 text-primary underline">
          <FileJson className="size-4" aria-hidden />
          Importar JSON
        </Link>
      </div>

      {questions.length === 0 ? (
        <div className={`${cardClass} flex flex-col items-start gap-3 p-5`}>
          <p className="text-muted">
            {filtered ? "No hay preguntas con estos filtros." : "Aún no hay preguntas. Escríbelas a mano o impórtalas desde un JSON."}
          </p>
        </div>
      ) : (
        <ul className={`${cardClass} divide-y divide-border`} aria-label="Lista de preguntas">
          {questions.map((q) => {
            const subject = subjectById.get(q.subjectId);
            return (
              <li key={q.id}>
                <Link href={`/preguntas/${q.id}`} className="block px-4 py-3 hover:bg-primary-soft/50">
                  <p className="line-clamp-3 whitespace-pre-line">{q.stem}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <SourceBadge
                      source={q.sourceType}
                      detail={q.officialExamId ? examTitle.get(q.officialExamId) : null}
                    />
                    {q.reviewStatus !== "approved" && (
                      <span className="rounded-full bg-danger-soft px-2 py-0.5 font-medium text-danger">
                        {REVIEW_STATUS_LABELS[q.reviewStatus]}
                      </span>
                    )}
                    <span>{typeLabel.get(q.questionType) ?? q.questionType}</span>
                    {subject && !subjectId && <span>· {subject.label.split(" · ")[0]}</span>}
                    {q.topicId && <span>· {topicName.get(q.topicId)}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Páginas" className="mt-4 flex items-center justify-between text-sm">
          {page > 0 ? (
            <Link href={href({ ...current, pagina: String(page - 1) })} className={buttonClass.secondary}>
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Página {page + 1} de {pages}
          </span>
          {page + 1 < pages ? (
            <Link href={href({ ...current, pagina: String(page + 1) })} className={buttonClass.secondary}>
              Siguiente
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
