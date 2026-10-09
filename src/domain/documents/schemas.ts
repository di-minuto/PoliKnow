import { z } from "zod";
import { emptyToNull, id, optionalInt, optionalText, requiredText } from "@/domain/academic/schemas";
import { MAX_UPLOAD_BYTES, type ExtractionStatus } from "./types";

/** Datos editables de un documento (subida y ficha). */
export const documentMetadataInput = z.object({
  subjectId: id,
  documentType: z.string({ error: "Elige el tipo de documento." }).trim().min(1, "Elige el tipo de documento."),
  title: requiredText(200, "El título"),
  year: optionalInt(1990, 2100),
  examSession: optionalText(40),
  notes: optionalText(2000),
  topicIds: z.array(id).max(200).default([]),
  assessmentIds: z.array(id).max(50).default([]),
});
export type DocumentMetadataInput = z.infer<typeof documentMetadataInput>;

/** Lo que el navegador envía antes de subir el archivo a Storage. */
export const newDocumentInput = documentMetadataInput.extend({
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.preprocess(emptyToNull, z.string().max(200).nullable().default(null)),
  sizeBytes: z
    .number()
    .int()
    .min(1, "El archivo está vacío.")
    .max(MAX_UPLOAD_BYTES, `El archivo supera el máximo de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "Huella del archivo no válida."),
});
export type NewDocumentInput = z.infer<typeof newDocumentInput>;

/** Lee el formulario de la ficha: casillas `topic` y `assessment`. */
export function readDocumentForm(formData: FormData) {
  return {
    subjectId: formData.get("subjectId"),
    documentType: formData.get("documentType"),
    title: formData.get("title"),
    year: formData.get("year"),
    examSession: formData.get("examSession"),
    notes: formData.get("notes"),
    topicIds: formData.getAll("topic").map(String),
    assessmentIds: formData.getAll("assessment").map(String),
  };
}

export const EXTRACTION_STATUS_LABELS: Record<ExtractionStatus, string> = {
  pending: "Sin leer",
  processing: "Leyendo…",
  done: "Texto listo",
  failed: "No se pudo leer",
  not_applicable: "Sin texto (imagen)",
};

/** Etiqueta de la posición de un fragmento: diapositiva para PPTX, página para el resto. */
export function locationLabel(page: number | null, pageTo: number | null, isSlides: boolean): string | null {
  if (page === null) return null;
  const unit = isSlides ? "Diap." : "Pág.";
  return pageTo !== null && pageTo !== page ? `${unit} ${page}–${pageTo}` : `${unit} ${page}`;
}

/** Parte un fragmento resaltado por search_all (⟦…⟧) en trozos normales y marcados. */
export function splitHighlights(snippet: string): { text: string; mark: boolean }[] {
  const parts: { text: string; mark: boolean }[] = [];
  const re = /⟦([^⟧]*)⟧/g;
  let last = 0;
  for (const m of snippet.matchAll(re)) {
    if (m.index > last) parts.push({ text: snippet.slice(last, m.index), mark: false });
    parts.push({ text: m[1], mark: true });
    last = m.index + m[0].length;
  }
  if (last < snippet.length) parts.push({ text: snippet.slice(last), mark: false });
  return parts.filter((p) => p.text !== "");
}
