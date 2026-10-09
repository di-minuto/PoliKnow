import { addDays, firstReviewGap, type TaskType, type TopicState } from "./plan";

/*
 * Cierre de una sesión de estudio: cuánto avanza el tema y cómo cambia su
 * prioridad. Esto es lo que hace que el plan se adapte.
 */

export const COMPLETION = ["yes", "partial", "no"] as const;
export type Completion = (typeof COMPLETION)[number];
export const COMPLETION_LABELS: Record<Completion, string> = { yes: "Sí", partial: "A medias", no: "No" };

export const DIFFICULTY_LABELS = ["Muy fácil", "Fácil", "Normal", "Difícil", "Muy difícil"] as const;

export type SessionOutcome = {
  taskType: TaskType;
  plannedMinutes: number;
  /** minutos medidos con el cronómetro (0 si no se usó) */
  measuredMinutes: number;
  completion: Completion;
  /** 1 muy fácil … 5 muy difícil */
  difficulty: number;
  notUnderstood: boolean;
};

const STUDY: TaskType[] = ["theory", "exercises", "practice"];
const GAIN_BY_DIFFICULTY = [1.25, 1.1, 1, 0.85, 0.7];
const ADJUST_BY_DIFFICULTY = [-0.15, -0.05, 0, 0.1, 0.2];

export const EMPTY_TOPIC_STATE: TopicState = {
  mastery: 0,
  coverage: 0,
  lastStudiedDay: null,
  nextReviewDay: null,
  notUnderstoodCount: 0,
  priorityAdjustment: 0,
};

/** Minutos que cuentan como estudiados. */
export function effectiveMinutes(o: SessionOutcome): number {
  if (o.completion === "no") return 0;
  const measured = Math.min(o.measuredMinutes, o.plannedMinutes * 1.5);
  // "Sí" vale al menos lo planificado (quizá no usó el cronómetro).
  if (o.completion === "yes") return Math.max(o.plannedMinutes, measured);
  return measured > 0 ? Math.min(measured, o.plannedMinutes) : o.plannedMinutes / 2;
}

/** Estado del tema tras la sesión. `topicMinutes` = minutos totales estimados del tema. */
export function applySession(state: TopicState, o: SessionOutcome, topicMinutes: number, today: string): TopicState {
  const level = Math.min(5, Math.max(1, Math.round(o.difficulty))) - 1;
  const minutes = effectiveMinutes(o);
  const next = { ...state };

  if (STUDY.includes(o.taskType) && minutes > 0) {
    const gain = (minutes / Math.max(1, topicMinutes)) * GAIN_BY_DIFFICULTY[level] * (o.notUnderstood ? 0.5 : 1);
    next.coverage = Math.min(1, state.coverage + gain);
    next.lastStudiedDay = today;
  }
  if (o.taskType === "review" && o.completion !== "no") {
    next.nextReviewDay = addDays(today, firstReviewGap(state.mastery) * (level <= 1 ? 2 : 1));
  }
  if (o.notUnderstood || level >= 4) next.nextReviewDay = addDays(today, 1);

  let adjust = state.priorityAdjustment + ADJUST_BY_DIFFICULTY[level] + (o.notUnderstood ? 0.25 : 0);
  if (o.completion === "no") adjust += 0.05;
  next.priorityAdjustment = Math.round(Math.min(1, Math.max(-0.5, adjust)) * 100) / 100;
  next.notUnderstoodCount = o.notUnderstood
    ? state.notUnderstoodCount + 1
    : o.completion === "yes" && level <= 1
      ? Math.max(0, state.notUnderstoodCount - 1)
      : state.notUnderstoodCount;
  return next;
}

export const statusFor = (c: Completion) => (c === "yes" ? "done" : c === "partial" ? "partial" : "skipped");
