"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { firstError } from "@/domain/academic/schemas";
import { PENDING_EXAM_ID, planImport } from "@/domain/questions/import";
import { officialExamInput, parseQuestion, readQuestionForm, type QuestionInput } from "@/domain/questions/schemas";
import { failure, success, type ActionState } from "@/lib/action-state";
import { getCurrentUser } from "@/server/auth";
import { listAssessments, listTopics } from "@/server/repositories/academic";
import { listDocuments } from "@/server/repositories/documents";
import * as repo from "@/server/repositories/questions";

/*
 * Server Actions del banco de preguntas y de los exámenes oficiales.
 * Además de validar, comprueban que tema, examen y documento son de la
 * misma asignatura que la pregunta.
 */

const uuid = z.uuid();

const revalidate = () => {
  revalidatePath("/preguntas", "layout");
  revalidatePath("/examenes", "layout");
  revalidatePath("/asignaturas", "layout");
};

/** Comprueba que lo vinculado pertenece a la asignatura; devuelve un error legible o null. */
async function checkLinks(q: QuestionInput): Promise<string | null> {
  const [topics, exams, documents] = await Promise.all([
    q.topicId ? listTopics(q.subjectId) : Promise.resolve([]),
    q.officialExamId ? repo.listOfficialExams(q.subjectId) : Promise.resolve([]),
    q.documentId ? listDocuments({ subjectId: q.subjectId }) : Promise.resolve([]),
  ]);
  if (q.topicId && !topics.some((t) => t.id === q.topicId)) return "El tema no es de esta asignatura.";
  if (q.officialExamId && !exams.some((e) => e.id === q.officialExamId)) return "El examen no es de esta asignatura.";
  if (q.documentId && !documents.some((d) => d.id === q.documentId)) return "El documento no es de esta asignatura.";
  return null;
}

async function readQuestion(formData: FormData): Promise<{ ok: true; data: QuestionInput } | { ok: false; error: string }> {
  const parsed = parseQuestion(readQuestionForm(formData));
  if (!parsed.ok) return parsed;
  const linkError = await checkLinks(parsed.data);
  if (linkError) return { ok: false, error: linkError };
  const q = parsed.data;
  if (q.officialExamId && q.officialPosition === null) q.officialPosition = await repo.nextExamPosition(q.officialExamId);
  return { ok: true, data: q };
}

export async function createQuestionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  let id: string;
  try {
    const q = await readQuestion(formData);
    if (!q.ok) return failure(q.error);
    if (q.data.sourceType === "ai_generated") return failure("Las preguntas de IA solo se crean importándolas o generándolas.");
    // Las preguntas escritas a mano siempre entran aprobadas.
    id = await repo.createQuestion({ ...q.data, reviewStatus: "approved", aiModel: null });
  } catch (error) {
    console.error(error);
    return failure("No se ha podido guardar la pregunta. Inténtalo de nuevo.");
  }
  revalidate();
  redirect(`/preguntas/${id}?creada=1`);
}

export async function updateQuestionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return failure("Pregunta no válida.");
  try {
    const current = await repo.getQuestion(id.data);
    if (!current) return failure("La pregunta ya no existe.");
    // La procedencia de IA no se puede cambiar a mano: se conserva con su modelo.
    if (current.sourceType === "ai_generated") {
      formData.set("sourceType", "ai_generated");
      formData.set("aiModel", current.aiModel ?? "");
    }
    const q = await readQuestion(formData);
    if (!q.ok) return failure(q.error);
    await repo.updateQuestion(id.data, { ...q.data, aiModel: current.aiModel, reviewStatus: current.reviewStatus });
  } catch (error) {
    console.error(error);
    return failure("No se ha podido guardar. Inténtalo de nuevo.");
  }
  revalidate();
  return success();
}

export async function setQuestionReviewAction(formData: FormData): Promise<void> {
  await getCurrentUser();
  const status = z.enum(["approved", "rejected", "draft"]).parse(formData.get("reviewStatus"));
  await repo.setQuestionFlags(uuid.parse(formData.get("id")), { reviewStatus: status });
  revalidate();
}

export async function setQuestionArchivedAction(formData: FormData): Promise<void> {
  await getCurrentUser();
  await repo.setQuestionFlags(uuid.parse(formData.get("id")), { archived: formData.get("archived") === "true" });
  revalidate();
}

export async function deleteQuestionAction(formData: FormData): Promise<void> {
  await getCurrentUser();
  const id = uuid.parse(formData.get("id"));
  const question = await repo.getQuestion(id);
  await repo.deleteQuestion(id);
  revalidate();
  redirect(question?.officialExamId ? `/examenes/${question.officialExamId}` : "/preguntas");
}

// ---------------------------------------------------------------- exámenes oficiales

function readExamForm(formData: FormData) {
  return officialExamInput.safeParse(Object.fromEntries(formData.entries()));
}

async function checkExamLinks(input: z.infer<typeof officialExamInput>): Promise<string | null> {
  const [assessments, documents] = await Promise.all([
    input.assessmentId ? listAssessments(input.subjectId) : Promise.resolve([]),
    input.documentId || input.solutionDocumentId ? listDocuments({ subjectId: input.subjectId }) : Promise.resolve([]),
  ]);
  if (input.assessmentId && !assessments.some((a) => a.id === input.assessmentId)) return "La evaluación no es de esta asignatura.";
  for (const docId of [input.documentId, input.solutionDocumentId]) {
    if (docId && !documents.some((d) => d.id === docId)) return "El documento no es de esta asignatura.";
  }
  return null;
}

export async function createOfficialExamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  const parsed = readExamForm(formData);
  if (!parsed.success) return failure(firstError(parsed.error));
  let id: string;
  try {
    const linkError = await checkExamLinks(parsed.data);
    if (linkError) return failure(linkError);
    id = await repo.createOfficialExam(parsed.data);
  } catch (error) {
    console.error(error);
    return failure("No se ha podido crear el examen.");
  }
  revalidate();
  redirect(`/examenes/${id}`);
}

export async function updateOfficialExamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  const id = uuid.safeParse(formData.get("id"));
  const parsed = readExamForm(formData);
  if (!id.success) return failure("Examen no válido.");
  if (!parsed.success) return failure(firstError(parsed.error));
  try {
    const current = await repo.getOfficialExam(id.data);
    if (!current) return failure("El examen ya no existe.");
    // Sus preguntas son de esa asignatura: no se puede mover a otra.
    const linkError = await checkExamLinks({ ...parsed.data, subjectId: current.subjectId });
    if (linkError) return failure(linkError);
    await repo.updateOfficialExam(id.data, { ...parsed.data, subjectId: current.subjectId });
  } catch (error) {
    console.error(error);
    return failure("No se ha podido guardar.");
  }
  revalidate();
  return success();
}

export async function deleteOfficialExamAction(formData: FormData): Promise<void> {
  await getCurrentUser();
  await repo.deleteOfficialExam(uuid.parse(formData.get("id")));
  revalidate();
  redirect("/examenes");
}

// ---------------------------------------------------------------- importación

export type ImportSummary =
  | {
      ok: true;
      examTitle: string | null;
      valid: number;
      byType: Record<string, number>;
      errors: { index: number; error: string }[];
      warnings: string[];
      imported?: { count: number; examId: string | null };
    }
  | { ok: false; error: string };

async function plan(subjectId: string, jsonText: string) {
  let json: unknown;
  try {
    json = JSON.parse(jsonText);
  } catch (error) {
    return { fatal: `El texto no es JSON válido: ${(error as Error).message}` } as const;
  }
  const [topics, types] = await Promise.all([listTopics(subjectId), repo.listQuestionTypes()]);
  return planImport(json, {
    subjectId,
    topics: topics.map((t) => ({ id: t.id, name: t.name })),
    questionTypes: types.map((t) => t.code),
  });
}

/** Analiza el JSON; con `commit` además guarda las preguntas válidas (y el examen, si lo hay). */
export async function importQuestionsAction(input: {
  subjectId: string;
  json: string;
  commit: boolean;
}): Promise<ImportSummary> {
  await getCurrentUser();
  const subjectId = uuid.safeParse(input.subjectId);
  if (!subjectId.success) return { ok: false, error: "Elige una asignatura." };
  if (input.json.length > 2_000_000) return { ok: false, error: "El archivo es demasiado grande (máx. 2 MB)." };

  const result = await plan(subjectId.data, input.json);
  if ("fatal" in result) return { ok: false, error: result.fatal };

  const byType: Record<string, number> = {};
  for (const q of result.questions) byType[q.questionType] = (byType[q.questionType] ?? 0) + 1;
  const summary = {
    ok: true as const,
    examTitle: result.exam?.title ?? null,
    valid: result.questions.length,
    byType,
    errors: result.errors,
    warnings: result.warnings,
  };
  if (!input.commit || result.questions.length === 0) return summary;

  let examId: string | null = null;
  try {
    if (result.exam) examId = await repo.createOfficialExam({ ...result.exam, subjectId: subjectId.data });
    const questions = result.questions.map((q) =>
      q.officialExamId === PENDING_EXAM_ID ? { ...q, officialExamId: examId } : q,
    );
    const count = await repo.createQuestions(questions);
    revalidate();
    return { ...summary, imported: { count, examId } };
  } catch (error) {
    console.error(error);
    if (examId) await repo.deleteOfficialExam(examId).catch(() => {});
    return { ok: false, error: "No se ha podido importar. No se ha guardado nada." };
  }
}
