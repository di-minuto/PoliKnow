import { currentRetrievability } from "@/domain/srs/srs";
import type { Candidate } from "./types";

/*
 * Elección de preguntas para un test. Todo es puro y determinista con una
 * semilla, para poder probarlo.
 */

const DAY = 86_400_000;

/** Generador pseudoaleatorio reproducible (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Reparte `count` preguntas entre temas según su peso (resto mayor), sin pasar
 * de las disponibles en cada tema; lo que sobra se da a los demás.
 */
export function allocate(count: number, weights: Map<string, number>, available: Map<string, number>): Map<string, number> {
  const result = new Map<string, number>();
  let remaining = Math.min(count, [...available.values()].reduce((a, b) => a + b, 0));
  let open = [...weights.keys()].filter((k) => (available.get(k) ?? 0) > 0);
  while (remaining > 0 && open.length > 0) {
    const total = open.reduce((s, k) => s + Math.max(weights.get(k) ?? 0, 0), 0);
    const share = (k: string) => (total > 0 ? Math.max(weights.get(k) ?? 0, 0) / total : 1 / open.length) * remaining;
    const exact = open.map((k) => ({ k, want: share(k) }));
    const floors = exact.map((e) => ({ ...e, n: Math.floor(e.want) }));
    let left = remaining - floors.reduce((s, e) => s + e.n, 0);
    floors.sort((a, b) => b.want - b.n - (a.want - a.n));
    for (const e of floors) {
      if (left <= 0) break;
      e.n += 1;
      left -= 1;
    }
    let given = 0;
    for (const e of floors) {
      const room = (available.get(e.k) ?? 0) - (result.get(e.k) ?? 0);
      const n = Math.min(e.n, room);
      if (n > 0) result.set(e.k, (result.get(e.k) ?? 0) + n);
      given += n;
    }
    remaining -= given;
    open = open.filter((k) => (available.get(k) ?? 0) > (result.get(k) ?? 0));
    if (given === 0) break;
  }
  return result;
}

/**
 * Prioridad de repaso (mayor = antes): vencida, poco acertada, olvidada o de
 * un tema flojo. Las nunca vistas tienen prioridad media.
 */
export function reviewPriority(c: Candidate, now: Date, topicWeakness = 0): number {
  const s = c.stats;
  if (!s || s.timesAnswered === 0) return 0.9 + topicWeakness;
  const accuracy = s.timesCorrect / Math.max(1, s.timesAnswered);
  const recall = currentRetrievability(s.card, now);
  const due = s.card.dueAt ? (now.getTime() - new Date(s.card.dueAt).getTime()) / DAY : 0;
  const overdue = Math.max(-1, Math.min(3, due / Math.max(1, s.card.stability ?? 1)));
  const lastWrong = s.lastResult === "incorrect" ? 0.8 : s.lastResult === "partial" ? 0.4 : 0;
  return 1.2 * (1 - recall) + 0.8 * (1 - accuracy) + 0.5 * overdue + lastWrong + topicWeakness;
}

/** ¿Cuenta como fallada? Último intento mal o más fallos que aciertos. */
export function isFailed(c: Candidate): boolean {
  const s = c.stats;
  if (!s || s.timesAnswered === 0) return false;
  return s.lastResult === "incorrect" || s.lastResult === "partial" || s.timesIncorrect > s.timesCorrect;
}

export type SelectOptions = {
  count: number;
  now: Date;
  seed: number;
  /** Peso de cada tema (modo parcial). Sin pesos, se ordena por prioridad con algo de azar. */
  topicWeights?: Map<string, number>;
  /** 0..1 por tema: cuanto más flojo, más prioridad. */
  topicWeakness?: Map<string, number>;
  /** "priority": las más necesarias primero; "random": al azar, prefiriendo las no vistas. */
  strategy: "priority" | "random" | "failed";
};

/** Ordena según la estrategia y toma `count`, repartiendo por temas si hay pesos. */
export function selectQuestions(candidates: readonly Candidate[], opts: SelectOptions): Candidate[] {
  const random = seededRandom(opts.seed);
  const weakness = (c: Candidate) => (c.topicId ? (opts.topicWeakness?.get(c.topicId) ?? 0) : 0);

  let pool = [...candidates];
  if (opts.strategy === "failed") pool = pool.filter(isFailed);

  // Algo de azar en todas las estrategias para no repetir siempre el mismo test.
  const score = (c: Candidate) => {
    const jitter = random() * 0.35;
    if (opts.strategy === "random") return (c.stats?.timesAnswered ? 0 : 0.5) + random();
    if (opts.strategy === "failed") {
      const t = c.stats?.lastAnsweredAt ? new Date(c.stats.lastAnsweredAt).getTime() / DAY : 0;
      return reviewPriority(c, opts.now, weakness(c)) + t * 1e-6 + jitter;
    }
    return reviewPriority(c, opts.now, weakness(c)) + jitter;
  };
  const ranked = pool.map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s).map((x) => x.c);

  if (!opts.topicWeights || opts.topicWeights.size === 0) return ranked.slice(0, opts.count);

  const byTopic = new Map<string, Candidate[]>();
  for (const c of ranked) {
    if (!c.topicId || !opts.topicWeights.has(c.topicId)) continue;
    byTopic.set(c.topicId, [...(byTopic.get(c.topicId) ?? []), c]);
  }
  const quota = allocate(
    opts.count,
    opts.topicWeights,
    new Map([...byTopic].map(([k, v]) => [k, v.length])),
  );
  const chosen = new Set<Candidate>();
  for (const [topic, n] of quota) for (const c of (byTopic.get(topic) ?? []).slice(0, n)) chosen.add(c);
  // Mantiene el orden de prioridad global, mezclando temas.
  return ranked.filter((c) => chosen.has(c));
}
