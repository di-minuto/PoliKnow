import type { bodyKind } from "@/domain/questions/body";
import type { Response } from "@/domain/questions/grading";

/** Lo que el usuario lleva escrito o marcado en una pregunta. */
export type Draft = { selected: number[]; tf: boolean | null; text: string };
export const EMPTY_DRAFT: Draft = { selected: [], tf: null, text: "" };

export function toResponse(kind: ReturnType<typeof bodyKind>, d: Draft): Response | null {
  if (kind === "choice") return d.selected.length ? { kind: "choice", selected: d.selected } : null;
  if (kind === "true_false") return d.tf === null ? null : { kind: "true_false", value: d.tf };
  if (kind === "short_answer" || kind === "numeric") return d.text.trim() ? { kind: "text", value: d.text } : null;
  // Código y desarrollo: se puede ver la solución sin escribir nada.
  return { kind: "text", value: d.text };
}

/** Recupera el borrador a partir de una respuesta guardada. */
export function fromResponse(response: unknown): Draft {
  const r = response as { kind?: string; selected?: number[]; value?: unknown } | null;
  if (r?.kind === "choice") return { ...EMPTY_DRAFT, selected: r.selected ?? [] };
  if (r?.kind === "true_false") return { ...EMPTY_DRAFT, tf: Boolean(r.value) };
  if (r?.kind === "text") return { ...EMPTY_DRAFT, text: String(r.value ?? "") };
  return EMPTY_DRAFT;
}
