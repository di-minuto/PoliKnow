import type { AICompletionRequest, AIMessage } from "../types";
import { SPANISH, clip, sourcesBlock, type SourceExcerpt } from "./shared";

export const ASSISTANT_VERSION = "1";

export type AssistantInput = {
  /** Conversación hasta ahora; el último mensaje es la pregunta. */
  history: AIMessage[];
  sources: SourceExcerpt[];
  /** Resumen del estado de estudio (plan de hoy, temas débiles, exámenes…). */
  studyState: string;
  /** Preguntas del banco relacionadas, con su procedencia. */
  questions: string[];
};

const MAX_HISTORY = 8;

export function assistantRequest(input: AssistantInput): AICompletionRequest {
  const system = [
    "Eres el asistente de estudio personal de un estudiante universitario.",
    SPANISH,
    "Reglas:",
    "- Usa PRIMERO las fuentes numeradas (sus documentos). Cita cada dato que saques de ellas con [n], justo detrás.",
    "- Si las fuentes no bastan, dilo («En tus documentos no aparece…») y responde con conocimiento general, sin citar.",
    "- Nunca inventes citas ni números de página.",
    "- Para «qué estudio hoy» o «qué llevo peor», usa el ESTADO DE ESTUDIO.",
    "- Si te pide que le preguntes o le pongas un ejercicio, plantea UNA pregunta y espera su respuesta antes de corregir.",
    "- Las preguntas de exámenes oficiales se indican como tales; no presentes como oficial algo que no lo es.",
    "- Sé claro y concreto. Puedes usar listas con «- », **negrita**, `código` y bloques ```.",
    "",
    `ESTADO DE ESTUDIO\n${input.studyState || "(sin datos)"}`,
    input.questions.length ? `PREGUNTAS DEL BANCO RELACIONADAS\n${input.questions.join("\n")}` : "",
    input.sources.length ? `FUENTES\n\n${sourcesBlock(input.sources, 1600)}` : "FUENTES\n(no se ha encontrado nada en sus documentos para esta pregunta)",
  ]
    .filter((x) => x !== "")
    .join("\n");

  const history = input.history.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: clip(m.content, 4000) }));
  return {
    task: "assistant_chat",
    system,
    messages: history,
    maxTokens: 1500,
    temperature: 0.3,
    promptVersion: ASSISTANT_VERSION,
  };
}
