import "server-only";
import type { SourceExcerpt } from "@/ai/prompts";
import { searchQuery } from "@/domain/assistant/retrieval";
import { locationLabel } from "@/domain/documents/schemas";
import { createClient } from "@/lib/supabase/server";
import { check } from "@/server/repositories/academic";

/*
 * Material de los documentos del usuario que se pasa a la IA como fuente.
 * Sin embeddings: búsqueda de texto completo de Postgres (gratis).
 */

export type Source = SourceExcerpt & {
  documentId: string;
  chunkIndex: number;
  page: number | null;
};

type ChunkRow = {
  document_id: string;
  chunk_index: number;
  page_from: number | null;
  page_to: number | null;
  content: string;
  documents: { title: string; original_filename: string | null } | null;
};

const CHUNK_SELECT = "document_id, chunk_index, page_from, page_to, content, documents(title, original_filename)";

function toSource(r: ChunkRow): Source {
  const slides = /\.pptx$/i.test(r.documents?.original_filename ?? "");
  return {
    documentId: r.document_id,
    chunkIndex: r.chunk_index,
    page: r.page_from,
    title: r.documents?.title ?? "Documento",
    location: locationLabel(r.page_from, r.page_to, slides)?.toLowerCase() ?? null,
    text: r.content,
  };
}

/** Une fragmentos consecutivos hasta llenar el presupuesto de caracteres. */
function fit(sources: Source[], maxChars: number): Source[] {
  const out: Source[] = [];
  let used = 0;
  for (const s of sources) {
    if (used + s.text.length > maxChars && out.length > 0) break;
    out.push(s);
    used += s.text.length;
  }
  return out;
}

/** Fragmentos más relevantes para una pregunta, con su texto completo. */
export async function searchSources(
  question: string,
  opts: { subjectId?: string | null; documentIds?: string[]; limit?: number; maxChars?: number } = {},
): Promise<Source[]> {
  const q = searchQuery(question);
  if (!q) return [];
  const db = await createClient();
  const hits = check<{ kind: string; id: string; document_id: string | null }[]>(
    "Buscar fuentes",
    await db.rpc("search_all", { q, subject: opts.subjectId ?? null, max_results: 40 }),
  )
    .filter((h) => h.kind === "chunk" && (!opts.documentIds || opts.documentIds.includes(h.document_id ?? "")))
    .slice(0, opts.limit ?? 6);
  if (hits.length === 0) return [];
  const rows = check<(ChunkRow & { id: string })[]>(
    "Leer fuentes",
    // Relación muchos-a-uno: PostgREST devuelve un objeto (sin tipos generados).
    (await db.from("document_chunks").select(`id, ${CHUNK_SELECT}`).in("id", hits.map((h) => h.id))) as never,
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = hits.map((h) => byId.get(h.id)).filter((r): r is ChunkRow & { id: string } => Boolean(r));
  return fit(ordered.map(toSource), opts.maxChars ?? 9000);
}

/** Texto de un documento desde el principio (o desde los fragmentos que traten el tema). */
export async function documentSources(documentId: string, opts: { focus?: string | null; maxChars?: number } = {}) {
  const maxChars = opts.maxChars ?? 9000;
  if (opts.focus) {
    const focused = await searchSources(opts.focus, { documentIds: [documentId], limit: 8, maxChars });
    if (focused.length > 0) return focused;
  }
  const db = await createClient();
  const rows = check<ChunkRow[]>(
    "Leer documento",
    (await db.from("document_chunks").select(CHUNK_SELECT).eq("document_id", documentId).order("chunk_index").limit(40)) as never,
  );
  return fit(rows.map(toSource), maxChars);
}

/** Fragmentos de los documentos asociados a un tema. */
export async function topicSources(topicId: string, topicName: string, subjectId: string, maxChars = 9000) {
  const db = await createClient();
  const links = check<{ document_id: string }[]>(
    "Documentos del tema",
    await db.from("document_topics").select("document_id").eq("topic_id", topicId),
  );
  const documentIds = links.map((l) => l.document_id);
  // «Tema 2: OpenMP» → «OpenMP»: el número no ayuda a buscar.
  const focus = topicName.replace(/^\s*(tema|unidad|bloque|pr[aá]ctica|lecci[oó]n)\s*\d+\s*[:.\-–]?\s*/i, "") || topicName;
  const found = await searchSources(focus, { subjectId, documentIds: documentIds.length ? documentIds : undefined, limit: 8, maxChars });
  if (found.length > 0 || documentIds.length === 0) return found;
  return documentSources(documentIds[0], { maxChars });
}
