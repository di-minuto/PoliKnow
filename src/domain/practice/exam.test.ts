import { describe, expect, it } from "vitest";
import {
  examConfigInput,
  formatClock,
  isExpired,
  readExamConfigForm,
  remainingSeconds,
  studyRecommendations,
  usedSeconds,
  type ExamReport,
} from "./exam";

const SUBJECT = "7d4f2b8e-0c1a-4d3b-9e6f-1a2b3c4d5e6f";
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";

function form(entries: [string, string][]) {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

describe("configuración del simulacro", () => {
  it("lee temas con peso, penalización con coma y volver atrás", () => {
    const parsed = examConfigInput.parse(
      readExamConfigForm(
        form([
          ["subjectId", SUBJECT],
          ["topic", T1],
          ["weight:" + T1, "3"],
          ["topic", T2],
          ["count", "12"],
          ["durationMinutes", "90"],
          ["penalty", "0,33"],
        ]),
      ),
    );
    expect(parsed.topics).toEqual([
      { topicId: T1, weight: 3 },
      { topicId: T2, weight: 1 },
    ]);
    expect(parsed).toMatchObject({ count: 12, durationMinutes: 90, penalty: 0.33, allowBack: false });
  });

  it("valores por defecto y errores", () => {
    expect(examConfigInput.parse(readExamConfigForm(form([["subjectId", SUBJECT], ["allowBack", "on"]])))).toMatchObject({
      count: 20,
      durationMinutes: 60,
      penalty: 0,
      allowBack: true,
    });
    expect(examConfigInput.safeParse(readExamConfigForm(form([["subjectId", SUBJECT], ["penalty", "2"]]))).success).toBe(false);
    expect(
      examConfigInput.safeParse(readExamConfigForm(form([["subjectId", SUBJECT], ["topic", T1], ["weight:" + T1, "0"]]))).success,
    ).toBe(false);
  });
});

describe("cronómetro", () => {
  const start = "2026-10-20T10:00:00Z";
  it("cuenta atrás, margen y tiempo usado", () => {
    expect(remainingSeconds(start, 600, new Date("2026-10-20T10:04:00Z"))).toBe(360);
    expect(remainingSeconds(start, 600, new Date("2026-10-20T11:00:00Z"))).toBe(0);
    expect(remainingSeconds(start, null, new Date())).toBeNull();
    expect(isExpired(start, 600, new Date("2026-10-20T10:10:20Z"))).toBe(false);
    expect(isExpired(start, 600, new Date("2026-10-20T10:11:00Z"))).toBe(true);
    expect(usedSeconds(start, 600, new Date("2026-10-20T10:30:00Z"))).toBe(600);
  });
  it("formatea", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(-3)).toBe("0:00");
  });
});

describe("recomendaciones", () => {
  const base: ExamReport = {
    grade: 5,
    total: 10,
    incorrect: 2,
    unanswered: 0,
    pending: 0,
    penaltyLost: 0,
    maxScore: 10,
    timeUsedSeconds: 1000,
    timeLimitSeconds: 3600,
    byTopic: [],
  };
  it("señala temas flojos, penalización y tiempo", () => {
    const tips = studyRecommendations({
      ...base,
      penaltyLost: 1,
      unanswered: 3,
      timeUsedSeconds: 3600,
      byTopic: [
        { name: "Tema 2", grade: 2, count: 4 },
        { name: "Tema 1", grade: 9, count: 3 },
      ],
    });
    expect(tips[0]).toContain("Tema 2 (2)");
    expect(tips.join(" ")).toContain("Tema 1 lo llevas bien");
    expect(tips.join(" ")).toContain("te han restado 1 puntos (10%");
    expect(tips.join(" ")).toContain("Se te acabó el tiempo con 3");
  });
  it("siempre da algún consejo", () => {
    expect(studyRecommendations({ ...base, grade: 9.5, timeUsedSeconds: 3000 })).toHaveLength(1);
  });
});
