import { detectFormat } from "../format";
import type { ExtractedDocument } from "../types";
import { extractDocx, extractPptx } from "./office";
import { extractPdf } from "./pdf";
import { extractPlainText } from "./text";

export { setPdfWorkerSrc } from "./pdf";

/**
 * Extrae el texto de un archivo. Devuelve null si el formato no tiene texto
 * extraíble sin OCR (imágenes; el OCR llega con la IA en la Fase 9).
 */
export async function extractText(
  filename: string,
  mimeType: string | null,
  data: ArrayBuffer | Uint8Array,
): Promise<ExtractedDocument | null> {
  switch (detectFormat(filename, mimeType)) {
    case "pdf":
      return extractPdf(data);
    case "docx":
      return extractDocx(data);
    case "pptx":
      return extractPptx(data);
    case "text":
      return extractPlainText(data);
    default:
      return null;
  }
}
