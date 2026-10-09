"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  analyzeDocumentRequest,
  documentAnalysisSchema,
  explainAnswerRequest,
  generateQuestionsRequest,
  generatedQuestionsSchema,
  isGeneratableType,
  toImportFile,
  type GeneratableType,
} from "@/ai/prompts";
import { matchTopic, planImport } from "@/domain/questions/import";
import { solutionText } from "@/domain/questions/solution";
import { describeResponse } from "@/components/practice/response-view";
import { failure, type ActionState } from "@/lib/action-state";
import { aiErrorMessage, runAI, runAIJson } from "@/server/ai";
import { documentSources, searchSources, topicSources, type Source } from "@/server/ai-context";
import { getCurrentUser } from "@/server/auth";
import { getSubject, listTopics } from "@/server/repositories/academic";
import { addDocumentTopics, getDocument, saveDocumentAnalysis } from "@/server/repositories/documents";
import { getItem } from "@/server/repositories/practice";
import * as questions from "@/server/repositories/questions";

/*
 * Funciones de IA. Todas pasan por runAI (caché + tope diario) y nada de lo
 * generado se presenta como oficial: las preguntas entran «Por revisar».
 */

const uuid = z.uuid();
const MAX_GENERATE = 15;

const generateInput = z.object({
  subjectId: uuid,
  topicId: uuid.nullable(),
  documentId: uuid.nullable(),
  count: z.coerce.number().int().min(1).max(MAX_GENERATE),
  types: z.array(z.string()).min(1, "Elige al menos un tipo de pregunta."),
  difficulty: z.coerce.number().int().min(1).max(5).nullable(),
  instructions: z.string().trim().max(500).nullable(),
});

const orNull = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export async function generateQuestionsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  const parsed = generateInput.safeParse({
    subjectId: formData.get("subjectId"),
    topicId: orNull(formData.get("topicId")),
    documentId: orNull(formData.get("documentId")),
    count: formData.get("count"),
    types: formData.getAll("types"),
    difficulty: orNull(formData.get("difficulty")),
    instructions: orNull(formData.get("instructions")),
  });
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  const input = parsed.data;
  const types = input.types.filter(isGeneratableType) as GeneratableType[];
  if (types.length === 0) return failure("Elige al menos un tipo de pregunta.");

  let created = 0;
  try {
    const [subject, topics] = await Promise.all([getSubject(input.subjectId), listTopics(input.subjectId)]);
    if (!subject) return failure("Asignatura no encontrada.");
    const topic = input.topicId ? topics.find((t) => t.id === input.topicId) : null;
    if (input.topicId && !topic) return failure("Ese tema no es de la asignatura.");
    const doc = input.documentId ? await getDocument(input.documentId) : null;
    if (input.documentId && doc?.subjectId !== input.subjectId) return failure("Ese documento no es de la asignatura.");

    const sources: Source[] = doc
      ? await documentSources(doc.id, { focus: topic?.name ?? null })
      : topic
        ? await topicSources(topic.id, topic.name, input.subjectId)
        : await searchSources(subject.name, { subjectId: input.subjectId });
    if (sources.length === 0) {
      return failure(
        doc
          ? "Ese documento no tiene texto. Si es un escaneo, usa «Reconocer texto (OCR)» en su ficha."
          : "No hay texto de tus apuntes para ese tema. Sube documentos y asígnalos al tema, o elige un documento.",
      );
    }

    const existing = await questions.listQuestions({ subjectId: input.subjectId, topicIds: topic ? [topic.id] : undefined });
    const request = generateQuestionsRequest({
      subject: subject.code ? `${subject.code} · ${subject.name}` : subject.name,
      topic: topic?.name ?? null,
      count: input.count,
      types,
      difficulty: input.difficulty,
      sources,
      avoid: existing.questions.slice(0, 25).map((q) => q.stem),
      instructions: input.instructions,
    });
    const { data, result } = await runAIJson(request, generatedQuestionsSchema);

    const file = toImportFile(data, { model: `${result.provider}/${result.model}`, topic: topic?.name ?? null, types, limit: input.count });
    const typeCodes = (await questions.listQuestionTypes()).map((t) => t.code);
    const plan = planImport(file, { subjectId: input.subjectId, topics: topics.map((t) => ({ id: t.id, name: t.name })), questionTypes: typeCodes });
    if ("fatal" in plan || plan.questions.length === 0) {
      return failure("La IA no ha devuelto preguntas válidas. Prueba otra vez o con otro documento.");
    }
    const single = sources.every((s) => s.documentId === sources[0].documentId) ? sources[0].documentId : null;
    created = await questions.createQuestions(
      plan.questions.map((q) => ({ ...q, topicId: topic?.id ?? q.topicId, documentId: single, reviewStatus: "draft" as const })),
    );
  } catch (error) {
    return failure(aiErrorMessage(error));
  }
  revalidatePath("/preguntas", "layout");
  redirect(`/preguntas?asignatura=${input.subjectId}&fuente=ai_generated&estado=revisar&nuevas=${created}`);
}

export type ExplainResult = { ok: true; text: string; cached: boolean } | { ok: false; error: string };

/** «Explícame por qué he fallado esta pregunta» (resultado de un test). */
export async function explainItemAction(itemId: string): Promise<ExplainResult> {
  await getCurrentUser();
  if (!uuid.safeParse(itemId).success) return { ok: false, error: "Pregunta no válida." };
  try {
    const item = await getItem(itemId);
    if (!item) return { ok: false, error: "Pregunta no encontrada." };
    if (item.attempts.status !== "finished") return { ok: false, error: "Termina el test antes de pedir la explicación." };
    const q = await questions.getQuestion(item.question_id);
    if (!q) return { ok: false, error: "Pregunta no encontrada." };
    const { options, correct } = solutionText(q);
    const response = (item.user_answer as { response?: unknown } | null)?.response ?? null;
    const sources = await searchSources(q.stem, { subjectId: q.subjectId, limit: 3, maxChars: 3600 });
    const request = explainAnswerRequest({
      stem: q.stem,
      options,
      correct,
      given: describeResponse(response),
      explanation: q.explanation,
      sources,
    });
    const result = await runAI(request, { cacheInput: { question: q.id, response, explanation: q.explanation } });
    const cited = sources.map((s, i) => `[${i + 1}] ${s.title}${s.location ? ` (${s.location})` : ""}`);
    const usedCitations = cited.filter((_, i) => result.text.includes(`[${i + 1}]`));
    const text = usedCitations.length ? `${result.text}\n\nFuentes:\n${usedCitations.map((c) => `- ${c}`).join("\n")}` : result.text;
    return { ok: true, text, cached: Boolean(result.cached) };
  } catch (error) {
    return { ok: false, error: aiErrorMessage(error) };
  }
}

/** Resume el documento, detecta conceptos y propone temas. Se guarda en el documento. */
export async function analyzeDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return failure("Documento no válido.");
  try {
    const doc = await getDocument(id.data);
    if (!doc) return failure("Documento no encontrado.");
    const [subject, topics, sources] = await Promise.all([
      getSubject(doc.subjectId),
      listTopics(doc.subjectId),
      documentSources(doc.id, { maxChars: 14_000 }),
    ]);
    if (sources.length === 0) return failure("Este documento no tiene texto que analizar.");
    const { data, result } = await runAIJson(
      analyzeDocumentRequest({
        title: doc.title,
        subject: subject?.name ?? "",
        text: sources.map((s) => s.text).join("\n\n"),
        topics: topics.map((t) => t.name),
      }),
      documentAnalysisSchema,
      { cacheInput: { document: doc.id, sha: doc.sha256, topics: topics.map((t) => t.name) } },
    );
    const topicIds = [...new Set(data.topics.map((name) => matchTopic(name, topics)).filter((t): t is string => Boolean(t)))];
    await saveDocumentAnalysis(doc.id, {
      summary: data.summary,
      concepts: data.concepts.slice(0, 12),
      topicIds,
      difficulty: data.difficulty,
      model: `${result.provider}/${result.model}`,
      at: new Date().toISOString(),
    });
  } catch (error) {
    return failure(aiErrorMessage(error));
  }
  revalidatePath(`/biblioteca/${id.data}`);
  return { ok: true, at: Date.now() };
}

/** Asigna al documento los temas que propuso el análisis. */
export async function applySuggestedTopicsAction(formData: FormData): Promise<void> {
  await getCurrentUser();
  const id = uuid.parse(formData.get("id"));
  const doc = await getDocument(id);
  if (doc?.analysis?.topicIds.length) {
    const own = new Set((await listTopics(doc.subjectId)).map((t) => t.id));
    await addDocumentTopics(id, doc.analysis.topicIds.filter((t) => own.has(t)));
  }
  revalidatePath("/biblioteca", "layout");
}

/** Aprueba de una vez las preguntas por revisar que se ven en la lista. */
export async function approveQuestionsAction(formData: FormData): Promise<void> {
  await getCurrentUser();
  const ids = formData.getAll("id").filter((v): v is string => typeof v === "string" && uuid.safeParse(v).success);
  for (const id of ids.slice(0, 100)) await questions.setQuestionFlags(id, { reviewStatus: "approved" });
  revalidatePath("/preguntas", "layout");
}
