import { bodyKind, parseLocaleNumber, type QuestionBody } from "./body";

/*
 * Corrección automática de los tipos que lo permiten. El resto (código,
 * teoría, problemas) se autoevalúa comparando con la respuesta modelo.
 */

export type Grade = "correct" | "incorrect" | "self_assessed";

/** Para comparar respuestas cortas: sin tildes, mayúsculas, espacios ni puntuación final. */
export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.;:,!?¡¿]+$/g, "")
    .trim();
}

export type Response =
  | { kind: "choice"; selected: number[] }
  | { kind: "true_false"; value: boolean }
  | { kind: "text"; value: string };

export function gradeResponse(questionType: string, body: QuestionBody, response: Response): Grade {
  const kind = bodyKind(questionType);
  if (kind === "choice" && response.kind === "choice") {
    const correct = new Set((body as Extract<QuestionBody, { answer: { correct: number[] } }>).answer.correct);
    const selected = new Set(response.selected);
    return selected.size === correct.size && [...selected].every((i) => correct.has(i)) ? "correct" : "incorrect";
  }
  if (kind === "true_false" && response.kind === "true_false") {
    return (body.answer as { value: boolean }).value === response.value ? "correct" : "incorrect";
  }
  if (kind === "short_answer" && response.kind === "text") {
    const given = normalizeAnswer(response.value);
    const accepted = (body.answer as { accepted: string[] }).accepted.map(normalizeAnswer);
    return given !== "" && accepted.includes(given) ? "correct" : "incorrect";
  }
  if (kind === "numeric" && response.kind === "text") {
    const value = parseLocaleNumber(response.value);
    if (value === null) return "incorrect";
    const expected = (body.answer as { value: number }).value;
    const tolerance = (body.content as { tolerance: number }).tolerance;
    // Margen mínimo para errores de redondeo en coma flotante.
    return Math.abs(value - expected) <= tolerance + 1e-9 * Math.max(1, Math.abs(expected)) ? "correct" : "incorrect";
  }
  return "self_assessed";
}

export function isAutoGradable(questionType: string): boolean {
  return ["choice", "true_false", "short_answer", "numeric"].includes(bodyKind(questionType));
}
