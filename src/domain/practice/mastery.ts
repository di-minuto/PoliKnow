import { currentRetrievability } from "@/domain/srs/srs";
import type { QuestionStats } from "./types";

/*
 * Dominio de un tema (0..1) a partir de sus preguntas: cada pregunta cuenta lo
 * que se recuerda hoy si la última vez se acertó, y casi nada si se falló.
 * Con pocas respuestas se queda bajo (no basta con acertar una pregunta).
 */
const PRIOR = 3;

export function topicMastery(stats: readonly (QuestionStats | null)[], now: Date): number {
  const answered = stats.filter((s): s is QuestionStats => Boolean(s && s.timesAnswered > 0));
  if (answered.length === 0) return 0;
  const total = answered.reduce((sum, s) => {
    const recall = currentRetrievability(s.card, now);
    const last = s.lastResult === "correct" ? 1 : s.lastResult === "partial" ? 0.5 : 0.1;
    return sum + recall * last;
  }, 0);
  return Math.min(1, Math.max(0, total / (answered.length + PRIOR)));
}

/** Próximo repaso del tema: el de su pregunta que antes vence. */
export function nextTopicReview(stats: readonly (QuestionStats | null)[]): string | null {
  const dues = stats.map((s) => s?.card.dueAt).filter((d): d is string => Boolean(d)).sort();
  return dues[0] ?? null;
}
