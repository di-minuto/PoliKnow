import { bodyKind, optionLetter } from "./body";

/** Opciones con su letra («A) …») y la solución en texto, para la IA o para exportar. */
export function solutionText(q: { questionType: string; content: Record<string, unknown>; answer: unknown }): {
  options: string[];
  correct: string;
} {
  const answer = (q.answer ?? {}) as Record<string, unknown>;
  switch (bodyKind(q.questionType)) {
    case "choice": {
      const options = Array.isArray(q.content.options) ? q.content.options.map(String) : [];
      const correct = Array.isArray(answer.correct) ? (answer.correct as number[]) : [];
      return { options, correct: correct.map((i) => `${optionLetter(i)}) ${options[i] ?? ""}`).join("; ") || "(sin solución)" };
    }
    case "true_false":
      return { options: [], correct: answer.value === true ? "Verdadero" : answer.value === false ? "Falso" : "(sin solución)" };
    case "short_answer":
      return { options: [], correct: Array.isArray(answer.accepted) ? answer.accepted.join(" / ") : "(sin solución)" };
    case "numeric": {
      const unit = typeof q.content.unit === "string" && q.content.unit ? ` ${q.content.unit}` : "";
      return { options: [], correct: answer.value !== undefined ? `${answer.value}${unit}` : "(sin solución)" };
    }
    default:
      return { options: [], correct: typeof answer.model === "string" && answer.model ? answer.model : "(sin solución modelo)" };
  }
}
