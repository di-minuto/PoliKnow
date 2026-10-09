import "server-only";
import { nextTopicReview, topicMastery } from "@/domain/practice/mastery";
import { itemFraction, outcomeResult, scoreAttempt, srsRating, type AttemptScore } from "@/domain/practice/scoring";
import type { SelfGrade } from "@/domain/practice/types";
import { bodySchema } from "@/domain/questions/body";
import { gradeResponse, type Grade, type Response } from "@/domain/questions/grading";
import type { Question } from "@/domain/questions/types";
import { NEW_CARD, review } from "@/domain/srs/srs";
import * as repo from "@/server/repositories/practice";

/*
 * Lógica común a tests y simulacros: corregir, puntuar, y actualizar el
 * repaso espaciado de las preguntas y el dominio de los temas.
 */

type AttemptData = { attempt: repo.AttemptRow; items: repo.ItemRow[] };

export const penaltyOf = (attempt: repo.AttemptRow) => Number((attempt.config as { penalty?: number }).penalty ?? 0);

/** Corrige una respuesta con la solución de la pregunta. null = la pregunta tiene datos incompletos. */
export function gradeAgainst(question: Question, response: Response): Grade | null {
  const body = bodySchema(question.questionType).safeParse({ content: question.content, answer: question.answer });
  return body.success ? gradeResponse(question.questionType, body.data, response) : null;
}

/** Valores a guardar en attempt_items para una respuesta corregida. */
export function gradedItem(item: repo.ItemRow, grade: Grade, selfGrade: SelfGrade | null, penalty: number) {
  const points = Number(item.points);
  const pending = grade === "self_assessed" && !selfGrade;
  const result = pending ? null : outcomeResult(grade, selfGrade);
  return {
    userAnswer: { response: item.user_answer?.response ?? null, grade, selfGrade },
    isCorrect: result === null || result === "partial" ? null : result === "correct",
    score: pending ? null : itemFraction({ topicId: null, points, grade, selfGrade }, penalty) * points,
    gradingMethod: grade === "self_assessed" ? ("self" as const) : ("auto" as const),
  };
}

/** Repaso espaciado y contadores de una pregunta tras responderla. */
export async function recordReview(userId: string, question: Question, grade: Grade, selfGrade: SelfGrade | null, now: Date) {
  const result = outcomeResult(grade, selfGrade);
  const stats = await repo.getQuestionStats(question.id);
  await repo.saveQuestionStats(userId, question.id, {
    timesAnswered: (stats?.timesAnswered ?? 0) + 1,
    timesCorrect: (stats?.timesCorrect ?? 0) + (result === "correct" ? 1 : 0),
    timesIncorrect: (stats?.timesIncorrect ?? 0) + (result === "incorrect" ? 1 : 0),
    lastResult: result,
    lastAnsweredAt: now.toISOString(),
    card: review(stats?.card ?? NEW_CARD, srsRating(grade, selfGrade), now, question.difficulty),
  });
}

/** Nota del intento con lo que hay guardado. */
export async function scoreData(data: AttemptData): Promise<{ score: AttemptScore; topicIds: string[] }> {
  const questions = await repo.loadCandidates({ questionIds: data.items.map((i) => i.question_id) });
  const topicOf = new Map(questions.map((q) => [q.id, q.topicId]));
  const outcomes = data.items.map((i) => ({
    topicId: topicOf.get(i.question_id) ?? null,
    points: Number(i.points),
    grade: i.answered_at ? (i.user_answer?.grade ?? null) : null,
    selfGrade: i.user_answer?.selfGrade ?? null,
  }));
  const topicIds = [...new Set(outcomes.map((o) => o.topicId).filter((t): t is string => Boolean(t)))];
  return { score: scoreAttempt(outcomes, penaltyOf(data.attempt)), topicIds };
}

export const summaryOf = (score: AttemptScore) => ({
  correct: score.correct,
  incorrect: score.incorrect,
  partial: score.partial,
  unanswered: score.unanswered,
  pending: score.pending,
  penaltyLost: score.penaltyLost,
  byTopic: score.byTopic,
});

/** Dominio de cada tema, con todas sus preguntas. */
export async function refreshTopicProgress(userId: string, topicIds: string[], now: Date) {
  if (topicIds.length === 0) return;
  const all = await repo.loadCandidates({ topicIds });
  for (const topicId of topicIds) {
    const stats = all.filter((c) => c.topicId === topicId).map((c) => c.stats);
    await repo.saveTopicProgress(userId, topicId, {
      mastery: topicMastery(stats, now),
      lastReviewedAt: now.toISOString(),
      nextReviewAt: nextTopicReview(stats),
    });
  }
}
