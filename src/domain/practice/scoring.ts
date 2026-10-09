import type { Grade } from "@/domain/questions/grading";
import type { SelfGrade } from "./types";
import type { Rating } from "@/domain/srs/srs";

/*
 * Puntuación de un intento. Sirve para tests (sin penalización) y para
 * simulacros y exámenes (con penalización por fallo en las autocorregibles).
 */

export type ItemOutcome = {
  topicId: string | null;
  points: number;
  /** null = sin responder */
  grade: Grade | null;
  selfGrade: SelfGrade | null;
};

export const SELF_GRADE_SCORE: Record<SelfGrade, number> = { wrong: 0, partial: 0.5, right: 1 };

/** Fracción de los puntos obtenida (puede ser negativa con penalización). */
export function itemFraction(item: ItemOutcome, penalty: number): number {
  if (item.grade === null) return 0;
  if (item.grade === "correct") return 1;
  if (item.grade === "incorrect") return -penalty;
  return item.selfGrade ? SELF_GRADE_SCORE[item.selfGrade] : 0;
}

/** Resultado para el repaso espaciado. */
export function srsRating(grade: Grade, selfGrade: SelfGrade | null): Rating {
  if (grade === "correct") return "good";
  if (grade === "incorrect") return "again";
  return selfGrade === "right" ? "good" : selfGrade === "partial" ? "hard" : "again";
}

/** ¿Se cuenta como acierto, fallo o parcial? */
export function outcomeResult(grade: Grade, selfGrade: SelfGrade | null): "correct" | "incorrect" | "partial" {
  if (grade === "correct") return "correct";
  if (grade === "incorrect") return "incorrect";
  return selfGrade === "right" ? "correct" : selfGrade === "partial" ? "partial" : "incorrect";
}

export type AttemptScore = {
  score: number;
  maxScore: number;
  /** sobre 10, nunca negativa */
  grade: number;
  correct: number;
  incorrect: number;
  partial: number;
  unanswered: number;
  byTopic: { topicId: string | null; score: number; maxScore: number; grade: number; count: number }[];
};

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export function scoreAttempt(items: readonly ItemOutcome[], penalty = 0): AttemptScore {
  let score = 0;
  let maxScore = 0;
  const counts = { correct: 0, incorrect: 0, partial: 0, unanswered: 0 };
  const topics = new Map<string | null, { score: number; maxScore: number; count: number }>();
  for (const item of items) {
    const s = itemFraction(item, penalty) * item.points;
    score += s;
    maxScore += item.points;
    if (item.grade === null) counts.unanswered += 1;
    else counts[outcomeResult(item.grade, item.selfGrade)] += 1;
    const t = topics.get(item.topicId) ?? { score: 0, maxScore: 0, count: 0 };
    topics.set(item.topicId, { score: t.score + s, maxScore: t.maxScore + item.points, count: t.count + 1 });
  }
  const grade10 = (s: number, m: number) => (m > 0 ? round(Math.max(0, s) / m * 10) : 0);
  return {
    score: round(score, 3),
    maxScore: round(maxScore, 3),
    grade: grade10(score, maxScore),
    ...counts,
    byTopic: [...topics].map(([topicId, t]) => ({
      topicId,
      score: round(t.score, 3),
      maxScore: round(t.maxScore, 3),
      grade: grade10(t.score, t.maxScore),
      count: t.count,
    })),
  };
}
