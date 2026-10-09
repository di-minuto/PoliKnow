import { describe, expect, it } from "vitest";
import { bodySchema, parseLocaleNumber } from "./body";
import { gradeResponse, normalizeAnswer } from "./grading";
import { IMPORT_EXAMPLE, PENDING_EXAM_ID, matchTopic, planImport } from "./import";
import { parseQuestion, readQuestionForm } from "./schemas";
import { BUILTIN_QUESTION_TYPES } from "./types";

const SUBJECT = "11111111-1111-4111-8111-111111111111";
const EXAM = "22222222-2222-4222-8222-222222222222";
const TOPICS = [
  { id: "33333333-3333-4333-8333-333333333331", name: "Tema 1: Introducción" },
  { id: "33333333-3333-4333-8333-333333333332", name: "Tema 2: OpenMP" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Tema 2.1 Cláusulas" },
];

function form(entries: [string, string][]) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

describe("cuerpo de las preguntas", () => {
  it("valida un tipo test y ordena las correctas", () => {
    const ok = bodySchema("multiple_choice").safeParse({
      content: { options: ["a", "b", "c"], multiple: true },
      answer: { correct: [2, 0, 2] },
    });
    expect(ok.success && ok.data.answer).toEqual({ correct: [0, 2] });
  });

  it("rechaza tipo test sin correcta, con una correcta fuera de rango o con varias sin permitirlo", () => {
    const schema = bodySchema("multiple_choice");
    expect(schema.safeParse({ content: { options: ["a", "b"] }, answer: { correct: [] } }).success).toBe(false);
    expect(schema.safeParse({ content: { options: ["a", "b"] }, answer: { correct: [5] } }).success).toBe(false);
    expect(schema.safeParse({ content: { options: ["a", "b"] }, answer: { correct: [0, 1] } }).success).toBe(false);
  });

  it("lee números con coma decimal", () => {
    expect(parseLocaleNumber("3,5")).toBe(3.5);
    expect(parseLocaleNumber("1.234,5")).toBe(1234.5);
    expect(parseLocaleNumber("1e-3")).toBe(0.001);
    expect(parseLocaleNumber("abc")).toBeNull();
    expect(parseLocaleNumber("")).toBeNull();
  });
});

describe("corrección", () => {
  it("tipo test: exige exactamente las correctas", () => {
    const body = { content: { options: ["a", "b", "c"], multiple: true }, answer: { correct: [0, 2] } };
    expect(gradeResponse("multiple_choice", body, { kind: "choice", selected: [2, 0] })).toBe("correct");
    expect(gradeResponse("multiple_choice", body, { kind: "choice", selected: [0] })).toBe("incorrect");
  });

  it("respuesta corta: ignora tildes, mayúsculas y punto final", () => {
    const body = { content: {}, answer: { accepted: ["Exclusión mutua", "mutex"] } };
    expect(gradeResponse("short_answer", body as never, { kind: "text", value: "exclusion  MUTUA." })).toBe("correct");
    expect(gradeResponse("short_answer", body as never, { kind: "text", value: "" })).toBe("incorrect");
    expect(normalizeAnswer("¿Qué?")).toBe("¿que");
  });

  it("numérico: con tolerancia y coma decimal", () => {
    const body = { content: { unit: "s", tolerance: 0.05 }, answer: { value: 3.14 } };
    expect(gradeResponse("numeric", body, { kind: "text", value: "3,18" })).toBe("correct");
    expect(gradeResponse("numeric", body, { kind: "text", value: "3,2" })).toBe("incorrect");
    expect(gradeResponse("numeric", { content: { unit: null, tolerance: 0 }, answer: { value: 0.3 } }, { kind: "text", value: String(0.1 + 0.2) })).toBe("correct");
  });

  it("verdadero/falso y tipos abiertos", () => {
    expect(gradeResponse("true_false", { content: {}, answer: { value: false } } as never, { kind: "true_false", value: false })).toBe("correct");
    expect(gradeResponse("theory", { content: {}, answer: { model: "x" } } as never, { kind: "text", value: "y" })).toBe("self_assessed");
  });
});

describe("pregunta completa", () => {
  it("lee el formulario del editor y descarta opciones vacías", () => {
    const raw = readQuestionForm(
      form([
        ["subjectId", SUBJECT],
        ["questionType", "multiple_choice"],
        ["sourceType", "manual"],
        ["stem", "¿Cuál?"],
        ["option", "uno"],
        ["option", ""],
        ["option", "tres"],
        ["correct", "2"],
        ["tags", "openmp, Hilos, openmp"],
      ]),
    );
    const parsed = parseQuestion(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.content).toEqual({ options: ["uno", "tres"], multiple: false });
    expect(parsed.data.answer).toEqual({ correct: [1] });
    expect(parsed.data.tags).toEqual(["openmp", "hilos"]);
    expect(parsed.data.difficulty).toBe(3);
  });

  it("no deja una pregunta oficial sin examen ni una manual dentro de un examen", () => {
    const base = { subjectId: SUBJECT, questionType: "theory", stem: "Explica", answer: { model: null } };
    expect(parseQuestion({ ...base, sourceType: "official_exam" })).toMatchObject({ ok: false });
    expect(parseQuestion({ ...base, sourceType: "official_exam", officialExamId: EXAM }).ok).toBe(true);
    // El formulario ignora el examen si la fuente no es oficial.
    const raw = readQuestionForm(
      form([
        ["subjectId", SUBJECT],
        ["questionType", "theory"],
        ["sourceType", "manual"],
        ["stem", "Explica"],
        ["officialExamId", EXAM],
      ]),
    );
    expect(raw.officialExamId).toBeNull();
  });

  it("numérico desde el formulario", () => {
    const parsed = parseQuestion(
      readQuestionForm(
        form([
          ["subjectId", SUBJECT],
          ["questionType", "numeric"],
          ["sourceType", "manual"],
          ["stem", "Speedup"],
          ["numericValue", "2,5"],
          ["tolerance", ""],
          ["unit", ""],
        ]),
      ),
    );
    expect(parsed.ok && parsed.data.answer).toEqual({ value: 2.5 });
    expect(parsed.ok && parsed.data.content).toEqual({ unit: null, tolerance: 0 });
  });
});

describe("importación JSON", () => {
  const ctx = { subjectId: SUBJECT, topics: TOPICS, questionTypes: [...BUILTIN_QUESTION_TYPES] };

  it("encuentra temas por nombre o por el principio, sin tildes", () => {
    expect(matchTopic("tema 1: introduccion", TOPICS)).toBe(TOPICS[0].id);
    expect(matchTopic("Tema 1", TOPICS)).toBe(TOPICS[0].id);
    // "Tema 2.1" no cuenta como «empieza por Tema 2».
    expect(matchTopic("Tema 2", TOPICS)).toBe(TOPICS[1].id);
    expect(matchTopic("Tema 9", TOPICS)).toBeNull();
  });

  it("importa el ejemplo como examen oficial con posiciones y puntos", () => {
    const plan = planImport(IMPORT_EXAMPLE, ctx);
    if ("fatal" in plan) throw new Error(plan.fatal);
    expect(plan.errors).toEqual([]);
    expect(plan.exam).toMatchObject({ title: "Examen enero 2025", wrongAnswerPenalty: 0.33 });
    expect(plan.questions).toHaveLength(4);
    expect(plan.questions.every((q) => q.sourceType === "official_exam" && q.officialExamId === PENDING_EXAM_ID)).toBe(true);
    expect(plan.questions.map((q) => q.officialPosition)).toEqual([1, 2, 3, 4]);
    expect(plan.questions[0]).toMatchObject({ topicId: TOPICS[1].id, answer: { correct: [1] } });
    expect(plan.questions[1].answer).toEqual({ value: false });
    expect(plan.questions[3].content).toMatchObject({ language: "c" });
  });

  it("marca la IA como pendiente de revisar y exige el modelo", () => {
    const plan = planImport(
      {
        questions: [
          { type: "vf", stem: "x", answer: "V", source: "ai_generated", ai_model: "modelo-x" },
          { type: "vf", stem: "y", answer: "F", source: "ai_generated" },
          { type: "test", stem: "z", options: ["a", "b"], answer: ["A", "B"] },
        ],
      },
      ctx,
    );
    if ("fatal" in plan) throw new Error(plan.fatal);
    expect(plan.questions[0]).toMatchObject({ reviewStatus: "draft", aiModel: "modelo-x", answer: { value: true } });
    expect(plan.errors).toEqual([{ index: 2, error: expect.stringMatching(/modelo/) }]);
    expect(plan.questions[1]).toMatchObject({ sourceType: "manual", content: { multiple: true }, answer: { correct: [0, 1] } });
  });

  it("no mezcla preguntas oficiales con otras y avisa de temas desconocidos", () => {
    const plan = planImport(
      {
        exam: { title: "Junio" },
        questions: [
          { type: "theory", stem: "a", source: "manual" },
          { type: "theory", stem: "b", topic: "Tema inventado" },
          { type: "raro", stem: "c" },
        ],
      },
      ctx,
    );
    if ("fatal" in plan) throw new Error(plan.fatal);
    expect(plan.errors.map((e) => e.index)).toEqual([1, 3]);
    expect(plan.warnings[0]).toMatch(/Tema inventado/);
    expect(plan.questions[0].topicId).toBeNull();
  });

  it("errores generales del archivo", () => {
    expect(planImport({}, ctx)).toEqual({ fatal: expect.stringMatching(/questions/) });
    expect(planImport({ questions: [] }, ctx)).toEqual({ fatal: expect.stringMatching(/vacía/) });
    expect(planImport({ questions: [{ type: "theory", stem: "a" }] }, ctx)).toMatchObject({ errors: [] });
  });
});
