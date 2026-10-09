import { optionLetter } from "@/domain/questions/body";

/** Texto legible de lo que respondiste. */
export function describeResponse(response: unknown): string {
  const r = response as { kind?: string; selected?: number[]; value?: unknown } | null;
  if (!r?.kind) return "Sin responder";
  if (r.kind === "choice") return r.selected?.length ? r.selected.map(optionLetter).join(", ") : "Sin responder";
  if (r.kind === "true_false") return r.value ? "Verdadero" : "Falso";
  const text = String(r.value ?? "").trim();
  return text || "Sin respuesta escrita";
}
