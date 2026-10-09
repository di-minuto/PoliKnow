import type { DocumentFormat } from "./types";

const BY_EXTENSION: Record<string, DocumentFormat> = {
  pdf: "pdf",
  docx: "docx",
  pptx: "pptx",
  txt: "text",
  md: "text",
  markdown: "text",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
};

const MIME_BY_FORMAT: Record<Exclude<DocumentFormat, "unsupported" | "image">, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  text: "text/plain",
};

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

/** Los navegadores móviles a veces no dan el tipo MIME: la extensión manda. */
export function detectFormat(filename: string, mimeType?: string | null): DocumentFormat {
  const byExt = BY_EXTENSION[extensionOf(filename)];
  if (byExt) return byExt;
  if (!mimeType) return "unsupported";
  if (mimeType === MIME_BY_FORMAT.pdf) return "pdf";
  if (mimeType === MIME_BY_FORMAT.docx) return "docx";
  if (mimeType === MIME_BY_FORMAT.pptx) return "pptx";
  if (mimeType.startsWith("text/")) return "text";
  if (mimeType.startsWith("image/")) return "image";
  return "unsupported";
}

/** Tipo MIME fiable para guardar en Storage. */
export function normalizedMimeType(filename: string, mimeType?: string | null): string {
  const format = detectFormat(filename, mimeType);
  if (format === "image") return mimeType || `image/${extensionOf(filename).replace("jpg", "jpeg")}`;
  if (format === "text") return extensionOf(filename) === "md" ? "text/markdown" : "text/plain";
  if (format === "unsupported") return mimeType || "application/octet-stream";
  return MIME_BY_FORMAT[format];
}

/** Título por defecto a partir del nombre del archivo. */
export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return base || filename;
}
