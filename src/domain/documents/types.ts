/** Código de document_types: 'theory', 'notes', 'official_exam'... (ampliable). */
export type DocumentTypeCode = string;

export type ExtractionStatus = "pending" | "processing" | "done" | "failed" | "not_applicable";

export type StudyDocument = {
  id: string;
  subjectId: string;
  documentType: DocumentTypeCode;
  title: string;
  storagePath: string;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  pageCount: number | null;
  year: number | null;
  examSession: string | null;
  extractionStatus: ExtractionStatus;
  topicIds: string[];
  assessmentIds: string[];
};

/** Formatos admitidos en la importación. */
export const SUPPORTED_MIME_TYPES = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "text/plain": "TXT",
  "text/markdown": "Markdown",
  "image/png": "Imagen",
  "image/jpeg": "Imagen",
  "image/webp": "Imagen",
} as const;

/** Límite por archivo del plan gratuito de Supabase Storage. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Ruta en el bucket: <user_id>/<document_id>/<nombre saneado>. */
export function buildStoragePath(userId: string, documentId: string, filename: string): string {
  const safe = filename
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-120);
  return `${userId}/${documentId}/${safe || "archivo"}`;
}
