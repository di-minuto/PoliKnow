import type { AICompletionRequest } from "../types";
import { SPANISH, clip, sourcesBlock, type SourceExcerpt } from "./shared";

export const EXPLAIN_ANSWER_VERSION = "1";

export type ExplainAnswerInput = {
  stem: string;
  /** Opciones con su letra, si es tipo test. */
  options: string[];
  correct: string;
  given: string;
  explanation: string | null;
  sources: SourceExcerpt[];
};

/** «Explícame por qué he fallado esta pregunta». */
export function explainAnswerRequest(input: ExplainAnswerInput): AICompletionRequest {
  const user = [
    `Pregunta: ${clip(input.stem, 2000)}`,
    input.options.length ? `Opciones:\n${input.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join("\n")}` : "",
    `Respuesta correcta: ${clip(input.correct, 1500)}`,
    `Mi respuesta: ${clip(input.given || "(en blanco)", 1500)}`,
    input.explanation ? `Explicación que ya tengo: ${clip(input.explanation, 800)}` : "",
    input.sources.length ? `Fragmentos de mis apuntes:\n\n${sourcesBlock(input.sources, 1200)}` : "",
    "Explícame por qué mi respuesta está mal y cuál es el razonamiento correcto.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    task: "explain_answer",
    system: [
      "Eres un tutor universitario paciente.",
      SPANISH,
      "Explica el error concreto del alumno (qué ha confundido), el concepto correcto y un truco para no volver a fallarlo.",
      "Si usas los apuntes, cita la fuente como [1], [2]…",
      "Máximo 180 palabras. Puedes usar listas con «- » y **negrita**.",
    ].join("\n"),
    messages: [{ role: "user", content: user }],
    maxTokens: 700,
    temperature: 0.3,
    promptVersion: EXPLAIN_ANSWER_VERSION,
  };
}
