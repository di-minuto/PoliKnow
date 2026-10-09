/** Fragmento de un documento del usuario que se pasa a la IA como fuente. */
export type SourceExcerpt = {
  title: string;
  /** "pág. 3", "diap. 2-4"… */
  location?: string | null;
  text: string;
};

/** Recorta un texto largo por palabras, sin cortar a mitad. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 0 ? space : max)}…`;
}

/** Bloque numerado de fuentes: [1] «Título» (pág. 3)\n texto. */
export function sourcesBlock(sources: readonly SourceExcerpt[], maxEach = 1800): string {
  return sources
    .map((s, i) => `[${i + 1}] «${s.title}»${s.location ? ` (${s.location})` : ""}\n${clip(s.text.trim(), maxEach)}`)
    .join("\n\n");
}

export const SPANISH = "Responde siempre en español de España.";
