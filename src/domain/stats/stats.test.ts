import { describe, expect, it } from "vitest";
import { attemptSummary, dailyMinutes, readiness, reviewFreshness, strengths, type TopicSnapshot } from "./stats";

const today = "2026-10-20";
const t = (s: Partial<TopicSnapshot>): TopicSnapshot => ({ mastery: 0, coverage: 0, nextReviewDay: null, studied: false, ...s });

describe("preparación estimada", () => {
  it("combina tests, simulacros, cobertura y repasos ponderando por tema", () => {
    const r = readiness(
      [
        { weight: 3, state: t({ mastery: 0.8, coverage: 1, nextReviewDay: "2026-10-25", studied: true }) },
        { weight: 1, state: t({ mastery: 0.4, coverage: 0.5, nextReviewDay: "2026-10-13", studied: true }) },
      ],
      [6, 7, 8],
      today,
    );
    expect(r.components.tests).toBeCloseTo(0.7);
    expect(r.components.exams).toBeCloseTo(0.7);
    expect(r.components.coverage).toBeCloseTo(0.875);
    expect(r.components.reviews).toBeCloseTo((3 + 0.5) / 4);
    expect(r.score).toBeCloseTo(0.4 * 0.7 + 0.25 * 0.7 + 0.2 * 0.875 + 0.15 * 0.875);
  });

  it("sin simulacros, su peso se reparte; sin estudiar, 0", () => {
    const r = readiness([{ weight: 1, state: t({ mastery: 1, coverage: 1, nextReviewDay: today, studied: true }) }], [], today);
    expect(r.components.exams).toBeNull();
    expect(r.score).toBeCloseTo(1);
    expect(readiness([{ weight: 1, state: t({}) }], [], today).score).toBe(0);
  });

  it("los repasos vencidos pierden valor con los días", () => {
    expect(reviewFreshness(t({ studied: true, nextReviewDay: "2026-10-13" }), today)).toBeCloseTo(0.5);
    expect(reviewFreshness(t({ studied: true, nextReviewDay: "2026-09-01" }), today)).toBe(0);
    expect(reviewFreshness(t({ studied: true }), today)).toBe(1);
  });
});

describe("métricas", () => {
  it("minutos por día con huecos a cero", () => {
    const days = dailyMinutes(
      [
        { day: "2026-10-20", seconds: 1800 },
        { day: "2026-10-20", seconds: 600 },
        { day: "2026-10-18", seconds: 3600 },
      ],
      today,
      4,
    );
    expect(days).toEqual([
      { day: "2026-10-17", minutes: 0 },
      { day: "2026-10-18", minutes: 60 },
      { day: "2026-10-19", minutes: 0 },
      { day: "2026-10-20", minutes: 40 },
    ]);
  });

  it("nota media y tendencia", () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ finishedAt: `2026-10-${String(i + 10)}`, grade: i < 5 ? 5 : 7, exam: false }));
    const s = attemptSummary(points);
    expect(s).toMatchObject({ count: 10, average: 6, trend: 2 });
    expect(attemptSummary([]).average).toBeNull();
  });

  it("temas fuertes y débiles con datos suficientes", () => {
    const s = strengths([
      { topicId: "a", mastery: 0.9, answered: 5 },
      { topicId: "b", mastery: 0.2, answered: 4 },
      { topicId: "c", mastery: 0.1, answered: 1 },
    ]);
    expect(s.strong.map((x) => x.topicId)).toEqual(["a"]);
    expect(s.weak.map((x) => x.topicId)).toEqual(["b"]);
  });
});
