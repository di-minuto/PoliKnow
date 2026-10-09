"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { descendantIds, topicShares } from "@/domain/academic/logic";
import { firstError } from "@/domain/academic/schemas";
import { EMPTY_MESSAGES, readTestConfigForm, testConfigInput, type TestConfig } from "@/domain/practice/config";
import { isExamMode, usedSeconds } from "@/domain/practice/exam";
import { seededRandom, selectQuestions, shuffle, type SelectOptions } from "@/domain/practice/selection";
import type { Candidate, SelfGrade } from "@/domain/practice/types";
import type { Grade, Response } from "@/domain/questions/grading";
import { failure, type ActionState } from "@/lib/action-state";
import { gradeAgainst, gradedItem, penaltyOf, recordReview, refreshTopicProgress, scoreData, summaryOf } from "@/server/attempts";
import { getCurrentUser } from "@/server/auth";
import { listAssessmentTopics, listAssessments, listTopics } from "@/server/repositories/academic";
import * as repo from "@/server/repositories/practice";
import { getQuestion, getQuestionsByIds } from "@/server/repositories/questions";

/*
 * Tests: generar, responder (con corrección en el servidor, que es quien
 * conoce la solución), marcar y terminar. Cada respuesta actualiza el repaso
 * espaciado de la pregunta; al terminar se recalcula el dominio de los temas.
 */

const DAY = 86_400_000;
const uuid = z.uuid();

/** Mapa tema → tema de la lista del que cuelga (él mismo o un antepasado). */
function rootMap(all: { id: string; parentId: string | null }[], roots: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const root of roots) for (const id of descendantIds(all as never, root)) if (!map.has(id)) map.set(id, root);
  return map;
}

async function pick(config: TestConfig, seed: number): Promise<{ ids: string[] } | { error: string }> {
  const now = new Date();
  const base = {
    subjectId: config.subjectId ?? undefined,
    questionTypes: config.questionTypes,
    sources: config.sources,
    difficultyMin: config.difficultyMin ?? undefined,
    difficultyMax: config.difficultyMax ?? undefined,
  };
  const topics = config.subjectId ? await listTopics(config.subjectId) : await listTopics();
  let candidates: Candidate[];
  const opts: SelectOptions = { count: config.count, now, seed, strategy: "random" };

  switch (config.mode) {
    case "topic":
    case "custom": {
      const roots = config.topicIds.filter((id) => topics.some((t) => t.id === id));
      const ids = roots.length ? [...rootMap(topics, roots).keys()] : undefined;
      candidates = await repo.loadCandidates({ ...base, topicIds: ids });
      opts.strategy = config.mode === "topic" ? "priority" : "random";
      break;
    }
    case "assessment": {
      const [assessment] = (await listAssessments(config.subjectId!)).filter((a) => a.id === config.assessmentId);
      if (!assessment) return { error: "Ese parcial no es de esta asignatura." };
      const links = await listAssessmentTopics([assessment.id]);
      if (links.length === 0) return { error: "Ese parcial aún no tiene temas. Añádelos en la asignatura." };
      const roots = rootMap(topics, links.map((l) => l.topicId));
      const raw = await repo.loadCandidates({ ...base, topicIds: [...roots.keys()] });
      // Para repartir, cada pregunta cuenta para el tema del parcial del que cuelga.
      candidates = raw.map((c) => ({ ...c, topicId: c.topicId ? (roots.get(c.topicId) ?? null) : null }));
      opts.topicWeights = topicShares(links);
      opts.strategy = "priority";
      const chosen = selectQuestions(candidates, opts);
      return chosen.length ? { ids: chosen.map((c) => c.id) } : { error: EMPTY_MESSAGES.assessment };
    }
    case "quick": {
      // Temas que estás estudiando: actividad en las dos últimas semanas y los del próximo examen.
      const recent = await repo.recentTopicIds(new Date(now.getTime() - 14 * DAY));
      const upcoming = (await listAssessments(config.subjectId ?? undefined))
        .filter((a) => a.status === "upcoming" && a.examAt && new Date(a.examAt) > now)
        .sort((a, b) => a.examAt!.localeCompare(b.examAt!));
      const subjectsDone = new Set<string>();
      const next = upcoming.filter((a) => !subjectsDone.has(a.subjectId) && subjectsDone.add(a.subjectId));
      for (const l of await listAssessmentTopics(next.map((a) => a.id))) recent.add(l.topicId);
      const focus = [...rootMap(topics, [...recent].filter((id) => topics.some((t) => t.id === id))).keys()];
      candidates = focus.length ? await repo.loadCandidates({ ...base, topicIds: focus }) : [];
      if (candidates.length < config.count) candidates = await repo.loadCandidates(base);
      opts.strategy = "priority";
      break;
    }
    case "failed_review":
      candidates = await repo.loadCandidates(base);
      opts.strategy = "failed";
      break;
    case "smart_review": {
      candidates = await repo.loadCandidates(base);
      const mastery = await repo.loadTopicMastery();
      opts.topicWeakness = new Map(topics.map((t) => [t.id, 0.6 * (1 - (mastery.get(t.id) ?? 0))]));
      opts.strategy = "priority";
      break;
    }
  }

  const chosen = selectQuestions(candidates, opts);
  return chosen.length ? { ids: chosen.map((c) => c.id) } : { error: EMPTY_MESSAGES[config.mode] };
}

export async function createTestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  const parsed = testConfigInput.safeParse(readTestConfigForm(formData));
  if (!parsed.success) return failure(firstError(parsed.error));
  let id: string;
  try {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const result = await pick(parsed.data, seed);
    if ("error" in result) return failure(result.error);
    id = await repo.createAttempt({
      mode: parsed.data.mode,
      subjectId: parsed.data.subjectId,
      assessmentId: parsed.data.assessmentId,
      config: { ...parsed.data, seed },
      // El orden de prioridad decide qué entra; el orden en pantalla se baraja.
      questionIds: shuffle(result.ids, seededRandom(seed + 1)),
    });
  } catch (error) {
    console.error(error);
    return failure("No se ha podido crear el test. Inténtalo de nuevo.");
  }
  revalidatePath("/tests");
  redirect(`/tests/${id}`);
}

// ---------------------------------------------------------------- responder

const responseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), selected: z.array(z.number().int().min(0).max(20)).max(20) }),
  z.object({ kind: z.literal("true_false"), value: z.boolean() }),
  z.object({ kind: z.literal("text"), value: z.string().max(20000) }),
]);

const answerInput = z.object({
  itemId: z.uuid(),
  response: responseSchema,
  selfGrade: z.enum(["wrong", "partial", "right"]).nullable().default(null),
  timeSpentSeconds: z.number().int().min(0).max(86400).nullable().default(null),
});

export type AnswerFeedback = {
  grade: Grade;
  selfGrade: SelfGrade | null;
  /** La solución (para mostrarla tras responder). */
  answer: unknown;
  explanation: string | null;
  /** true si falta la autoevaluación: aún no se ha guardado nada. */
  needsSelfGrade: boolean;
};

export async function answerItemAction(raw: unknown): Promise<{ ok: true; feedback: AnswerFeedback } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  const input = answerInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Respuesta no válida." };
  try {
    const item = await repo.getItem(input.data.itemId);
    if (!item) return { ok: false, error: "Esta pregunta ya no está en el test." };
    if (item.attempts.status !== "in_progress") return { ok: false, error: "El test ya está terminado." };
    if (item.answered_at) return { ok: false, error: "Ya la habías respondido." };
    const question = await getQuestion(item.question_id);
    if (!question) return { ok: false, error: "La pregunta se ha borrado." };

    if (isExamMode(item.attempts.mode)) return { ok: false, error: "En un simulacro no se corrige hasta entregar." };
    const grade = gradeAgainst(question, input.data.response as Response);
    if (!grade) return { ok: false, error: "La pregunta tiene datos incompletos; edítala." };
    const selfGrade = input.data.selfGrade;
    const feedback = { grade, selfGrade, answer: question.answer, explanation: question.explanation };
    if (grade === "self_assessed" && !selfGrade) return { ok: true, feedback: { ...feedback, needsSelfGrade: true } };

    const graded = gradedItem({ ...item, user_answer: { response: input.data.response } }, grade, selfGrade, 0);
    await repo.saveItemAnswer(item.id, {
      userAnswer: graded.userAnswer,
      isCorrect: graded.isCorrect,
      score: graded.score ?? 0,
      gradingMethod: graded.gradingMethod,
      timeSpentSeconds: input.data.timeSpentSeconds,
    });
    await recordReview(user.id, question, grade, selfGrade, new Date());
    return { ok: true, feedback: { ...feedback, needsSelfGrade: false } };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "No se ha podido guardar la respuesta. Inténtalo de nuevo." };
  }
}

export async function flagItemAction(itemId: string, flagged: boolean): Promise<void> {
  await getCurrentUser();
  await repo.setItemFlag(uuid.parse(itemId), flagged);
}

// ---------------------------------------------------------------- terminar

export async function finishAttemptAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const attemptId = uuid.parse(formData.get("id"));
  const data = await repo.getAttempt(attemptId);
  if (!data) redirect("/tests");
  if (data.attempt.status === "in_progress") {
    const now = new Date();
    // Simulacro: se corrige todo al entregar. Las de desarrollo quedan para autoevaluar.
    if (isExamMode(data.attempt.mode)) {
      const answered = data.items.filter((i) => i.answered_at && i.user_answer?.response != null);
      const questions = new Map((await getQuestionsByIds(answered.map((i) => i.question_id))).map((q) => [q.id, q]));
      const penalty = penaltyOf(data.attempt);
      for (const item of answered) {
        const question = questions.get(item.question_id);
        const grade = question ? gradeAgainst(question, item.user_answer!.response as Response) : null;
        if (!question || !grade) continue;
        const graded = gradedItem(item, grade, null, penalty);
        await repo.gradeItem(item.id, graded);
        item.user_answer = graded.userAnswer as repo.ItemRow["user_answer"];
        if (grade !== "self_assessed") await recordReview(user.id, question, grade, null, now);
      }
    }
    const { score, topicIds } = await scoreData(data);
    await repo.finishAttempt(attemptId, {
      score: score.score,
      maxScore: score.maxScore,
      grade: score.grade,
      timeUsedSeconds: usedSeconds(data.attempt.started_at, data.attempt.time_limit_seconds, now),
      summary: summaryOf(score),
    });
    await refreshTopicProgress(user.id, topicIds, now);
  }
  revalidatePath("/tests", "layout");
  redirect(`/tests/${attemptId}`);
}

export async function deleteAttemptAction(formData: FormData): Promise<void> {
  await getCurrentUser();
  await repo.deleteAttempt(uuid.parse(formData.get("id")));
  revalidatePath("/tests", "layout");
  redirect("/tests");
}
