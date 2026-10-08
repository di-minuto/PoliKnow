/**
 * Procedencia de una pregunta. Es obligatoria y se muestra siempre:
 * nunca se mezclan preguntas oficiales con generadas sin indicarlo.
 */
export const SOURCE_TYPES = ["official_exam", "course_material", "ai_generated", "manual"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  official_exam: "Examen oficial",
  course_material: "Material de la asignatura",
  ai_generated: "Generada por IA",
  manual: "Creada por mí",
};

/** Tipos de pregunta de serie. El catálogo question_types admite más. */
export const BUILTIN_QUESTION_TYPES = [
  "multiple_choice",
  "true_false",
  "short_answer",
  "numeric",
  "programming",
  "code_completion",
  "find_errors",
  "theory",
  "long_problem",
] as const;
export type BuiltinQuestionType = (typeof BUILTIN_QUESTION_TYPES)[number];
export type QuestionTypeCode = BuiltinQuestionType | (string & {});

export type ReviewStatus = "draft" | "approved" | "rejected";

export type Question = {
  id: string;
  subjectId: string;
  topicId: string | null;
  subtopic: string | null;
  questionType: QuestionTypeCode;
  sourceType: SourceType;
  stem: string;
  /** Datos específicos del tipo (opciones, código base...). Se valida por tipo en la Fase 4. */
  content: Record<string, unknown>;
  answer: unknown;
  explanation: string | null;
  difficulty: 1 | 2 | 3 | 4 | 5;
  documentId: string | null;
  sourceRef: string | null;
  officialExamId: string | null;
  officialPosition: number | null;
  points: number | null;
  originalText: string | null;
  reviewStatus: ReviewStatus;
  aiModel: string | null;
  variantOf: string | null;
  tags: string[];
  archived: boolean;
};

export type OfficialExam = {
  id: string;
  subjectId: string;
  assessmentId: string | null;
  documentId: string | null;
  solutionDocumentId: string | null;
  title: string;
  year: number | null;
  examSession: string | null;
  examDate: string | null;
  durationMinutes: number | null;
  totalPoints: number | null;
  rules: { wrongAnswerPenalty?: number; allowBack?: boolean };
  instructions: string | null;
};

export type QuestionProgress = {
  questionId: string;
  timesAnswered: number;
  timesCorrect: number;
  timesIncorrect: number;
  lastAnsweredAt: string | null;
  lastResult: "correct" | "incorrect" | "partial" | "skipped" | null;
};

/**
 * Comprueba la coherencia de procedencia (la BD aplica la misma regla):
 * una pregunta es oficial si y solo si pertenece a un examen oficial,
 * y las generadas por IA guardan el modelo que las creó.
 */
export function validateProvenance(
  q: Pick<Question, "sourceType" | "officialExamId" | "aiModel">,
): string | null {
  if (q.sourceType === "official_exam" && !q.officialExamId) {
    return "Una pregunta de examen oficial debe indicar a qué examen pertenece.";
  }
  if (q.sourceType !== "official_exam" && q.officialExamId) {
    return "Solo las preguntas de examen oficial pueden asociarse a un examen oficial.";
  }
  if (q.sourceType === "ai_generated" && !q.aiModel) {
    return "Las preguntas generadas por IA deben indicar el modelo que las generó.";
  }
  return null;
}
