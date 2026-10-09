import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkPages } from "@/documents/chunking";
import { extractText, setPdfWorkerSrc } from "@/documents/extract";
import type { ExtractedPage } from "@/documents/types";
import { ocrDocument, type OcrProgress } from "./ocr";

/*
 * Trabajo que se hace en el navegador: huella del archivo y lectura del texto.
 * Así el archivo no pasa por el servidor y no se gasta nada en procesarlo.
 */

const BUCKET = "documents";
const INSERT_BATCH = 100;

setPdfWorkerSrc("/pdfjs/pdf.worker.min.mjs");

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Se envía el contenido tal cual (no multipart), con su tipo MIME. */
export async function uploadFile(
  supabase: SupabaseClient,
  storagePath: string,
  data: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, data, { contentType, upsert: false });
  if (error) throw new Error(`No se ha podido subir el archivo: ${error.message}`);
}

export async function downloadFile(supabase: SupabaseClient, storagePath: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) throw new Error(`No se ha podido descargar el archivo: ${error?.message ?? "vacío"}`);
  return data.arrayBuffer();
}

/** Sustituye los fragmentos del documento por los de estas páginas. */
async function saveChunks(supabase: SupabaseClient, documentId: string, pages: ExtractedPage[]): Promise<number> {
  const chunks = chunkPages(pages);
  const removed = await supabase.from("document_chunks").delete().eq("document_id", documentId);
  if (removed.error) throw new Error(removed.error.message);
  for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
    const batch = chunks.slice(i, i + INSERT_BATCH).map((c) => ({
      document_id: documentId,
      chunk_index: c.chunkIndex,
      page_from: c.pageFrom,
      page_to: c.pageTo,
      heading: c.heading,
      content: c.content,
    }));
    const { error } = await supabase.from("document_chunks").insert(batch);
    if (error) throw new Error(`No se ha podido guardar el texto: ${error.message}`);
  }
  return chunks.length;
}

export type ProcessResult = { status: "done" | "failed" | "not_applicable"; chunkCount: number; error?: string };

/**
 * Lee el texto del documento, lo trocea y lo guarda en document_chunks
 * (sustituyendo lo que hubiera). El estado queda anotado en el documento.
 */
export async function processDocumentText(
  supabase: SupabaseClient,
  doc: { id: string; filename: string; mimeType: string | null; data: ArrayBuffer },
): Promise<ProcessResult> {
  const setStatus = async (fields: Record<string, unknown>) => {
    const { error } = await supabase.from("documents").update(fields).eq("id", doc.id);
    if (error) throw new Error(`No se ha podido actualizar el documento: ${error.message}`);
  };

  await setStatus({ extraction_status: "processing" });
  try {
    const extracted = await extractText(doc.filename, doc.mimeType, doc.data);
    if (!extracted) {
      await setStatus({ extraction_status: "not_applicable", metadata: {} });
      return { status: "not_applicable", chunkCount: 0 };
    }
    const count = await saveChunks(supabase, doc.id, extracted.pages);
    await setStatus({
      extraction_status: "done",
      page_count: extracted.pageCount,
      extracted_at: new Date().toISOString(),
      metadata: count === 0
        ? { chunk_count: 0, extraction_error: "No se ha encontrado texto. Si es un escaneo, usa «Reconocer texto (OCR)»." }
        : { chunk_count: count },
    });
    return { status: "done", chunkCount: count };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al leer el archivo.";
    await setStatus({ extraction_status: "failed", metadata: { extraction_error: message } }).catch(() => {});
    return { status: "failed", chunkCount: 0, error: message };
  }
}

/** Reconoce el texto con OCR (escaneos e imágenes) y lo guarda como el de cualquier documento. */
export async function ocrDocumentText(
  supabase: SupabaseClient,
  doc: { id: string; filename: string; mimeType: string | null; data: ArrayBuffer },
  onProgress?: (p: OcrProgress) => void,
): Promise<ProcessResult> {
  const { error: statusError } = await supabase.from("documents").update({ extraction_status: "processing" }).eq("id", doc.id);
  if (statusError) throw new Error(statusError.message);
  try {
    const extracted = await ocrDocument(doc.filename, doc.mimeType, doc.data, onProgress);
    const count = await saveChunks(supabase, doc.id, extracted.pages);
    await supabase
      .from("documents")
      .update({
        extraction_status: "done",
        page_count: extracted.pageCount,
        extracted_at: new Date().toISOString(),
        metadata: count === 0 ? { chunk_count: 0, ocr: true, extraction_error: "El OCR no ha encontrado texto legible." } : { chunk_count: count, ocr: true },
      })
      .eq("id", doc.id);
    return { status: "done", chunkCount: count };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido en el OCR.";
    await supabase.from("documents").update({ extraction_status: "failed", metadata: { extraction_error: `OCR: ${message}` } }).eq("id", doc.id);
    return { status: "failed", chunkCount: 0, error: message };
  }
}
