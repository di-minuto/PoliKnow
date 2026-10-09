import { normalizeText } from "./normalize";
import type { ExtractedPage, TextChunk } from "./types";

export const CHUNK_TARGET_CHARS = 1500;
const CHUNK_MAX_CHARS = 2200;

type Unit = { page: number | null; heading: string | null; text: string };

/** Parte un párrafo demasiado largo por frases y, si hace falta, por palabras. */
function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^.!?;:]+[.!?;:]+(?:\s+|$)|[^.!?;:]+$/g) ?? [text];
  const parts: string[] = [];
  let current = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length > max) {
      if (current) parts.push(current);
      current = "";
      let rest = sentence;
      while (rest.length > max) {
        const cut = rest.lastIndexOf(" ", max);
        const at = cut > max / 2 ? cut : max;
        parts.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      current = rest;
    } else if (current && current.length + 1 + sentence.length > max) {
      parts.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * Agrupa el texto de las páginas en fragmentos de ~1500 caracteres,
 * sin partir párrafos si se puede, y guardando las páginas que cubre cada uno.
 * Un encabezado nuevo (p. ej. otra diapositiva con título) abre fragmento
 * si el actual ya tiene un tamaño razonable.
 */
export function chunkPages(pages: ExtractedPage[], target = CHUNK_TARGET_CHARS): TextChunk[] {
  const max = Math.max(target, Math.round(target * (CHUNK_MAX_CHARS / CHUNK_TARGET_CHARS)));
  const units: Unit[] = [];
  for (const page of pages) {
    const text = normalizeText(page.text);
    if (!text) continue;
    const heading = page.heading?.trim() || null;
    for (const paragraph of text.split(/\n{2,}/)) {
      const flat = paragraph.replace(/\n/g, " ").trim();
      for (const piece of splitLong(flat, max)) {
        if (piece) units.push({ page: page.page, heading, text: piece });
      }
    }
  }

  const chunks: TextChunk[] = [];
  let current: Unit[] = [];
  let length = 0;

  const flush = () => {
    if (current.length === 0) return;
    const pagesInChunk = current.map((u) => u.page).filter((p): p is number => p !== null);
    chunks.push({
      chunkIndex: chunks.length,
      pageFrom: pagesInChunk.length ? Math.min(...pagesInChunk) : null,
      pageTo: pagesInChunk.length ? Math.max(...pagesInChunk) : null,
      heading: current.find((u) => u.heading)?.heading ?? null,
      content: current.map((u) => u.text).join("\n\n"),
    });
    current = [];
    length = 0;
  };

  for (const unit of units) {
    const last = current.at(-1);
    const newSection = last !== undefined && unit.heading !== null && unit.heading !== last.heading;
    if (
      current.length > 0 &&
      (length + unit.text.length > max || length >= target || (newSection && length >= target / 3))
    ) {
      flush();
    }
    current.push(unit);
    length += unit.text.length + 2;
  }
  flush();
  return chunks;
}
