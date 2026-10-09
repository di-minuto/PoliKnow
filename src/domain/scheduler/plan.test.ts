import { describe, expect, it } from "vitest";
import { addDays, plan, planSignature, type PlanInput, type TopicState } from "./plan";

const today = "2026-10-12"; // lunes
const everyDay = [120, 120, 120, 120, 120, 120, 120];

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    today,
    availability: everyDay,
    blockedDays: new Set(),
    usedToday: 0,
    subjects: [
      { id: "cpa", perceivedDifficulty: 3, importance: 3 },
      { id: "tsr", perceivedDifficulty: 3, importance: 3 },
    ],
    assessments: [
      {
        id: "p1",
        subjectId: "cpa",
        examDay: "2026-10-26",
        importance: 3,
        perceivedDifficulty: null,
        durationMinutes: 90,
        topics: [
          { topicId: "t1", weight: 1 },
          { topicId: "t2", weight: 1 },
        ],
      },
    ],
    topics: [
      { id: "t1", subjectId: "cpa", kind: "theory", estimatedMinutes: 120 },
      { id: "t2", subjectId: "cpa", kind: "theory", estimatedMinutes: 120 },
      { id: "l1", subjectId: "tsr", kind: "lab", estimatedMinutes: 60 },
    ],
    progress: new Map(),
    questionCounts: new Map([["t1", 12]]),
    assessmentQuestionCounts: new Map([["p1", 12]]),
    ...overrides,
  };
}

const minutesOf = (tasks: ReturnType<typeof plan>["tasks"], f: (t: (typeof tasks)[number]) => boolean) =>
  tasks.filter(f).reduce((s, t) => s + t.minutes, 0);

describe("planificador", () => {
  it("reparte todo el temario antes del examen, sin pasarse de la disponibilidad", () => {
    const { tasks, warnings } = plan(input());
    expect(warnings).toEqual([]);
    expect(minutesOf(tasks, (t) => t.topicId === "t1" && ["theory", "exercises"].includes(t.type))).toBe(120);
    expect(minutesOf(tasks, (t) => t.topicId === "t2" && ["theory", "exercises"].includes(t.type))).toBe(120);
    const byDay = new Map<string, number>();
    for (const t of tasks) byDay.set(t.day, (byDay.get(t.day) ?? 0) + t.minutes);
    for (const m of byDay.values()) expect(m).toBeLessThanOrEqual(120);
    expect(tasks.every((t) => t.day >= today && t.day < "2026-10-26")).toBe(true);
    // teoría y ejercicios en el mismo bloque (40 + 20)
    expect(tasks.find((t) => t.day === today && t.type === "theory")?.minutes).toBe(40);
    expect(tasks.find((t) => t.day === today && t.type === "exercises")?.minutes).toBe(20);
  });

  it("repaso espaciado, simulacro dos días antes y repaso general la víspera", () => {
    const { tasks } = plan(input());
    const reviews = tasks.filter((t) => t.topicId === "t1" && t.type === "review").map((t) => t.day);
    expect(reviews.length).toBeGreaterThanOrEqual(3);
    const gaps = reviews.slice(1).map((d, i) => Date.parse(d) - Date.parse(reviews[i]));
    expect(gaps.at(-2)! <= gaps.at(-1)! || reviews.at(-1) === "2026-10-25").toBe(true);
    expect(tasks.find((t) => t.type === "review" && t.topicId === "t1")?.questionCount).toBe(10);
    expect(tasks.find((t) => t.type === "exam_simulation")).toMatchObject({ day: "2026-10-24", minutes: 90 });
    expect(tasks.filter((t) => t.day === "2026-10-25" && t.type === "review").map((t) => t.topicId).sort()).toEqual(["t1", "t2"]);
  });

  it("respeta días bloqueados y lo ya hecho hoy", () => {
    const { tasks } = plan(input({ blockedDays: new Set([addDays(today, 1)]), usedToday: 100 }));
    expect(tasks.filter((t) => t.day === addDays(today, 1))).toEqual([]);
    expect(minutesOf(tasks, (t) => t.day === today)).toBeLessThanOrEqual(20);
  });

  it("lo estudiado o dominado no se vuelve a planificar; lo flojo va antes", () => {
    const progress = new Map<string, TopicState>([
      ["t1", { mastery: 0, coverage: 1, lastStudiedDay: "2026-10-10", nextReviewDay: null, notUnderstoodCount: 0, priorityAdjustment: 0 }],
    ]);
    const { tasks } = plan(input({ progress }));
    expect(minutesOf(tasks, (t) => t.topicId === "t1" && t.type === "theory")).toBe(0);
    expect(tasks.find((t) => t.topicId === "t1" && t.type === "review")?.day).toBe("2026-10-11" < today ? today : "2026-10-11");

    const weak = new Map<string, TopicState>([
      ["t2", { mastery: 0, coverage: 0, lastStudiedDay: null, nextReviewDay: null, notUnderstoodCount: 2, priorityAdjustment: 0.3 }],
      ["t1", { mastery: 0.9, coverage: 0, lastStudiedDay: null, nextReviewDay: null, notUnderstoodCount: 0, priorityAdjustment: -0.2 }],
    ]);
    const first = plan(input({ progress: weak })).tasks.find((t) => t.type === "theory");
    expect(first?.topicId).toBe("t2");
  });

  it("si no da tiempo, avisa de lo que falta", () => {
    const { warnings } = plan(input({ availability: [0, 30, 0, 0, 0, 0, 0] }));
    expect(warnings[0]).toMatchObject({ assessmentId: "p1" });
    expect(warnings[0].missingMinutes).toBeGreaterThan(100);
  });

  it("el examen más cercano tiene más urgencia", () => {
    const { tasks } = plan(
      input({
        assessments: [
          { id: "far", subjectId: "tsr", examDay: "2026-12-01", importance: 3, perceivedDifficulty: null, durationMinutes: null, topics: [{ topicId: "l1", weight: 1 }] },
          { id: "p1", subjectId: "cpa", examDay: "2026-10-20", importance: 3, perceivedDifficulty: null, durationMinutes: null, topics: [{ topicId: "t1", weight: 1 }] },
        ],
      }),
    );
    expect(tasks[0]).toMatchObject({ day: today, topicId: "t1", type: "theory" });
    expect(tasks.find((t) => t.topicId === "l1")?.type).toBe("practice");
  });

  it("un tema saltado hoy no vuelve a salir hoy", () => {
    const { tasks } = plan(input({ restToday: new Set(["t1"]) }));
    expect(tasks.filter((t) => t.day === today && t.topicId === "t1")).toEqual([]);
    expect(tasks.some((t) => t.day === today && t.topicId === "t2")).toBe(true);
  });

  it("los bloques son de 5 en 5 minutos", () => {
    const progress = new Map<string, TopicState>([
      ["t1", { mastery: 0, coverage: 0.37, lastStudiedDay: null, nextReviewDay: null, notUnderstoodCount: 0, priorityAdjustment: 0 }],
    ]);
    const { tasks } = plan(input({ progress }));
    expect(tasks.every((t) => t.minutes % 5 === 0)).toBe(true);
  });

  it("la firma no depende del orden", () => {
    const { tasks } = plan(input());
    expect(planSignature([...tasks].reverse())).toBe(planSignature(tasks));
  });
});
