import "server-only";
import type { DocumentMetadataInput, NewDocumentInput } from "@/domain/documents/schemas";
import type {
  DocumentChunk,
  DocumentTypeEntry,
  ExtractionStatus,
  SearchResult,
  SearchResultKind,
  StudyDocument,
} from "@/domain/documents/types";
import { createClient } from "@/lib/supabase/server";
import { check } from "./academic";

/*
 * Biblioteca: documentos, sus vínculos con temas y evaluaciones, fragmentos
 * de texto y búsqueda global. El archivo vive en el bucket privado `documents`.
 */

export const DOCUMENTS_BUCKET = "documents";

type DocumentRow = {
  id: string;
  subject_id: string;
  document_type: string;
  title: string;
  storage_path: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  sha256: string | null;
  page_count: number | null;
  year: number | null;
  exam_session: string | null;
  notes: string | null;
  extraction_status: ExtractionStatus;
  metadata: { extraction_error?: string; chunk_count?: number; ocr?: boolean; ai_analysis?: DocumentAnalysisRecord } | null;
  created_at: string;
  document_topics: { topic_id: string }[];
  document_assessments: { assessment_id: string }[];
};

const DOCUMENT_COLUMNS =
  "id, subject_id, document_type, title, storage_path, original_filename, mime_type, size_bytes, sha256, page_count, year, exam_session, notes, extraction_status, metadata, created_at, document_topics(topic_id), document_assessments(assessment_id)";

/** Análisis con IA guardado en documents.metadata (no se vuelve a pedir). */
export type DocumentAnalysisRecord = {
  summary: string;
  concepts: string[];
  topicIds: string[];
  difficulty?: number;
  model: string;
  at: string;
};

export type LibraryDocument = StudyDocument & {
  notes: string | null;
  createdAt: string;
  extractionError: string | null;
  chunkCount: number | null;
  ocr: boolean;
  analysis: DocumentAnalysisRecord | null;
};

const toDocument = (r: DocumentRow): LibraryDocument => ({
  id: r.id,
  subjectId: r.subject_id,
  documentType: r.document_type,
  title: r.title,
  storagePath: r.storage_path,
  originalFilename: r.original_filename,
  mimeType: r.mime_type,
  sizeBytes: r.size_bytes,
  sha256: r.sha256,
  pageCount: r.page_count,
  year: r.year,
  examSession: r.exam_session,
  extractionStatus: r.extraction_status,
  topicIds: r.document_topics.map((t) => t.topic_id),
  assessmentIds: r.document_assessments.map((a) => a.assessment_id),
  notes: r.notes,
  createdAt: r.created_at,
  extractionError: r.metadata?.extraction_error ?? null,
  chunkCount: r.metadata?.chunk_count ?? null,
  ocr: r.metadata?.ocr ?? false,
  analysis: r.metadata?.ai_analysis ?? null,
});

// ---------------------------------------------------------------- lectura

export async function listDocumentTypes(): Promise<DocumentTypeEntry[]> {
  const db = await createClient();
  const rows = check<{ code: string; label: string; is_exam: boolean }[]>(
    "Listar tipos de documento",
    await db.from("document_types").select("code, label, is_exam").order("position"),
  );
  return rows.map((r) => ({ code: r.code, label: r.label, isExam: r.is_exam }));
}

export type DocumentFilters = { subjectId?: string; documentType?: string };

export async function listDocuments(filters: DocumentFilters = {}): Promise<LibraryDocument[]> {
  const db = await createClient();
  let query = db.from("documents").select(DOCUMENT_COLUMNS);
  if (filters.subjectId) query = query.eq("subject_id", filters.subjectId);
  if (filters.documentType) query = query.eq("document_type", filters.documentType);
  const rows = check<DocumentRow[]>(
    "Listar documentos",
    await query.order("year", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
  );
  return rows.map(toDocument);
}

export async function countDocuments(subjectId: string): Promise<number> {
  const db = await createClient();
  const { count, error } = await db
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("subject_id", subjectId);
  if (error) throw new Error(`Contar documentos: ${error.message}`);
  return count ?? 0;
}

export async function getDocument(id: string): Promise<LibraryDocument | null> {
  const db = await createClient();
  const rows = check<DocumentRow[]>(
    "Leer documento",
    await db.from("documents").select(DOCUMENT_COLUMNS).eq("id", id).limit(1),
  );
  return rows[0] ? toDocument(rows[0]) : null;
}

export async function findDocumentBySha(sha256: string): Promise<{ id: string; title: string } | null> {
  const db = await createClient();
  const rows = check<{ id: string; title: string }[]>(
    "Buscar duplicados",
    await db.from("documents").select("id, title").eq("sha256", sha256).limit(1),
  );
  return rows[0] ?? null;
}

export async function listChunks(documentId: string, from: number, limit: number) {
  const db = await createClient();
  const { data, error, count } = await db
    .from("document_chunks")
    .select("id, chunk_index, page_from, page_to, heading, content", { count: "exact" })
    .eq("document_id", documentId)
    .order("chunk_index")
    .range(from, from + limit - 1);
  if (error) throw new Error(`Leer texto: ${error.message}`);
  const chunks: DocumentChunk[] = (data ?? []).map((r) => ({
    id: r.id,
    chunkIndex: r.chunk_index,
    pageFrom: r.page_from,
    pageTo: r.page_to,
    heading: r.heading,
    content: r.content,
  }));
  return { chunks, total: count ?? chunks.length };
}

/** Enlace temporal (1 h) para abrir o descargar el archivo del bucket privado. */
export async function signedUrl(path: string, download?: string): Promise<string | null> {
  const db = await createClient();
  const { data, error } = await db.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, 3600, download ? { download } : undefined);
  if (error) {
    console.error("Enlace firmado:", error.message);
    return null;
  }
  return data.signedUrl;
}

type SearchRow = {
  kind: SearchResultKind;
  id: string;
  title: string;
  snippet: string;
  subject_id: string;
  document_id: string | null;
  chunk_index: number | null;
  page: number | null;
  page_to: number | null;
};

export async function searchAll(q: string, subjectId?: string): Promise<SearchResult[]> {
  const db = await createClient();
  const rows = check<SearchRow[]>(
    "Buscar",
    await db.rpc("search_all", { q, subject: subjectId ?? null, max_results: 60 }),
  );
  return rows.map((r) => ({
    kind: r.kind,
    id: r.id,
    title: r.title,
    snippet: r.snippet,
    subjectId: r.subject_id,
    documentId: r.document_id,
    chunkIndex: r.chunk_index,
    page: r.page,
    pageTo: r.page_to,
  }));
}

// ---------------------------------------------------------------- escritura

export async function createDocument(
  id: string,
  input: NewDocumentInput,
  storagePath: string,
  extractionStatus: ExtractionStatus,
): Promise<void> {
  const db = await createClient();
  check(
    "Crear documento",
    await db.from("documents").insert({
      id,
      subject_id: input.subjectId,
      document_type: input.documentType,
      title: input.title,
      storage_path: storagePath,
      original_filename: input.originalFilename,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      sha256: input.sha256,
      year: input.year,
      exam_session: input.examSession,
      notes: input.notes,
      extraction_status: extractionStatus,
    }),
  );
  await replaceDocumentLinks(id, input.topicIds, input.assessmentIds);
}

export async function updateDocument(id: string, input: DocumentMetadataInput): Promise<void> {
  const db = await createClient();
  check(
    "Actualizar documento",
    await db
      .from("documents")
      .update({
        subject_id: input.subjectId,
        document_type: input.documentType,
        title: input.title,
        year: input.year,
        exam_session: input.examSession,
        notes: input.notes,
      })
      .eq("id", id),
  );
  await replaceDocumentLinks(id, input.topicIds, input.assessmentIds);
}

async function replaceDocumentLinks(documentId: string, topicIds: string[], assessmentIds: string[]) {
  const db = await createClient();
  check("Quitar temas", await db.from("document_topics").delete().eq("document_id", documentId));
  check("Quitar evaluaciones", await db.from("document_assessments").delete().eq("document_id", documentId));
  if (topicIds.length) {
    check(
      "Vincular temas",
      await db.from("document_topics").insert(topicIds.map((topic_id) => ({ document_id: documentId, topic_id }))),
    );
  }
  if (assessmentIds.length) {
    check(
      "Vincular evaluaciones",
      await db
        .from("document_assessments")
        .insert(assessmentIds.map((assessment_id) => ({ document_id: documentId, assessment_id }))),
    );
  }
}

/** Guarda el análisis de IA sin tocar el resto de metadata. */
export async function saveDocumentAnalysis(id: string, analysis: DocumentAnalysisRecord): Promise<void> {
  const db = await createClient();
  const current = check<{ metadata: Record<string, unknown> | null }[]>(
    "Leer documento",
    await db.from("documents").select("metadata").eq("id", id).limit(1),
  );
  check(
    "Guardar análisis",
    await db.from("documents").update({ metadata: { ...(current[0]?.metadata ?? {}), ai_analysis: analysis } }).eq("id", id),
  );
}

/** Añade temas al documento (sin quitar los que ya tenía). */
export async function addDocumentTopics(documentId: string, topicIds: string[]): Promise<void> {
  if (topicIds.length === 0) return;
  const db = await createClient();
  check(
    "Vincular temas",
    await db
      .from("document_topics")
      .upsert(topicIds.map((topic_id) => ({ document_id: documentId, topic_id })), { onConflict: "document_id,topic_id", ignoreDuplicates: true }),
  );
}

/** Borra el archivo de Storage y la fila (los fragmentos y vínculos caen en cascada). */
export async function deleteDocument(id: string): Promise<void> {
  const db = await createClient();
  const rows = check<{ storage_path: string }[]>(
    "Leer documento",
    await db.from("documents").select("storage_path").eq("id", id).limit(1),
  );
  if (!rows[0]) return;
  const { error } = await db.storage.from(DOCUMENTS_BUCKET).remove([rows[0].storage_path]);
  // Si el archivo ya no existe no pasa nada; cualquier otro fallo se registra y se sigue.
  if (error) console.error("Borrar archivo:", error.message);
  check("Borrar documento", await db.from("documents").delete().eq("id", id));
}
