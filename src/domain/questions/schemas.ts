import { z } from "zod";
import {
  emptyToNull,
  id,
  optionalId,
  optionalInt,
  optionalNumber,
  optionalText,
  requiredText,
} from "@/domain/academic/schemas";
import { bodyKind, bodySchema, parseLocaleNumber, type QuestionBody } from "./body";
import { SOURCE_TYPES, validateProvenance, type ReviewStatus, type SourceType } from "./types";

/** Datos comunes de una pregunta (sin el cuerpo, que depende del tipo). */
export const questionMetaInput = z.object({
  subjectId: id,
  topicId: optionalId,
  subtopic: optionalText(200),
  questionType: z.string({ error: "Elige el tipo de pregunta." }).trim().min(1, "Elige el tipo de pregunta.").max(40),
  sourceType: z.enum(SOURCE_TYPES, { error: "Indica de dónde sale la pregunta." }),
  stem: requiredText(20000, "El enunciado"),
  explanation: optionalText(20000),
  difficulty: z.preprocess((v) => (v == null || v === "" ? undefined : v), z.coerce.number().int().min(1).max(5).default(3)),
  documentId: optionalId,
  sourceRef: optionalText(200),
  officialExamId: optionalId,
  officialPosition: optionalInt(1, 500),
  points: optionalNumber(0, 1000),
  originalText: optionalText(20000),
  tags: z.array(z.string().trim().min(1).max(40)).max(20, "Máximo 20 etiquetas.").default([]),
  variantOf: optionalId,
  aiModel: optionalText(100),
  reviewStatus: z.enum(["draft", "approved", "rejected"]).default("approved"),
});
export type QuestionMeta = z.infer<typeof questionMetaInput>;
export type QuestionInput = QuestionMeta & QuestionBody;

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? "Datos no válidos.";

/** Valida una pregunta completa: datos comunes, cuerpo según el tipo y procedencia. */
export function parseQuestion(raw: Record<string, unknown>): ParseResult<QuestionInput> {
  const meta = questionMetaInput.safeParse(raw);
  if (!meta.success) return { ok: false, error: firstIssue(meta.error) };
  const body = bodySchema(meta.data.questionType).safeParse({ content: raw.content, answer: raw.answer });
  if (!body.success) return { ok: false, error: firstIssue(body.error) };
  const provenance = validateProvenance(meta.data);
  if (provenance) return { ok: false, error: provenance };
  return { ok: true, data: { ...meta.data, ...body.data } };
}

/** Etiquetas escritas separadas por comas. */
export function parseTags(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return [...new Set(raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

/**
 * Convierte el formulario del editor en la forma que valida parseQuestion.
 * Campos del cuerpo: option[] + correct[] + multiple (test), tfValue,
 * accepted (una por línea), numericValue/tolerance/unit, language/code, model.
 */
export function readQuestionForm(formData: FormData): Record<string, unknown> {
  const questionType = str(formData.get("questionType"));
  const kind = bodyKind(questionType);
  let content: unknown = {};
  let answer: unknown = {};

  if (kind === "choice") {
    const all = formData.getAll("option").map(str);
    const correctIdx = new Set(formData.getAll("correct").map((v) => Number(v)));
    // Las opciones vacías se quitan y los índices de las correctas se recolocan.
    const options: string[] = [];
    const correct: number[] = [];
    all.forEach((option, i) => {
      if (!option.trim()) return;
      if (correctIdx.has(i)) correct.push(options.length);
      options.push(option);
    });
    content = { options, multiple: formData.get("multiple") === "on" };
    answer = { correct };
  } else if (kind === "true_false") {
    const v = str(formData.get("tfValue"));
    answer = { value: v === "true" ? true : v === "false" ? false : undefined };
  } else if (kind === "short_answer") {
    answer = { accepted: str(formData.get("accepted")).split("\n") };
  } else if (kind === "numeric") {
    content = { unit: str(formData.get("unit")), tolerance: parseLocaleNumber(formData.get("tolerance")) ?? 0 };
    answer = { value: parseLocaleNumber(formData.get("numericValue")) ?? undefined };
  } else if (kind === "code") {
    content = { language: str(formData.get("language")), code: str(formData.get("code")) };
    answer = { model: str(formData.get("model")) };
  } else {
    answer = { model: str(formData.get("model")) };
  }

  return {
    subjectId: formData.get("subjectId"),
    topicId: formData.get("topicId"),
    subtopic: formData.get("subtopic"),
    questionType,
    sourceType: formData.get("sourceType"),
    stem: formData.get("stem"),
    explanation: formData.get("explanation"),
    difficulty: formData.get("difficulty"),
    documentId: formData.get("documentId"),
    sourceRef: formData.get("sourceRef"),
    officialExamId: formData.get("sourceType") === "official_exam" ? formData.get("officialExamId") : null,
    officialPosition: formData.get("sourceType") === "official_exam" ? formData.get("officialPosition") : null,
    points: formData.get("points"),
    originalText: formData.get("originalText"),
    tags: parseTags(formData.get("tags")),
    variantOf: formData.get("variantOf"),
    aiModel: formData.get("aiModel"),
    content,
    answer,
  };
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  draft: "Por revisar",
  approved: "Aprobada",
  rejected: "Descartada",
};

/** Fuentes que se pueden elegir a mano (las de IA solo llegan importadas o generadas). */
export const MANUAL_SOURCE_TYPES: SourceType[] = ["manual", "course_material", "official_exam"];

// ---------------------------------------------------------------- exámenes oficiales

export const officialExamInput = z.object({
  subjectId: id,
  assessmentId: optionalId,
  documentId: optionalId,
  solutionDocumentId: optionalId,
  title: requiredText(200, "El título"),
  year: optionalInt(1990, 2100),
  examSession: optionalText(40),
  examDate: z.preprocess(
    emptyToNull,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida.").nullable().default(null),
  ),
  durationMinutes: optionalInt(1, 600),
  totalPoints: optionalNumber(0, 1000),
  wrongAnswerPenalty: optionalNumber(0, 1),
  instructions: optionalText(5000),
});
export type OfficialExamInput = z.infer<typeof officialExamInput>;
