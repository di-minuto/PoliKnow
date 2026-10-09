import type { AnswerFeedback } from "@/server/actions/practice";
import type { SourceType } from "@/domain/questions/types";

/** Pregunta tal como la recibe el navegador durante el test: sin solución. */
export type RunnerQuestion = {
  id: string;
  stem: string;
  questionType: string;
  typeLabel: string;
  /** Solo lo necesario para responder: opciones, código de partida, unidad. */
  content: { options?: string[]; multiple?: boolean; unit?: string | null; language?: string | null; code?: string | null };
  sourceType: SourceType;
  sourceDetail: string | null;
  topicName: string | null;
};

export type RunnerItem = {
  itemId: string;
  position: number;
  flagged: boolean;
  question: RunnerQuestion;
  /** Respuesta ya dada (y su corrección). */
  done: { response: unknown; feedback: AnswerFeedback } | null;
};
