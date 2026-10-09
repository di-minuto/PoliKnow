import type { SrsCard } from "@/domain/srs/srs";

/** Modos de test (columna attempts.mode). Los de examen llegan en la Fase 6. */
export const TEST_MODES = ["quick", "failed_review", "smart_review", "topic", "assessment", "custom"] as const;
export type TestMode = (typeof TEST_MODES)[number];

export const TEST_MODE_LABELS: Record<TestMode | "exam_simulation" | "official_exam", string> = {
  quick: "Test rápido",
  failed_review: "Repaso de fallos",
  smart_review: "Repaso inteligente",
  topic: "Test por tema",
  assessment: "Test por parcial",
  custom: "Test personalizado",
  exam_simulation: "Simulacro de examen",
  official_exam: "Examen oficial",
};

/** Historial de una pregunta, tal como lo usa la selección. */
export type QuestionStats = {
  timesAnswered: number;
  timesCorrect: number;
  timesIncorrect: number;
  lastResult: "correct" | "incorrect" | "partial" | "skipped" | null;
  lastAnsweredAt: string | null;
  card: SrsCard;
};

export type Candidate = {
  id: string;
  subjectId: string;
  topicId: string | null;
  questionType: string;
  difficulty: number;
  stats: QuestionStats | null;
};

/** Autoevaluación de las preguntas que no se corrigen solas. */
export type SelfGrade = "wrong" | "partial" | "right";
export const SELF_GRADE_LABELS: Record<SelfGrade, string> = { wrong: "Mal", partial: "Regular", right: "Bien" };
