import { describe, expect, it } from "vitest";
import { applySession, EMPTY_TOPIC_STATE, effectiveMinutes, type SessionOutcome } from "./session";

const base: SessionOutcome = { taskType: "theory", plannedMinutes: 40, measuredMinutes: 0, completion: "yes", difficulty: 3, notUnderstood: false };

describe("cierre de sesión", () => {
  it("cuenta los minutos según lo completado y el cronómetro", () => {
    expect(effectiveMinutes(base)).toBe(40);
    expect(effectiveMinutes({ ...base, completion: "partial" })).toBe(20);
    expect(effectiveMinutes({ ...base, completion: "no" })).toBe(0);
    expect(effectiveMinutes({ ...base, measuredMinutes: 200 })).toBe(60);
    expect(effectiveMinutes({ ...base, measuredMinutes: 1 })).toBe(40);
    expect(effectiveMinutes({ ...base, completion: "partial", measuredMinutes: 15 })).toBe(15);
  });

  it("avanza la cobertura y ajusta la prioridad por dificultad", () => {
    const s = applySession(EMPTY_TOPIC_STATE, base, 120, "2026-10-12");
    expect(s.coverage).toBeCloseTo(1 / 3);
    expect(s.lastStudiedDay).toBe("2026-10-12");
    expect(s.priorityAdjustment).toBe(0);
    const hard = applySession(EMPTY_TOPIC_STATE, { ...base, difficulty: 5 }, 120, "2026-10-12");
    expect(hard.coverage).toBeLessThan(s.coverage);
    expect(hard.priorityAdjustment).toBe(0.2);
    expect(hard.nextReviewDay).toBe("2026-10-13");
    const easy = applySession(EMPTY_TOPIC_STATE, { ...base, difficulty: 1 }, 120, "2026-10-12");
    expect(easy.priorityAdjustment).toBe(-0.15);
  });

  it("«no lo he entendido» sube prioridad y trae un repaso mañana", () => {
    const s = applySession(EMPTY_TOPIC_STATE, { ...base, notUnderstood: true }, 120, "2026-10-12");
    expect(s).toMatchObject({ notUnderstoodCount: 1, priorityAdjustment: 0.25, nextReviewDay: "2026-10-13" });
    expect(s.coverage).toBeCloseTo(1 / 6);
  });

  it("un repaso bien hecho aleja el siguiente", () => {
    const s = applySession({ ...EMPTY_TOPIC_STATE, mastery: 0.5, coverage: 1 }, { ...base, taskType: "review", difficulty: 2 }, 120, "2026-10-12");
    expect(s.nextReviewDay).toBe("2026-10-20");
    expect(s.coverage).toBe(1);
  });
});
