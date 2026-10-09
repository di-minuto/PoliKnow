import type { ExtractedDocument, ExtractedPage } from "@/documents/types";
import { detectFormat } from "@/documents/format";

/*
 * OCR en el navegador con tesseract.js (gratis, sin IA ni servidor). Los
 * archivos del motor y el idioma español se sirven desde /ocr (los copia
 * scripts/copy-browser-assets.mjs), así no depende de ningún CDN.
 */

export const OCR_MAX_PAGES = 40;

export type OcrProgress = { page: number; pages: number; fraction: number };

async function pdfPagesAsImages(data: ArrayBuffer, onPage: (n: number, total: number) => void): Promise<{ pages: Blob[]; total: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)), verbosity: pdfjs.VerbosityLevel.ERRORS });
  const doc = await task.promise;
  try {
    const total = doc.numPages;
    const pages: Blob[] = [];
    for (let n = 1; n <= Math.min(total, OCR_MAX_PAGES); n++) {
      onPage(n, total);
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      // ~2000 px de ancho: buena precisión sin agotar la memoria del móvil.
      const viewport = page.getViewport({ scale: Math.min(3, 2000 / base.width) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("El navegador no permite dibujar el PDF.");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      pages.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo convertir la página."))), "image/png")));
      page.cleanup();
    }
    return { pages, total };
  } finally {
    await task.destroy();
  }
}

/** Reconoce el texto de un PDF escaneado o de una imagen. */
export async function ocrDocument(
  filename: string,
  mimeType: string | null,
  data: ArrayBuffer,
  onProgress?: (p: OcrProgress) => void,
): Promise<ExtractedDocument> {
  const format = detectFormat(filename, mimeType);
  if (format !== "pdf" && format !== "image") throw new Error("El OCR solo sirve para PDF e imágenes.");

  let images: Blob[];
  let pageCount: number | null;
  if (format === "pdf") {
    const rendered = await pdfPagesAsImages(data, (n, total) => onProgress?.({ page: n, pages: Math.min(total, OCR_MAX_PAGES), fraction: 0 }));
    images = rendered.pages;
    pageCount = rendered.total;
  } else {
    images = [new Blob([data], { type: mimeType || "image/png" })];
    pageCount = null;
  }

  const { createWorker, OEM } = await import("tesseract.js");
  const origin = window.location.origin;
  let current = 0;
  const worker = await createWorker("spa", OEM.LSTM_ONLY, {
    workerPath: `${origin}/ocr/worker.min.js`,
    corePath: `${origin}/ocr/core`,
    langPath: `${origin}/ocr/lang`,
    gzip: true,
    workerBlobURL: false,
    logger: (m) => {
      if (m.status === "recognizing text") onProgress?.({ page: current + 1, pages: images.length, fraction: m.progress });
    },
  });
  try {
    const pages: ExtractedPage[] = [];
    for (const [i, image] of images.entries()) {
      current = i;
      const { data: result } = await worker.recognize(image);
      pages.push({ page: format === "pdf" ? i + 1 : null, text: result.text.replace(/[ \t]+\n/g, "\n").trim() });
    }
    return { pages, pageCount };
  } finally {
    await worker.terminate();
  }
}
