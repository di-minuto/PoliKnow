import { z } from "zod";
import { bodyKind, parseLocaleNumber } from "./body";
import { normalizeAnswer } from "./grading";
import { parseQuestion, type OfficialExamInput, type QuestionInput } from "./schemas";
import { SOURCE_TYPES, type SourceType } from "./types";

/*
 * Importación de preguntas desde JSON (escrito a mano o por otra herramienta).
 * Formato documentado en la página /preguntas/importar y en IMPORT_EXAMPLE.
 * Si el archivo trae "exam", todas las preguntas son de ese examen oficial.
 */

const ALIASES: Record<string, string> = {
  test: "multiple_choice",
  tipo_test: "multiple_choice",
  vf: "true_false",
  verdadero_falso: "true_false",
  corta: "short_answer",
  numerico: "numeric",
  programacion: "programming",
  completar_codigo: "code_completion",
  errores: "find_errors",
  teoria: "theory",
  problema: "long_problem",
};

const rawQuestion = z.looseObject({
  type: z.string({ error: "Falta «type»." }),
  stem: z.string({ error: "Falta «stem» (el enunciado)." }),
  options: z.array(z.string()).optional(),
  multiple: z.boolean().optional(),
  answer: z.unknown().optional(),
  explanation: z.string().optional(),
  topic: z.string().optional(),
  subtopic: z.string().optional(),
  difficulty: z.number().optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
  ai_model: z.string().optional(),
  source_ref: z.string().optional(),
  points: z.number().optional(),
  position: z.number().optional(),
  unit: z.string().optional(),
  tolerance: z.number().optional(),
  language: z.string().optional(),
  code: z.string().optional(),
  original_text: z.string().optional(),
});

const rawExam = z.looseObject({
  title: z.string({ error: "El examen necesita «title»." }).min(1, "El examen necesita «title»."),
  year: z.number().int().optional(),
  session: z.string().optional(),
  date: z.string().optional(),
  duration_minutes: z.number().int().optional(),
  total_points: z.number().optional(),
  wrong_answer_penalty: z.number().optional(),
  instructions: z.string().optional(),
});

const rawFile = z.object({
  exam: rawExam.optional(),
  questions: z.array(z.unknown(), { error: "Falta la lista «questions»." }).min(1, "La lista «questions» está vacía.").max(500, "Máximo 500 preguntas por archivo."),
});

/** Marcador de examen mientras se valida (se sustituye por el real al guardar). */
export const PENDING_EXAM_ID = "00000000-0000-4000-8000-000000000000";

export type ImportTopic = { id: string; name: string };

export type ImportPlan = {
  exam: Omit<OfficialExamInput, "subjectId"> | null;
  questions: QuestionInput[];
  errors: { index: number; error: string }[];
  warnings: string[];
};

/** Busca el tema por nombre: igual sin tildes, o el único que empieza así ("Tema 2" → "Tema 2: OpenMP"). */
export function matchTopic(name: string, topics: readonly ImportTopic[]): string | null {
  const wanted = normalizeAnswer(name);
  if (!wanted) return null;
  const exact = topics.find((t) => normalizeAnswer(t.name) === wanted);
  if (exact) return exact.id;
  const prefix = topics.filter((t) => {
    const n = normalizeAnswer(t.name);
    return n.startsWith(wanted) && /^(?:[\s:\-–]|\.(?!\d)|$)/.test(n.slice(wanted.length));
  });
  return prefix.length === 1 ? prefix[0].id : null;
}

function choiceIndex(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^[A-Ja-j]$/.test(value.trim())) return value.trim().toUpperCase().charCodeAt(0) - 65;
  return null;
}

function toBody(type: string, q: z.infer<typeof rawQuestion>): { content: unknown; answer: unknown } {
  switch (bodyKind(type)) {
    case "choice": {
      const list = Array.isArray(q.answer) ? q.answer : [q.answer];
      const correct = list.map(choiceIndex);
      return {
        content: { options: q.options ?? [], multiple: q.multiple ?? list.length > 1 },
        answer: { correct: correct.every((c) => c !== null) ? correct : [] },
      };
    }
    case "true_false": {
      const a = typeof q.answer === "string" ? normalizeAnswer(q.answer) : q.answer;
      const value =
        a === true || a === "true" || a === "v" || a === "verdadero"
          ? true
          : a === false || a === "false" || a === "f" || a === "falso"
            ? false
            : undefined;
      return { content: {}, answer: { value } };
    }
    case "short_answer":
      return {
        content: {},
        answer: { accepted: (Array.isArray(q.answer) ? q.answer : [q.answer]).filter((x) => typeof x === "string") },
      };
    case "numeric":
      return {
        content: { unit: q.unit ?? null, tolerance: q.tolerance ?? 0 },
        answer: { value: parseLocaleNumber(q.answer) ?? undefined },
      };
    case "code":
      return {
        content: { language: q.language ?? null, code: q.code ?? null },
        answer: { model: typeof q.answer === "string" ? q.answer : null },
      };
    default:
      return { content: {}, answer: { model: typeof q.answer === "string" ? q.answer : null } };
  }
}

/** Analiza el JSON y devuelve lo que se importaría, con errores por pregunta. */
export function planImport(
  json: unknown,
  ctx: { subjectId: string; topics: readonly ImportTopic[]; questionTypes: readonly string[] },
): ImportPlan | { fatal: string } {
  const file = rawFile.safeParse(json);
  if (!file.success) return { fatal: file.error.issues[0]?.message ?? "El archivo no tiene el formato esperado." };

  const exam = file.data.exam
    ? {
        assessmentId: null,
        documentId: null,
        solutionDocumentId: null,
        title: file.data.exam.title.trim(),
        year: file.data.exam.year ?? null,
        examSession: file.data.exam.session?.trim() || null,
        examDate: file.data.exam.date && /^\d{4}-\d{2}-\d{2}$/.test(file.data.exam.date) ? file.data.exam.date : null,
        durationMinutes: file.data.exam.duration_minutes ?? null,
        totalPoints: file.data.exam.total_points ?? null,
        wrongAnswerPenalty: file.data.exam.wrong_answer_penalty ?? null,
        instructions: file.data.exam.instructions?.trim() || null,
      }
    : null;

  const plan: ImportPlan = { exam, questions: [], errors: [], warnings: [] };
  const unmatched = new Set<string>();

  file.data.questions.forEach((rawItem, i) => {
    const index = i + 1;
    const item = rawQuestion.safeParse(rawItem);
    if (!item.success) return plan.errors.push({ index, error: item.error.issues[0]?.message ?? "Pregunta no válida." });
    const q = item.data;

    const type = ALIASES[normalizeAnswer(q.type).replace(/[\s/-]+/g, "_")] ?? q.type.trim();
    if (!ctx.questionTypes.includes(type)) return plan.errors.push({ index, error: `Tipo desconocido: «${q.type}».` });

    const source = (q.source?.trim() || (exam ? "official_exam" : "manual")) as SourceType;
    if (!(SOURCE_TYPES as readonly string[]).includes(source)) {
      return plan.errors.push({ index, error: `«source» no válido: «${q.source}».` });
    }
    if (exam && source !== "official_exam") {
      return plan.errors.push({
        index,
        error: "En un archivo con «exam» todas las preguntas son del examen oficial (no se mezclan con otras).",
      });
    }
    if (!exam && source === "official_exam") {
      return plan.errors.push({ index, error: "Para preguntas de examen oficial, añade el bloque «exam» al archivo." });
    }

    let topicId: string | null = null;
    if (q.topic) {
      topicId = matchTopic(q.topic, ctx.topics);
      if (!topicId) unmatched.add(q.topic);
    }

    const parsed = parseQuestion({
      subjectId: ctx.subjectId,
      topicId,
      subtopic: q.subtopic ?? null,
      questionType: type,
      sourceType: source,
      stem: q.stem,
      explanation: q.explanation ?? null,
      difficulty: q.difficulty ?? 3,
      sourceRef: q.source_ref ?? null,
      officialExamId: source === "official_exam" ? PENDING_EXAM_ID : null,
      officialPosition: source === "official_exam" ? (q.position ?? index) : null,
      points: q.points ?? null,
      originalText: q.original_text ?? null,
      tags: (q.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
      aiModel: q.ai_model ?? null,
      // Lo generado por IA entra pendiente de revisar.
      reviewStatus: source === "ai_generated" ? "draft" : "approved",
      ...toBody(type, q),
    });
    if (!parsed.ok) return plan.errors.push({ index, error: parsed.error });
    plan.questions.push(parsed.data);
  });

  for (const name of unmatched) plan.warnings.push(`No hay ningún tema llamado «${name}»: esas preguntas quedarán sin tema.`);
  return plan;
}

export const IMPORT_EXAMPLE = {
  exam: {
    title: "Examen enero 2025",
    year: 2025,
    session: "enero",
    duration_minutes: 120,
    total_points: 10,
    wrong_answer_penalty: 0.33,
  },
  questions: [
    {
      type: "multiple_choice",
      topic: "Tema 2",
      stem: "¿Qué cláusula de OpenMP combina los resultados parciales de cada hilo?",
      options: ["private", "reduction", "shared", "nowait"],
      answer: "B",
      explanation: "reduction crea una copia privada por hilo y las combina al final.",
      points: 0.5,
    },
    { type: "true_false", stem: "Una sección crítica puede ejecutarla más de un hilo a la vez.", answer: false, points: 0.5 },
    { type: "numeric", stem: "Speedup con 4 hilos si T1 = 12 s y T4 = 4 s.", answer: 3, tolerance: 0.01, points: 1 },
    {
      type: "programming",
      stem: "Paraleliza el bucle con OpenMP.",
      language: "c",
      code: "for (i = 0; i < n; i++) s += a[i];",
      answer: "#pragma omp parallel for reduction(+:s)\nfor (i = 0; i < n; i++) s += a[i];",
      points: 2,
    },
  ],
};
