import { describe, expect, it } from "vitest";
import { buildTopicTree, descendantIds, flattenTree, moveSibling, nextPosition, topicShares } from "./logic";
import { assessmentInput, availabilityInput, readAssessmentTopicsForm, subjectInput, topicInput } from "./schemas";
import type { Topic } from "./types";

const S = "11111111-1111-4111-8111-111111111111";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function topic(n: number, position: number, parent?: number): Topic {
  return {
    id: uuid(n),
    subjectId: S,
    parentId: parent ? uuid(parent) : null,
    name: `Tema ${n}`,
    description: null,
    kind: "theory",
    estimatedHours: null,
    position,
  };
}

describe("árbol de temas", () => {
  it("ordena por posición y anida subtemas", () => {
    const tree = buildTopicTree([topic(2, 1), topic(1, 0), topic(3, 0, 2)]);
    expect(tree.map((t) => t.name)).toEqual(["Tema 1", "Tema 2"]);
    expect(tree[1].children.map((t) => t.name)).toEqual(["Tema 3"]);
    expect(flattenTree(tree).map((t) => [t.name, t.depth])).toEqual([
      ["Tema 1", 0],
      ["Tema 2", 0],
      ["Tema 3", 1],
    ]);
  });

  it("trata como raíz un tema con padre inexistente", () => {
    expect(buildTopicTree([topic(1, 0, 99)])).toHaveLength(1);
  });

  it("calcula descendientes para impedir ciclos", () => {
    const topics = [topic(1, 0), topic(2, 0, 1), topic(3, 0, 2), topic(4, 1)];
    expect([...descendantIds(topics, uuid(1))].sort()).toEqual([uuid(1), uuid(2), uuid(3)]);
  });
});

describe("reordenar", () => {
  const items = [
    { id: "a", position: 0 },
    { id: "b", position: 1 },
    { id: "c", position: 2 },
  ];

  it("intercambia con el vecino", () => {
    expect(moveSibling(items, "b", "up")).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
    ]);
  });

  it("no hace nada en los extremos", () => {
    expect(moveSibling(items, "a", "up")).toEqual([]);
    expect(moveSibling(items, "c", "down")).toEqual([]);
  });

  it("normaliza posiciones con huecos", () => {
    const gaps = [
      { id: "a", position: 0 },
      { id: "b", position: 5 },
      { id: "c", position: 9 },
    ];
    expect(moveSibling(gaps, "c", "up")).toEqual([
      { id: "c", position: 1 },
      { id: "b", position: 2 },
    ]);
    expect(nextPosition(gaps)).toBe(10);
  });
});

describe("pesos por tema", () => {
  it("reparte proporcionalmente", () => {
    const shares = topicShares([
      { assessmentId: "x", topicId: "t1", weight: 1 },
      { assessmentId: "x", topicId: "t2", weight: 3 },
    ]);
    expect(shares.get("t1")).toBe(0.25);
    expect(shares.get("t2")).toBe(0.75);
  });

  it("si todos pesan 0 reparte a partes iguales", () => {
    const shares = topicShares([
      { assessmentId: "x", topicId: "t1", weight: 0 },
      { assessmentId: "x", topicId: "t2", weight: 0 },
    ]);
    expect(shares.get("t1")).toBe(0.5);
  });
});

describe("validación de formularios", () => {
  it("convierte campos vacíos en null y aplica valores por defecto", () => {
    const parsed = subjectInput.parse({ courseId: S, name: " CPA ", code: "", color: "#112233" });
    expect(parsed).toMatchObject({ name: "CPA", code: null, importance: 3, perceivedDifficulty: 3 });
  });

  it("exige nombre", () => {
    const res = topicInput.safeParse({ subjectId: S, name: "  " });
    expect(res.success).toBe(false);
  });

  it("valida evaluaciones", () => {
    const ok = assessmentInput.parse({
      subjectId: S,
      assessmentType: "partial",
      name: "Parcial 1",
      examAtLocal: "2026-11-05T09:00",
      durationMinutes: "120",
      importance: "5",
      perceivedDifficulty: "",
      gradeWeight: "",
    });
    expect(ok).toMatchObject({ durationMinutes: 120, importance: 5, perceivedDifficulty: null, gradeWeight: null });
    expect(assessmentInput.safeParse({ ...ok, durationMinutes: "-5" }).success).toBe(false);
  });

  it("lee los temas marcados de un parcial con sus pesos", () => {
    const fd = new FormData();
    fd.set("assessmentId", S);
    fd.append("topic", uuid(1));
    fd.append("topic", uuid(2));
    fd.set(`weight:${uuid(1)}`, "2");
    fd.set(`weight:${uuid(3)}`, "5"); // no marcado: se ignora
    expect(readAssessmentTopicsForm(fd).topics).toEqual([
      { topicId: uuid(1), weight: "2" },
      { topicId: uuid(2), weight: 1 },
    ]);
  });

  it("disponibilidad: 7 días, vacío = 0", () => {
    const parsed = availabilityInput.parse({ hoursByWeekday: ["", "2", "2.5", "3", "3", "1", "0"] });
    expect(parsed.hoursByWeekday).toEqual([0, 2, 2.5, 3, 3, 1, 0]);
  });
});
