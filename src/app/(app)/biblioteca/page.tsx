import type { Metadata } from "next";
import Link from "next/link";
import { FileUp, Search } from "lucide-react";
import { ExtractionBadge, formatIcon, formatSize } from "@/components/documents/document-meta";
import { PageHeader } from "@/components/layout/page-header";
import { SelectNav } from "@/components/ui/select-nav";
import { buttonClass, cardClass } from "@/components/ui/styles";
import { loadLibraryOptions } from "@/server/library-options";
import { listDocuments } from "@/server/repositories/documents";

export const metadata: Metadata = { title: "Biblioteca" };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

function href(params: { asignatura?: string; tipo?: string; tema?: string }) {
  const search = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
  const query = search.toString();
  return query ? `/biblioteca?${query}` : "/biblioteca";
}

const chip = (active: boolean) =>
  `shrink-0 rounded-full border px-3 py-1.5 text-sm ${
    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface"
  }`;

export default async function LibraryPage({ searchParams }: PageProps<"/biblioteca">) {
  const params = await searchParams;
  const options = await loadLibraryOptions();
  const subjectId = options.subjects.some((s) => s.id === one(params.asignatura)) ? one(params.asignatura) : undefined;
  const type = options.types.some((t) => t.code === one(params.tipo)) ? one(params.tipo) : undefined;
  const topicId = subjectId ? one(params.tema) : undefined;

  const all = await listDocuments({ subjectId, documentType: type });
  const documents = topicId ? all.filter((d) => d.topicIds.includes(topicId)) : all;

  const subjectById = new Map(options.subjects.map((s) => [s.id, s]));
  const typeLabel = new Map(options.types.map((t) => [t.code, t.label]));
  const topics = options.topics.filter((t) => t.subjectId === subjectId);
  const filtered = Boolean(subjectId || type || topicId);

  return (
    <>
      <PageHeader
        title="Biblioteca"
        subtitle="Teoría, apuntes, ejercicios y exámenes de cada asignatura."
        actions={
          <Link href={subjectId ? `/biblioteca/subir?asignatura=${subjectId}` : "/biblioteca/subir"} className={buttonClass.primary}>
            <FileUp className="size-4" aria-hidden />
            Subir
          </Link>
        }
      />

      <nav aria-label="Filtrar por asignatura" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={href({ tipo: type })} className={chip(!subjectId)}>
          Todas
        </Link>
        {options.subjects.map((s) => (
          <Link key={s.id} href={href({ asignatura: s.id, tipo: type })} className={chip(s.id === subjectId)}>
            {s.label.split(" · ")[0]}
          </Link>
        ))}
      </nav>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <SelectNav
          label="Tipo de documento"
          value={type ?? ""}
          options={[
            { value: "", label: "Todos los tipos", href: href({ asignatura: subjectId, tema: topicId }) },
            ...options.types.map((t) => ({
              value: t.code,
              label: t.label,
              href: href({ asignatura: subjectId, tipo: t.code, tema: topicId }),
            })),
          ]}
        />
        {subjectId && topics.length > 0 && (
          <SelectNav
            label="Tema"
            value={topicId ?? ""}
            options={[
              { value: "", label: "Todos los temas", href: href({ asignatura: subjectId, tipo: type }) },
              ...topics.map((t) => ({
                value: t.id,
                label: `${"  ".repeat(t.depth)}${t.name}`,
                href: href({ asignatura: subjectId, tipo: type, tema: t.id }),
              })),
            ]}
          />
        )}
      </div>

      {documents.length === 0 ? (
        <div className={`${cardClass} flex flex-col items-start gap-3 p-5`}>
          <p className="text-muted">
            {filtered ? "No hay documentos con estos filtros." : "Aún no has subido ningún documento."}
          </p>
          {!filtered && (
            <Link href="/biblioteca/subir" className={buttonClass.secondary}>
              Subir el primero
            </Link>
          )}
        </div>
      ) : (
        <ul className={`${cardClass} divide-y divide-border`} aria-label="Documentos">
          {documents.map((d) => {
            const Icon = formatIcon(d.originalFilename, d.mimeType);
            const subject = subjectById.get(d.subjectId);
            const details = [
              typeLabel.get(d.documentType),
              [d.examSession, d.year].filter(Boolean).join(" ") || null,
              d.pageCount ? `${d.pageCount} pág.` : null,
              formatSize(d.sizeBytes),
            ].filter(Boolean);
            return (
              <li key={d.id}>
                <Link href={`/biblioteca/${d.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-primary-soft/50">
                  <Icon className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{d.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                      {subject && !subjectId && (
                        <span className="inline-flex items-center gap-1">
                          <span className="size-2 rounded-full" style={{ backgroundColor: subject.color }} aria-hidden />
                          {subject.label.split(" · ")[0]}
                        </span>
                      )}
                      {details.join(" · ")}
                    </p>
                  </div>
                  <ExtractionBadge status={d.extractionStatus} noText={d.chunkCount === 0} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-sm text-muted">
        <Link href="/buscar" className="inline-flex items-center gap-1 text-primary underline">
          <Search className="size-4" aria-hidden />
          Buscar dentro de los documentos
        </Link>
      </p>
    </>
  );
}
