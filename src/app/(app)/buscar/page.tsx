import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, FileText, FolderTree, Search } from "lucide-react";
import { Highlighted } from "@/components/documents/highlighted";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClass, cardClass, inputClass } from "@/components/ui/styles";
import { locationLabel } from "@/domain/documents/schemas";
import type { SearchResult } from "@/domain/documents/types";
import { detectFormat } from "@/documents/format";
import { loadLibraryOptions } from "@/server/library-options";
import { listDocuments, searchAll } from "@/server/repositories/documents";

export const metadata: Metadata = { title: "Buscar" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

function resultHref(r: SearchResult): string {
  switch (r.kind) {
    case "chunk":
      return `/biblioteca/${r.documentId}?fragmento=${r.chunkIndex}#fragmento-${r.chunkIndex}`;
    case "document":
      return `/biblioteca/${r.id}`;
    case "topic":
      return `/asignaturas/${r.subjectId}`;
    case "question":
      return `/preguntas/${r.id}`;
  }
}

export default async function SearchPage({ searchParams }: PageProps<"/buscar">) {
  const params = await searchParams;
  const q = one(params.q).slice(0, 200);
  const options = await loadLibraryOptions();
  const subjectId = options.subjects.some((s) => s.id === one(params.asignatura)) ? one(params.asignatura) : "";

  const [results, documents] = q
    ? await Promise.all([searchAll(q, subjectId || undefined), listDocuments({ subjectId: subjectId || undefined })])
    : [[], []];
  const subjectById = new Map(options.subjects.map((s) => [s.id, s]));
  const formatByDocument = new Map(documents.map((d) => [d.id, detectFormat(d.originalFilename ?? "", d.mimeType)]));

  // Documentos: coincidencias en el título o en el texto (hasta 3 fragmentos por documento).
  const inDocuments = results.filter((r) => r.kind === "chunk" || r.kind === "document");
  const questions = results.filter((r) => r.kind === "question");
  const topics = results.filter((r) => r.kind === "topic");
  const total = results.length;

  const subjectTag = (id: string) => {
    const s = subjectById.get(id);
    return s ? (
      <span className="inline-flex items-center gap-1">
        <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
        {s.label.split(" · ")[0]}
      </span>
    ) : null;
  };

  return (
    <>
      <PageHeader title="Buscar" subtitle="En el texto de tus documentos, sus títulos, preguntas y temas." />

      <form role="search" action="/buscar" className="mb-6 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Ej.: cláusula reduction, semáforos…"
          aria-label="Qué buscas"
          className={inputClass}
          autoFocus={!q}
        />
        <select name="asignatura" defaultValue={subjectId} aria-label="Asignatura" className={`${inputClass} sm:w-56`}>
          <option value="">Todas las asignaturas</option>
          {options.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonClass.primary}>
          <Search className="size-4" aria-hidden />
          Buscar
        </button>
      </form>

      {q && total === 0 && (
        <p className={`${cardClass} p-5 text-muted`}>
          No hay resultados para «{q}». Prueba con menos palabras o con «comillas» para una frase exacta.
        </p>
      )}

      <div className="flex flex-col gap-8">
        {inDocuments.length > 0 && (
          <section aria-labelledby="r-docs">
            <h2 id="r-docs" className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <FileText className="size-5 text-muted" aria-hidden />
              Documentos
            </h2>
            <ul className={`${cardClass} divide-y divide-border`}>
              {inDocuments.map((r) => {
                const isSlides = formatByDocument.get(r.documentId ?? "") === "pptx";
                const location = r.kind === "chunk" ? locationLabel(r.page, r.pageTo, isSlides) : null;
                return (
                  <li key={`${r.kind}-${r.id}`}>
                    <Link href={resultHref(r)} className="block px-4 py-3 hover:bg-primary-soft/50">
                      <p className="font-medium">{r.title}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
                        {subjectTag(r.subjectId)}
                        {location && <span>· {location}</span>}
                        {r.kind === "document" && <span>· coincide el título</span>}
                      </p>
                      {r.kind === "chunk" && (
                        <p className="mt-1 text-sm leading-relaxed">
                          <Highlighted snippet={r.snippet} />
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {topics.length > 0 && (
          <section aria-labelledby="r-topics">
            <h2 id="r-topics" className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <FolderTree className="size-5 text-muted" aria-hidden />
              Temas
            </h2>
            <ul className={`${cardClass} divide-y divide-border`}>
              {topics.map((r) => (
                <li key={r.id}>
                  <Link href={resultHref(r)} className="block px-4 py-3 hover:bg-primary-soft/50">
                    <p className="font-medium">{r.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{subjectTag(r.subjectId)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {questions.length > 0 && (
          <section aria-labelledby="r-questions">
            <h2 id="r-questions" className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <BookOpen className="size-5 text-muted" aria-hidden />
              Preguntas
            </h2>
            <ul className={`${cardClass} divide-y divide-border`}>
              {questions.map((r) => (
                <li key={r.id}>
                  <Link href={resultHref(r)} className="block px-4 py-3 hover:bg-primary-soft/50">
                    <p className="text-sm leading-relaxed">
                      <Highlighted snippet={r.snippet} />
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{subjectTag(r.subjectId)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
