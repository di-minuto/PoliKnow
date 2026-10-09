import type { ExtractedDocument, ExtractedPage } from "../types";

type TextItem = { str: string; hasEOL?: boolean; transform?: number[]; height?: number };

let pdfWorkerSrc = "";

/** Ruta del worker de pdf.js en el navegador (en Node no hace falta). */
export function setPdfWorkerSrc(src: string) {
  pdfWorkerSrc = src;
}

/** Une los trozos de texto de una página; un salto vertical grande separa párrafos. */
export function joinTextItems(items: TextItem[]): string {
  let out = "";
  let lastY: number | null = null;
  let lastHeight = 0;
  let pendingNewline = false;
  for (const item of items) {
    const y = item.transform?.[5] ?? null;
    const height = item.height || Math.abs(item.transform?.[3] ?? 0) || lastHeight;
    if (pendingNewline || (lastY !== null && y !== null && Math.abs(y - lastY) > 1)) {
      const gap = lastY !== null && y !== null ? Math.abs(lastY - y) : 0;
      out += gap > Math.max(lastHeight, height) * 1.8 ? "\n\n" : "\n";
      pendingNewline = false;
    }
    out += item.str;
    if (item.hasEOL) pendingNewline = true;
    if (y !== null) lastY = y;
    if (height) lastHeight = height;
  }
  return out;
}

export async function extractPdf(data: ArrayBuffer | Uint8Array): Promise<ExtractedDocument> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (pdfWorkerSrc) pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  // pdf.js se queda con el buffer: se le pasa una copia.
  const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0));
  // Solo se lee el texto: sin fuentes estándar ni avisos de renderizado.
  const task = pdfjs.getDocument({ data: bytes, verbosity: pdfjs.VerbosityLevel.ERRORS });
  let doc;
  try {
    doc = await task.promise;
  } catch (error) {
    await task.destroy();
    const name = (error as { name?: string })?.name;
    if (name === "PasswordException") throw new Error("El PDF está protegido con contraseña.");
    throw new Error("No se ha podido abrir el PDF (¿está dañado?).");
  }
  try {
    const pages: ExtractedPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push({ page: n, text: joinTextItems(content.items as TextItem[]) });
      page.cleanup();
    }
    return { pages, pageCount: doc.numPages };
  } finally {
    await task.destroy();
  }
}
