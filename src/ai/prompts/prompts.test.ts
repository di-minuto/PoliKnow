import { describe, expect, it } from "vitest";
import { planImport } from "@/domain/questions/import";
import { assistantRequest } from "./assistant";
import { explainAnswerRequest } from "./explain-answer";
import { generateQuestionsRequest, generatedQuestionsSchema, toImportFile } from "./generate-questions";
import { clip, sourcesBlock } from "./shared";

const sources = [
  { title: "Apuntes OpenMP", location: "pág. 3", text: "La cláusula reduction crea una copia privada por hilo." },
  { title: "Diapositivas", location: null, text: "critical serializa un bloque; atomic, una operación." },
];

describe("fuentes", () => {
  it("se numeran con título y página", () => {
    expect(sourcesBlock(sources)).toBe(
      "[1] «Apuntes OpenMP» (pág. 3)\nLa cláusula reduction crea una copia privada por hilo.\n\n[2] «Diapositivas»\ncritical serializa un bloque; atomic, una operación.",
    );
  });

  it("recorta sin partir palabras", () => {
    expect(clip("uno dos tres cuatro", 10)).toBe("uno dos…");
  });
});

describe("generar preguntas", () => {
  const request = generateQuestionsRequest({
    subject: "CPA",
    topic: "Tema 2: OpenMP",
    count: 3,
    types: ["multiple_choice", "true_false"],
    difficulty: null,
    sources,
    avoid: ["¿Qué hace nowait?"],
  });

  it("pide solo los tipos elegidos, evita repetidas y lleva las fuentes", () => {
    const text = request.messages[0].content;
    expect(text).toContain("Genera 3 preguntas");
    expect(text).toContain('"type":"multiple_choice"');
    expect(text).not.toContain('"type":"numeric"');
    expect(text).toContain("¿Qué hace nowait?");
    expect(text).toContain("[1] «Apuntes OpenMP»");
    expect(request.task).toBe("generate_questions");
    expect(request.promptVersion).toBeTruthy();
  });

  it("lo generado entra siempre como IA y por revisar, nunca como oficial", () => {
    const ai = generatedQuestionsSchema.parse({
      questions: [
        { type: "true_false", stem: "reduction combina resultados.", answer: true, source: "official_exam", position: 1 },
        { type: "numeric", stem: "No pedida", answer: 3 },
        { type: "multiple_choice", stem: "¿Cuál serializa un bloque?", options: ["atomic", "critical"], answer: "B" },
      ],
    });
    const file = toImportFile(ai, { model: "anthropic/m", topic: "Tema 2", types: ["true_false", "multiple_choice"], limit: 5 });
    expect(file.questions).toHaveLength(2);
    const plan = planImport(file, {
      subjectId: "00000000-0000-4000-8000-000000000001",
      topics: [{ id: "00000000-0000-4000-8000-000000000002", name: "Tema 2: OpenMP" }],
      questionTypes: ["true_false", "multiple_choice"],
    });
    if ("fatal" in plan) throw new Error(plan.fatal);
    expect(plan.errors).toEqual([]);
    expect(plan.questions.map((q) => [q.sourceType, q.reviewStatus, q.aiModel, q.officialExamId, q.topicId])).toEqual([
      ["ai_generated", "draft", "anthropic/m", null, "00000000-0000-4000-8000-000000000002"],
      ["ai_generated", "draft", "anthropic/m", null, "00000000-0000-4000-8000-000000000002"],
    ]);
  });
});

describe("explicar un fallo", () => {
  it("incluye opciones con letra, la respuesta correcta y la dada", () => {
    const text = explainAnswerRequest({
      stem: "¿Qué cláusula combina resultados?",
      options: ["private", "reduction"],
      correct: "B) reduction",
      given: "A",
      explanation: null,
      sources: [],
    }).messages[0].content;
    expect(text).toContain("A) private\nB) reduction");
    expect(text).toContain("Respuesta correcta: B) reduction");
    expect(text).toContain("Mi respuesta: A");
  });
});

describe("asistente", () => {
  it("pone fuentes y estado en el system y limita el historial", () => {
    const history = Array.from({ length: 12 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `m${i}` }));
    const request = assistantRequest({ history, sources, studyState: "Temas débiles: Tema 2.", questions: [] });
    expect(request.system).toContain("FUENTES");
    expect(request.system).toContain("[2] «Diapositivas»");
    expect(request.system).toContain("Temas débiles: Tema 2.");
    expect(request.messages).toHaveLength(8);
    expect(request.messages.at(-1)?.content).toBe("m11");
  });

  it("sin fuentes lo dice para que no invente citas", () => {
    expect(assistantRequest({ history: [{ role: "user", content: "hola" }], sources: [], studyState: "", questions: [] }).system).toContain(
      "no se ha encontrado nada en sus documentos",
    );
  });
});
