/*
 * Estadísticas y preparación estimada. Funciones puras: reciben datos y
 * devuelven números explicables (cada indicador lleva sus componentes).
 */

const DAY = 86_400_000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

export type TopicSnapshot = {
  mastery: number;
  coverage: number;
  /** null = nunca estudiado ni repasado */
  nextReviewDay: string | null;
  studied: boolean;
};

/** Pesos de la preparación (docs/DISENO.md §4). */
export const READINESS_WEIGHTS = { tests: 0.4, exams: 0.25, coverage: 0.2, reviews: 0.15 } as const;
export type ReadinessComponent = keyof typeof READINESS_WEIGHTS;

export const READINESS_LABELS: Record<ReadinessComponent, string> = {
  tests: "Dominio en tests",
  exams: "Simulacros y exámenes",
  coverage: "Temario estudiado",
  reviews: "Repasos al día",
};

export type Readiness = {
  /** 0..1 */
  score: number;
  /** 0..1 por componente; null si no hay datos (su peso se reparte entre los demás) */
  components: Record<ReadinessComponent, number | null>;
};

/** Repaso al día: 1 si no está vencido; baja hasta 0 a las dos semanas de retraso. */
export function reviewFreshness(t: TopicSnapshot, today: string): number {
  if (!t.studied && !t.nextReviewDay) return 0;
  if (!t.nextReviewDay || t.nextReviewDay >= today) return 1;
  return clamp01(1 - daysBetween(t.nextReviewDay, today) / 14);
}

/**
 * Preparación estimada de una evaluación: media ponderada (por peso del tema)
 * de dominio en tests, cobertura y repasos, más la nota de los últimos
 * simulacros o exámenes. No depende solo del tiempo estudiado.
 */
export function readiness(
  topics: readonly { weight: number; state: TopicSnapshot }[],
  examGrades: readonly number[],
  today: string,
): Readiness {
  const total = topics.reduce((s, t) => s + t.weight, 0);
  const avg = (f: (t: TopicSnapshot) => number) =>
    total > 0 ? topics.reduce((s, t) => s + t.weight * f(t.state), 0) / total : null;
  const recent = examGrades.slice(-3);
  const components: Record<ReadinessComponent, number | null> = {
    tests: avg((t) => clamp01(t.mastery)),
    exams: recent.length ? clamp01(recent.reduce((s, g) => s + g, 0) / recent.length / 10) : null,
    coverage: avg((t) => clamp01(t.coverage)),
    reviews: avg((t) => reviewFreshness(t, today)),
  };
  let weight = 0;
  let sum = 0;
  for (const key of Object.keys(READINESS_WEIGHTS) as ReadinessComponent[]) {
    const value = components[key];
    if (value === null) continue;
    weight += READINESS_WEIGHTS[key];
    sum += READINESS_WEIGHTS[key] * value;
  }
  return { score: weight > 0 ? sum / weight : 0, components };
}

/** Minutos estudiados por día (claves YYYY-MM-DD) en los últimos `days` días, hoy incluido. */
export function dailyMinutes(
  sessions: readonly { day: string; seconds: number }[],
  today: string,
  days: number,
): { day: string; minutes: number }[] {
  const byDay = new Map<string, number>();
  for (const s of sessions) byDay.set(s.day, (byDay.get(s.day) ?? 0) + s.seconds / 60);
  const out: { day: string; minutes: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, minutes: Math.round(byDay.get(key) ?? 0) });
  }
  return out;
}

export type AttemptPoint = { finishedAt: string; grade: number; exam: boolean };

export function attemptSummary(points: readonly AttemptPoint[]) {
  const sorted = [...points].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const last5 = sorted.slice(-5).map((p) => p.grade);
  const prev5 = sorted.slice(-10, -5).map((p) => p.grade);
  const a = mean(last5);
  const b = mean(prev5);
  return {
    count: sorted.length,
    average: mean(sorted.map((p) => p.grade)),
    /** media de los 5 últimos menos la de los 5 anteriores */
    trend: a !== null && b !== null ? a - b : null,
    series: sorted.slice(-20),
  };
}

export type TopicStat = { topicId: string; mastery: number; answered: number };

/** Temas fuertes (dominio ≥ 70 %) y débiles (< 50 %), con al menos 3 respuestas. */
export function strengths(stats: readonly TopicStat[], limit = 5) {
  const known = stats.filter((s) => s.answered >= 3);
  return {
    strong: known.filter((s) => s.mastery >= 0.7).sort((a, b) => b.mastery - a.mastery).slice(0, limit),
    weak: known.filter((s) => s.mastery < 0.5).sort((a, b) => a.mastery - b.mastery).slice(0, limit),
  };
}

/** Porcentaje 0..100 redondeado. */
export const pct = (x: number | null) => (x === null ? null : Math.round(clamp01(x) * 100));
