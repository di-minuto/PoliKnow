// Copia el worker de pdf.js a public/ (se ejecuta tras `npm install`), así
// siempre coincide con la versión instalada y no hace falta guardarlo en git.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs");
const target = join(root, "public/pdfjs/pdf.worker.min.mjs");

if (existsSync(source)) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
