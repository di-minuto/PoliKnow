import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, ExternalLink, Sparkles, Trash2 } from "lucide-react";
import { DocumentFields } from "@/components/documents/document-fields";
import { ExtractionBadge, formatSize } from "@/components/documents/document-meta";
import { DocumentAnalysis } from "@/components/ai/document-analysis";
import { OcrButton } from "@/components/documents/ocr-button";
import { ReprocessButton } from "@/components/documents/reprocess-button";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Disclosure } from "@/components/ui/disclosure";
import { buttonClass, cardClass } from "@/components/ui/styles";
import { locationLabel } from "@/domain/documents/schemas";
import { detectFormat } from "@/documents/format";
import { formatDateTime } from "@/lib/dates";
import { deleteDocumentAction, updateDocumentAction } from "@/server/actions/documents";
import { aiInfo } from "@/server/ai";
import { loadLibraryOptions } from "@/server/library-options";
import { getProfile } from "@/server/profile";
import { getDocument, listChunks, signedUrl } from "@/server/repositories/documents";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 20;

async function load(documentId: string) {
  if (!UUID.test(documentId)) notFound();
  const doc = await getDocument(documentId);
  if (!doc) notFound();
  return doc;
}

export async function generateMetadata({ params }: PageProps<"/biblioteca/[documentId]">): Promise<Metadata> {
  const doc = await load((await params).documentId);
  return { title: doc.title };
}

export default async function DocumentPage({ params, searchParams }: PageProps<"/biblioteca/[documentId]">) {
  const { documentId } = await params;
  const query = await searchParams;
  const doc = await load(documentId);

  // ?fragmento=N (desde la búsqueda) abre la página de texto que lo contiene.
  const target = Number(query.fragmento);
  const requestedFrom = Number(query.desde);
  const from = Number.isInteger(target) && target >= 0
    ? Math.floor(target / PAGE_SIZE) * PAGE_SIZE
    : Number.isInteger(requestedFrom) && requestedFrom >= 0
      ? requestedFrom
      : 0;

  const filename = doc.originalFilename ?? "archivo";
  const format = detectFormat(filename, doc.mimeType);
  const [options, profile, text, openUrl, downloadUrl] = await Promise.all([
    loadLibraryOptions(),
    getProfile(),
    listChunks(doc.id, from, PAGE_SIZE),
    signedUrl(doc.storagePath),
    signedUrl(doc.storagePath, filename),
  ]);
  const subject = options.subjects.find((s) => s.id === doc.subjectId);
  const typeLabel = options.types.find((t) => t.code === doc.documentType)?.label ?? doc.documentType;
  const topicNames = options.topics.filter((t) => doc.topicIds.includes(t.id)).map((t) => t.name);
  const assessmentNames = options.assessments.filter((a) => doc.assessmentIds.includes(a.id)).map((a) => a.name);
  const isSlides = format === "pptx";
  const ai = aiInfo();
  const hasText = (doc.chunkCount ?? text.total) > 0;
  const canOcr = format === "image" || (format === "pdf" && (doc.chunkCount === 0 || doc.ocr));

  return (
    <>
      <header className="mb-6">
        <Link href={`/biblioteca?asignatura=${doc.subjectId}`} className="text-sm text-muted hover:underline">
          ← Biblioteca
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight break-words">{doc.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-muted">
          {subject && (
            <Link href={`/asignaturas/${subject.id}`} className="inline-flex items-center gap-1 hover:underline">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: subject.color }} aria-hidden />
              {subject.label}
            </Link>
          )}
          <span>· {typeLabel}</span>
          {(doc.examSession || doc.year) && <span>· {[doc.examSession, doc.year].filter(Boolean).join(" ")}</span>}
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <section className={`${cardClass} flex flex-col gap-4 p-5`}>
          <div className="flex flex-wrap gap-2">
            {openUrl && (
              <a href={openUrl} target="_blank" rel="noopener noreferrer" className={buttonClass.primary}>
                <ExternalLink className="size-4" aria-hidden />
                Abrir
              </a>
            )}
            {downloadUrl && (
              <a href={downloadUrl} className={buttonClass.secondary}>
                <Download className="size-4" aria-hidden />
                Descargar
              </a>
            )}
          </div>
          {format === "image" && openUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- enlace firmado temporal del bucket privado
            <img src={openUrl} alt={doc.title} className="max-h-[70vh] w-auto rounded-lg border border-border object-contain" />
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Archivo</dt>
            <dd className="break-all">
              {filename}
              {doc.sizeBytes !== null && ` · ${formatSize(doc.sizeBytes)}`}
              {doc.pageCount !== null && ` · ${doc.pageCount} ${isSlides ? "diapositivas" : "páginas"}`}
            </dd>
            <dt className="text-muted">Subido</dt>
            <dd>{formatDateTime(doc.createdAt, profile.timezone)}</dd>
            {topicNames.length > 0 && (
              <>
                <dt className="text-muted">Temas</dt>
                <dd>{topicNames.join(", ")}</dd>
              </>
            )}
            {assessmentNames.length > 0 && (
              <>
                <dt className="text-muted">Evaluaciones</dt>
                <dd>{assessmentNames.join(", ")}</dd>
              </>
            )}
            {doc.notes && (
              <>
                <dt className="text-muted">Notas</dt>
                <dd className="whitespace-pre-line">{doc.notes}</dd>
              </>
            )}
          </dl>
        </section>

        {ai.enabled && (
          <DocumentAnalysis
            documentId={doc.id}
            analysis={doc.analysis}
            topicNames={new Map(options.topics.filter((t) => t.subjectId === doc.subjectId).map((t) => [t.id, t.name]))}
            assignedTopicIds={doc.topicIds}
            hasText={hasText}
          />
        )}
        {ai.enabled && hasText && (
          <Link href={`/preguntas/generar?asignatura=${doc.subjectId}&documento=${doc.id}`} className={`${buttonClass.secondary} self-start`}>
            <Sparkles className="size-4" aria-hidden />
            Generar preguntas de este documento
          </Link>
        )}

        <Disclosure summary="Editar datos">
          <ActionForm action={updateDocumentAction} successMessage="Guardado.">
            <input type="hidden" name="id" value={doc.id} />
            <DocumentFields
              options={options}
              showNotes
              values={{
                subjectId: doc.subjectId,
                documentType: doc.documentType,
                title: doc.title,
                year: doc.year,
                examSession: doc.examSession,
                notes: doc.notes,
                topicIds: doc.topicIds,
                assessmentIds: doc.assessmentIds,
              }}
            />
          </ActionForm>
        </Disclosure>

        <section aria-labelledby="texto" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="texto" className="text-lg font-semibold">
              Texto extraído
            </h2>
            <ExtractionBadge status={doc.extractionStatus} noText={doc.chunkCount === 0} />
          </div>
          {doc.extractionError && <p className="text-sm text-danger">{doc.extractionError}</p>}
          {format !== "image" && !doc.ocr && (
            <ReprocessButton
              documentId={doc.id}
              storagePath={doc.storagePath}
              filename={filename}
              mimeType={doc.mimeType}
            />
          )}
          {canOcr && (
            <OcrButton documentId={doc.id} storagePath={doc.storagePath} filename={filename} mimeType={doc.mimeType} pdf={format === "pdf"} />
          )}

          {text.chunks.length > 0 && (
            <ol className="flex flex-col gap-3">
              {text.chunks.map((c) => {
                const location = locationLabel(c.pageFrom, c.pageTo, isSlides);
                const highlighted = c.chunkIndex === target;
                return (
                  <li
                    key={c.id}
                    id={`fragmento-${c.chunkIndex}`}
                    className={`${cardClass} scroll-mt-20 p-4 ${highlighted ? "ring-2 ring-primary" : ""}`}
                  >
                    {(location || c.heading) && (
                      <p className="mb-2 text-xs font-medium text-muted">
                        {[location, c.heading].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="whitespace-pre-line text-sm leading-relaxed">{c.content}</p>
                  </li>
                );
              })}
            </ol>
          )}
          {text.total > PAGE_SIZE && (
            <nav aria-label="Páginas del texto" className="flex items-center justify-between gap-3 text-sm">
              {from > 0 ? (
                <Link href={`/biblioteca/${doc.id}?desde=${Math.max(0, from - PAGE_SIZE)}#texto`} className={buttonClass.secondary}>
                  Anterior
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted">
                {from + 1}–{Math.min(from + PAGE_SIZE, text.total)} de {text.total}
              </span>
              {from + PAGE_SIZE < text.total ? (
                <Link href={`/biblioteca/${doc.id}?desde=${from + PAGE_SIZE}#texto`} className={buttonClass.secondary}>
                  Siguiente
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </section>

        <form action={deleteDocumentAction}>
          <input type="hidden" name="id" value={doc.id} />
          <ConfirmButton message={`¿Borrar «${doc.title}» y su texto? No se puede deshacer.`}>
            <Trash2 className="size-4" aria-hidden />
            Borrar documento
          </ConfirmButton>
        </form>
      </div>
    </>
  );
}
