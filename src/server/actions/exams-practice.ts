"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { descendantIds } from "@/domain/academic/logic";
import { firstError } from "@/domain/academic/schemas";
import { examConfigInput, isExamMode, isExpired, readExamConfigForm } from "@/domain/practice/exam";
import { seededRandom, selectQuestions, shuffle } from "@/domain/practice/selection";
import { failure, type ActionState } from "@/lib/action-state";
import { gradedItem, penaltyOf, recordReview, refreshTopicProgress, scoreData, summaryOf } from "@/server/attempts";
import { getCurrentUser } from "@/server/auth";
import { listTopics } from "@/server/repositories/academic";
import * as repo from "@/server/repositories/practice";
import { getOfficialExam, getQuestion, listExamQuestions } from "@/server/repositories/questions";

/*
 * Simulacros de examen y exámenes oficiales hechos como examen: las respuestas
 * se guardan sin corregir (se pueden cambiar) hasta entregar o acabar el tiempo.
 */

const uuid = z.uuid();

export async function createSimulationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  const parsed = examConfigInput.safeParse(readExamConfigForm(formData));
  if (!parsed.success) return failure(firstError(parsed.error));
  const config = parsed.data;
  let id: string;
  try {
    const topics = await listTopics(config.subjectId);
    const weighted = config.topics.filter((t) => t.weight > 0 && topics.some((x) => x.id === t.topicId));
    // Cada pregunta cuenta para el tema elegido del que cuelga (él mismo o un antepasado).
    const rootOf = new Map<string, string>();
    for (const { topicId } of weighted) {
      for (const id of descendantIds(topics, topicId)) if (!rootOf.has(id)) rootOf.set(id, topicId);
    }
    const raw = await repo.loadCandidates({
      subjectId: config.subjectId,
      topicIds: weighted.length ? [...rootOf.keys()] : undefined,
      questionTypes: config.questionTypes,
      sources: config.sources,
      difficultyMin: config.difficultyMin ?? undefined,
      difficultyMax: config.difficultyMax ?? undefined,
    });
    const candidates = raw.map((c) => ({ ...c, topicId: c.topicId ? (rootOf.get(c.topicId) ?? c.topicId) : null }));
    const total = weighted.reduce((sum, t) => sum + t.weight, 0);
    const seed = Math.floor(Math.random() * 2 ** 31);
    const chosen = selectQuestions(candidates, {
      count: config.count,
      now: new Date(),
      seed,
      strategy: "random",
      topicWeights: weighted.length ? new Map(weighted.map((t) => [t.topicId, t.weight / total])) : undefined,
    });
    if (chosen.length === 0) return failure("No hay preguntas con esos filtros. Prueba con más temas o menos restricciones.");
    id = await repo.createAttempt({
      mode: "exam_simulation",
      subjectId: config.subjectId,
      assessmentId: config.assessmentId,
      timeLimitSeconds: config.durationMinutes * 60,
      config: { ...config, seed, requested: config.count },
      questionIds: shuffle(
        chosen.map((c) => c.id),
        seededRandom(seed + 1),
      ),
    });
  } catch (error) {
    console.error(error);
    return failure("No se ha podido crear el simulacro. Inténtalo de nuevo.");
  }
  revalidatePath("/tests");
  redirect(`/tests/${id}`);
}

const officialInput = z.object({
  examId: z.uuid(),
  durationMinutes: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(600).nullable()),
  penalty: z.coerce.number().min(0).max(1),
  allowBack: z.boolean(),
});

/** Hacer un examen oficial tal cual: sus preguntas, en su orden y con sus puntos. */
export async function startOfficialExamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  const parsed = officialInput.safeParse({
    examId: formData.get("examId"),
    durationMinutes: formData.get("durationMinutes"),
    penalty: String(formData.get("penalty") ?? "0").replace(",", "."),
    allowBack: formData.get("allowBack") === "on",
  });
  if (!parsed.success) return failure(firstError(parsed.error));
  let id: string;
  try {
    const exam = await getOfficialExam(parsed.data.examId);
    if (!exam) return failure("Ese examen ya no existe.");
    const questions = (await listExamQuestions(exam.id)).filter((q) => !q.archived);
    if (questions.length === 0) return failure("Este examen aún no tiene preguntas.");
    const duration = parsed.data.durationMinutes ?? exam.durationMinutes;
    id = await repo.createAttempt({
      mode: "official_exam",
      subjectId: exam.subjectId,
      assessmentId: exam.assessmentId,
      officialExamId: exam.id,
      timeLimitSeconds: duration ? duration * 60 : null,
      config: { penalty: parsed.data.penalty, allowBack: parsed.data.allowBack, durationMinutes: duration },
      questionIds: questions.map((q) => q.id),
      points: questions.map((q) => q.points ?? 1),
    });
  } catch (error) {
    console.error(error);
    return failure("No se ha podido empezar el examen. Inténtalo de nuevo.");
  }
  revalidatePath("/tests");
  redirect(`/tests/${id}`);
}

const examAnswerInput = z.object({
  itemId: z.uuid(),
  response: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("choice"), selected: z.array(z.number().int().min(0).max(20)).max(20) }),
      z.object({ kind: z.literal("true_false"), value: z.boolean() }),
      z.object({ kind: z.literal("text"), value: z.string().max(20000) }),
    ])
    .nullable(),
  timeSpentSeconds: z.number().int().min(0).max(86400).nullable().default(null),
});

/** Guarda la respuesta de un simulacro (sin corregir). null la borra. */
export async function saveExamAnswerAction(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await getCurrentUser();
  const input = examAnswerInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Respuesta no válida." };
  try {
    const item = await repo.getItem(input.data.itemId);
    if (!item) return { ok: false, error: "Esta pregunta ya no está en el examen." };
    const a = item.attempts;
    if (!isExamMode(a.mode)) return { ok: false, error: "Esto no es un simulacro." };
    if (a.status !== "in_progress") return { ok: false, error: "El examen ya está entregado." };
    if (isExpired(a.started_at, a.time_limit_seconds, new Date())) return { ok: false, error: "Se ha acabado el tiempo." };
    const { response } = input.data;
    const empty =
      response === null ||
      (response.kind === "choice" && response.selected.length === 0) ||
      (response.kind === "text" && response.value.trim() === "");
    await repo.saveExamResponse(item.id, { response: empty ? null : response, timeSpentSeconds: input.data.timeSpentSeconds });
    return { ok: true };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "No se ha podido guardar. Revisa la conexión." };
  }
}

/** Autoevaluar una pregunta de desarrollo de un simulacro ya entregado: recalcula la nota. */
export async function selfGradeExamItemAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const itemId = uuid.parse(formData.get("itemId"));
  const selfGrade = z.enum(["wrong", "partial", "right"]).parse(formData.get("selfGrade"));
  const item = await repo.getItem(itemId);
  if (!item) redirect("/tests");
  const attemptId = item.attempt_id;
  const grade = item.user_answer?.grade;
  if (item.attempts.status === "finished" && grade === "self_assessed" && !item.user_answer?.selfGrade) {
    const data = await repo.getAttempt(attemptId);
    const question = await getQuestion(item.question_id);
    if (data && question) {
      const graded = gradedItem(item, grade, selfGrade, penaltyOf(data.attempt));
      await repo.gradeItem(item.id, graded);
      const now = new Date();
      await recordReview(user.id, question, grade, selfGrade, now);
      const target = data.items.find((i) => i.id === item.id);
      if (target) target.user_answer = graded.userAnswer as repo.ItemRow["user_answer"];
      const { score, topicIds } = await scoreData(data);
      await repo.updateAttemptScore(attemptId, {
        score: score.score,
        maxScore: score.maxScore,
        grade: score.grade,
        summary: summaryOf(score),
      });
      await refreshTopicProgress(user.id, topicIds, now);
    }
  }
  revalidatePath("/tests", "layout");
  redirect(`/tests/${attemptId}#item-${itemId}`);
}
