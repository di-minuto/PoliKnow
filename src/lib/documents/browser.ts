import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkPages } from "@/documents/chunking";
import { extractText, setPdfWorkerSrc } from "@/documents/extract";

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
    const chunks = chunkPages(extracted.pages);

    const removed = await supabase.from("document_chunks").delete().eq("document_id", doc.id);
    if (removed.error) throw new Error(removed.error.message);
    for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
      const batch = chunks.slice(i, i + INSERT_BATCH).map((c) => ({
        document_id: doc.id,
        chunk_index: c.chunkIndex,
        page_from: c.pageFrom,
        page_to: c.pageTo,
        heading: c.heading,
        content: c.content,
      }));
      const { error } = await supabase.from("document_chunks").insert(batch);
      if (error) throw new Error(`No se ha podido guardar el texto: ${error.message}`);
    }

    const noText = chunks.length === 0;
    await setStatus({
      extraction_status: "done",
      page_count: extracted.pageCount,
      extracted_at: new Date().toISOString(),
      metadata: noText
        ? { chunk_count: 0, extraction_error: "No se ha encontrado texto (¿es un escaneo? El OCR llegará con la IA)." }
        : { chunk_count: chunks.length },
    });
    return { status: "done", chunkCount: chunks.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al leer el archivo.";
    await setStatus({ extraction_status: "failed", metadata: { extraction_error: message } }).catch(() => {});
    return { status: "failed", chunkCount: 0, error: message };
  }
}
