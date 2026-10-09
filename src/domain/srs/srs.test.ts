import { describe, expect, it } from "vitest";
import { NEW_CARD, currentRetrievability, isDue, retrievability, review, type Rating, type SrsCard } from "./srs";

const DAY = 86_400_000;
const start = new Date("2026-10-01T10:00:00Z");

/** Responde siempre igual, cada vez justo cuando toca. Devuelve los intervalos en días. */
function simulate(ratings: Rating[], difficulty = 3) {
  let card: SrsCard = NEW_CARD;
  let now = start;
  const intervals: number[] = [];
  for (const r of ratings) {
    card = review(card, r, now, difficulty);
    const next = new Date(card.dueAt!);
    intervals.push((next.getTime() - now.getTime()) / DAY);
    now = next;
  }
  return { card, intervals };
}

describe("repaso espaciado", () => {
  it("repasar a los S días deja el recuerdo en el 90 %", () => {
    expect(retrievability(5, 5)).toBeCloseTo(0.9, 5);
    expect(retrievability(0, 5)).toBe(1);
  });

  it("los aciertos seguidos espacian cada vez más", () => {
    const { intervals } = simulate(["good", "good", "good", "good", "good"]);
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    expect(intervals[0]).toBeLessThan(3);
    expect(intervals[4]).toBeGreaterThan(20);
  });

  it("un fallo hace que vuelva mucho antes", () => {
    const ok = simulate(["good", "good", "good"]);
    const failed = review(ok.card, "again", new Date(ok.card.dueAt!));
    const failedInterval = (new Date(failed.dueAt!).getTime() - new Date(ok.card.dueAt!).getTime()) / DAY;
    expect(failedInterval).toBeLessThan(ok.intervals[2] / 3);
    expect(failed.lapses).toBe(1);
    expect(failed.state).toBe("relearning");
    expect(failed.difficulty!).toBeGreaterThan(ok.card.difficulty!);
  });

  it("«difícil» espacia menos que «bien» y «fácil» más", () => {
    const hard = simulate(["good", "hard"]).intervals[1];
    const good = simulate(["good", "good"]).intervals[1];
    const easy = simulate(["good", "easy"]).intervals[1];
    expect(hard).toBeLessThan(good);
    expect(easy).toBeGreaterThan(good);
  });

  it("las preguntas difíciles se espacian menos", () => {
    const easyQ = simulate(["good", "good", "good"], 1).intervals[2];
    const hardQ = simulate(["good", "good", "good"], 5).intervals[2];
    expect(hardQ).toBeLessThan(easyQ);
  });

  it("un primer fallo deja la pregunta para muy pronto", () => {
    const card = review(NEW_CARD, "again", start);
    expect((new Date(card.dueAt!).getTime() - start.getTime()) / DAY).toBeLessThan(0.5);
    expect(isDue(card, new Date(start.getTime() + DAY))).toBe(true);
    expect(currentRetrievability(NEW_CARD, start)).toBe(0);
  });

  it("no pasa del máximo de un año", () => {
    const { intervals } = simulate(Array(30).fill("easy"), 1);
    expect(Math.max(...intervals)).toBeLessThanOrEqual(365);
  });
});
