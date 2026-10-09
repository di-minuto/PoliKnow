import { describe, expect, it } from "vitest";
import { NEW_CARD, review } from "@/domain/srs/srs";
import { topicMastery } from "./mastery";
import { scoreAttempt, srsRating } from "./scoring";
import { allocate, isFailed, reviewPriority, selectQuestions, shuffle, seededRandom } from "./selection";
import type { Candidate, QuestionStats } from "./types";

const now = new Date("2026-10-20T10:00:00Z");
const DAY = 86_400_000;

function stats(results: ("correct" | "incorrect")[], lastDaysAgo = 1): QuestionStats {
  let card = NEW_CARD;
  let t = new Date(now.getTime() - (lastDaysAgo + results.length) * DAY);
  for (const r of results) {
    t = new Date(t.getTime() + DAY);
    card = review(card, r === "correct" ? "good" : "again", t);
  }
  const correct = results.filter((r) => r === "correct").length;
  return {
    timesAnswered: results.length,
    timesCorrect: correct,
    timesIncorrect: results.length - correct,
    lastResult: results.at(-1) ?? null,
    lastAnsweredAt: t.toISOString(),
    card,
  };
}

const q = (id: string, topicId: string, s: QuestionStats | null = null): Candidate => ({
  id,
  subjectId: "s",
  topicId,
  questionType: "multiple_choice",
  difficulty: 3,
  stats: s,
});

describe("reparto por temas", () => {
  it("respeta los pesos con resto mayor", () => {
    const r = allocate(10, new Map([["a", 3], ["b", 1]]), new Map([["a", 50], ["b", 50]]));
    expect(Object.fromEntries(r)).toEqual({ a: 8, b: 2 });
  });

  it("si un tema no tiene bastantes, el resto va a los demás", () => {
    const r = allocate(10, new Map([["a", 1], ["b", 1]]), new Map([["a", 2], ["b", 50]]));
    expect(Object.fromEntries(r)).toEqual({ a: 2, b: 8 });
  });

  it("nunca pide más de las que hay", () => {
    const r = allocate(10, new Map([["a", 1]]), new Map([["a", 3]]));
    expect(r.get("a")).toBe(3);
  });
});

describe("prioridad de repaso", () => {
  it("lo fallado va antes que lo bien sabido", () => {
    const known = q("ok", "t", stats(["correct", "correct", "correct"], 1));
    const failed = q("ko", "t", stats(["correct", "incorrect"], 1));
    expect(reviewPriority(failed, now)).toBeGreaterThan(reviewPriority(known, now));
    expect(isFailed(failed)).toBe(true);
    expect(isFailed(known)).toBe(false);
    expect(isFailed(q("nueva", "t"))).toBe(false);
  });

  it("lo que hace mucho que no se repasa sube", () => {
    const recent = q("r", "t", stats(["correct", "correct"], 1));
    const old = q("o", "t", stats(["correct", "correct"], 60));
    expect(reviewPriority(old, now)).toBeGreaterThan(reviewPriority(recent, now));
  });
});

describe("selección", () => {
  const pool = [
    q("a1", "a", stats(["incorrect"], 2)),
    q("a2", "a", stats(["correct", "correct", "correct", "correct"], 1)),
    q("a3", "a"),
    q("b1", "b", stats(["correct", "incorrect"], 3)),
    q("b2", "b"),
    q("b3", "b", stats(["correct"], 1)),
  ];

  it("repaso de fallos: solo las falladas", () => {
    const chosen = selectQuestions(pool, { count: 10, now, seed: 1, strategy: "failed" });
    expect(chosen.map((c) => c.id).sort()).toEqual(["a1", "b1"]);
  });

  it("repaso inteligente: primero las que más lo necesitan", () => {
    const chosen = selectQuestions(pool, { count: 2, now, seed: 7, strategy: "priority" });
    expect(chosen.map((c) => c.id)).not.toContain("a2");
  });

  it("con pesos por tema reparte según el parcial", () => {
    const chosen = selectQuestions(pool, {
      count: 4,
      now,
      seed: 3,
      strategy: "random",
      topicWeights: new Map([["a", 3], ["b", 1]]),
    });
    expect(chosen.filter((c) => c.topicId === "a")).toHaveLength(3);
    expect(chosen.filter((c) => c.topicId === "b")).toHaveLength(1);
  });

  it("es reproducible con la misma semilla", () => {
    const a = selectQuestions(pool, { count: 4, now, seed: 42, strategy: "random" }).map((c) => c.id);
    const b = selectQuestions(pool, { count: 4, now, seed: 42, strategy: "random" }).map((c) => c.id);
    expect(a).toEqual(b);
    expect(shuffle([1, 2, 3, 4, 5], seededRandom(1))).toHaveLength(5);
  });
});

describe("puntuación", () => {
  const items = [
    { topicId: "a", points: 1, grade: "correct" as const, selfGrade: null },
    { topicId: "a", points: 1, grade: "incorrect" as const, selfGrade: null },
    { topicId: "b", points: 2, grade: "self_assessed" as const, selfGrade: "partial" as const },
    { topicId: "b", points: 1, grade: null, selfGrade: null },
  ];

  it("cuenta aciertos, fallos, parciales y en blanco", () => {
    const s = scoreAttempt(items);
    expect(s).toMatchObject({ score: 2, maxScore: 5, grade: 4, correct: 1, incorrect: 1, partial: 1, unanswered: 1 });
    expect(s.byTopic.find((t) => t.topicId === "a")).toMatchObject({ grade: 5, count: 2 });
  });

  it("con penalización resta los fallos y nunca baja de 0", () => {
    expect(scoreAttempt(items, 0.5).score).toBe(1.5);
    expect(scoreAttempt([{ topicId: null, points: 1, grade: "incorrect", selfGrade: null }], 1).grade).toBe(0);
    expect(scoreAttempt(items, 0.5).penaltyLost).toBe(0.5);
  });

  it("las de desarrollo sin autoevaluar quedan pendientes, no como fallo", () => {
    const s = scoreAttempt([
      { topicId: null, points: 2, grade: "self_assessed", selfGrade: null },
      { topicId: null, points: 1, grade: "correct", selfGrade: null },
    ]);
    expect(s).toMatchObject({ pending: 1, incorrect: 0, correct: 1, score: 1, maxScore: 3 });
  });

  it("traduce el resultado al repaso espaciado", () => {
    expect(srsRating("correct", null)).toBe("good");
    expect(srsRating("incorrect", null)).toBe("again");
    expect(srsRating("self_assessed", "partial")).toBe("hard");
    expect(srsRating("self_assessed", "wrong")).toBe("again");
  });
});

describe("dominio del tema", () => {
  it("sube con aciertos recientes y baja con fallos", () => {
    const good = topicMastery([stats(["correct", "correct"]), stats(["correct", "correct"]), stats(["correct"])], now);
    const bad = topicMastery([stats(["correct", "incorrect"]), stats(["incorrect"]), stats(["correct"])], now);
    expect(good).toBeGreaterThan(0.4);
    expect(bad).toBeLessThan(good / 2);
    expect(topicMastery([null], now)).toBe(0);
  });

  it("con una sola respuesta no se considera dominado", () => {
    expect(topicMastery([stats(["correct"], 0)], now)).toBeLessThan(0.3);
  });
});
