/*
 * Repaso espaciado por pregunta, inspirado en FSRS (lo que usa Anki hoy):
 *  - estabilidad S (días): tiempo en que la probabilidad de recordar baja al 90 %;
 *  - dificultad D (1..10): cuánto cuesta la pregunta;
 *  - recuerdo R(t) = (1 + t / (9·S))^-1, así que repasar a los S días da R = 0,9.
 * Un fallo baja mucho S (vuelve pronto); los aciertos seguidos la multiplican.
 */

export type SrsState = "new" | "learning" | "review" | "relearning";
export type Rating = "again" | "hard" | "good" | "easy";

export type SrsCard = {
  state: SrsState;
  /** días */
  stability: number | null;
  /** 1..10 */
  difficulty: number | null;
  reps: number;
  lapses: number;
  dueAt: string | null;
  lastReviewAt: string | null;
};

const DAY = 86_400_000;
export const MAX_INTERVAL_DAYS = 365;

export const NEW_CARD: SrsCard = {
  state: "new",
  stability: null,
  difficulty: null,
  reps: 0,
  lapses: 0,
  dueAt: null,
  lastReviewAt: null,
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Probabilidad estimada de recordar tras `elapsedDays` con estabilidad `stability`. */
export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return 1 / (1 + Math.max(0, elapsedDays) / (9 * stability));
}

/** Probabilidad de recordar ahora (0 si nunca se ha visto). */
export function currentRetrievability(card: SrsCard, now: Date): number {
  if (!card.lastReviewAt || !card.stability) return 0;
  return retrievability((now.getTime() - new Date(card.lastReviewAt).getTime()) / DAY, card.stability);
}

/** Dificultad inicial a partir de la dificultad de la pregunta (1..5) y la primera respuesta. */
function initialDifficulty(questionDifficulty: number, rating: Rating): number {
  const base = 2 + (clamp(questionDifficulty, 1, 5) - 1) * 1.5; // 2..8
  const delta = { again: 2, hard: 1, good: 0, easy: -1.5 }[rating];
  return clamp(base + delta, 1, 10);
}

const INITIAL_STABILITY: Record<Rating, number> = { again: 0.2, hard: 0.6, good: 1.5, easy: 4 };

/** Intervalo hasta el próximo repaso (días) para recordar al 90 %: igual a S con esta curva. */
export function intervalDays(stability: number): number {
  return clamp(stability, 0.01, MAX_INTERVAL_DAYS);
}

/** Aplica una respuesta a la tarjeta y devuelve el nuevo estado. No muta la entrada. */
export function review(card: SrsCard, rating: Rating, now: Date, questionDifficulty = 3): SrsCard {
  let stability: number;
  let difficulty: number;
  let state: SrsState;
  let lapses = card.lapses;

  if (card.state === "new" || card.stability === null || card.difficulty === null) {
    difficulty = initialDifficulty(questionDifficulty, rating);
    stability = INITIAL_STABILITY[rating];
    state = rating === "again" ? "learning" : "review";
    if (rating === "again") lapses += 1;
  } else {
    const elapsed = card.lastReviewAt ? (now.getTime() - new Date(card.lastReviewAt).getTime()) / DAY : 0;
    const r = retrievability(elapsed, card.stability);
    // La dificultad sube con los fallos y vuelve poco a poco hacia la media.
    const delta = { again: 2, hard: 1, good: 0, easy: -1 }[rating];
    difficulty = clamp(0.9 * (card.difficulty + delta) + 0.1 * 5, 1, 10);

    if (rating === "again") {
      lapses += 1;
      stability = clamp(card.stability * 0.25, 0.1, card.stability);
      state = "relearning";
    } else {
      // Crece más si la pregunta es fácil, si S es pequeña y si casi se había olvidado.
      const growth = ((11 - difficulty) / 10) * 2.6 * Math.pow(card.stability, -0.12) * (0.4 + 1.6 * (1 - r) + 0.25);
      const factor = { hard: 0.45, good: 1, easy: 1.5 }[rating];
      stability = Math.max(card.stability + 0.1, card.stability * (1 + growth * factor));
      state = "review";
    }
  }

  stability = clamp(stability, 0.05, MAX_INTERVAL_DAYS * 2);
  return {
    state,
    stability,
    difficulty,
    reps: card.reps + 1,
    lapses,
    lastReviewAt: now.toISOString(),
    dueAt: new Date(now.getTime() + intervalDays(stability) * DAY).toISOString(),
  };
}

/** ¿Toca repasarla? */
export function isDue(card: SrsCard, now: Date): boolean {
  return card.dueAt !== null && new Date(card.dueAt).getTime() <= now.getTime();
}
