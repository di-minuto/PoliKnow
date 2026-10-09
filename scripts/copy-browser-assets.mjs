// Copia a public/ lo que el navegador carga aparte (se ejecuta tras `npm install`):
// el worker de pdf.js y el OCR (tesseract.js + idioma español). Así siempre
// coinciden con la versión instalada, no se guardan en git y no dependen de un CDN.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  ["pdfjs-dist/legacy/build/pdf.worker.min.mjs", "pdfjs/pdf.worker.min.mjs"],
  ["tesseract.js/dist/worker.min.js", "ocr/worker.min.js"],
  ...["", "-simd", "-relaxedsimd"].flatMap((v) => [
    [`tesseract.js-core/tesseract-core${v}-lstm.js`, `ocr/core/tesseract-core${v}-lstm.js`],
    [`tesseract.js-core/tesseract-core${v}-lstm.wasm.js`, `ocr/core/tesseract-core${v}-lstm.wasm.js`],
    [`tesseract.js-core/tesseract-core${v}-lstm.wasm`, `ocr/core/tesseract-core${v}-lstm.wasm`],
  ]),
  ["@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz", "ocr/lang/spa.traineddata.gz"],
];

for (const [from, to] of files) {
  const source = join(root, "node_modules", from);
  const target = join(root, "public", to);
  if (!existsSync(source)) continue;
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
