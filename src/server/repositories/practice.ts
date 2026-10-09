import "server-only";
import type { Candidate, QuestionStats, SelfGrade, TestMode } from "@/domain/practice/types";
import type { Grade } from "@/domain/questions/grading";
import type { SourceType } from "@/domain/questions/types";
import type { SrsCard, SrsState } from "@/domain/srs/srs";
import { createClient } from "@/lib/supabase/server";
import { check } from "./academic";

/*
 * Tests: intentos, respuestas, progreso por pregunta (repaso espaciado) y
 * dominio por tema.
 */

type ProgressRow = {
  question_id: string;
  times_answered: number;
  times_correct: number;
  times_incorrect: number;
  last_answered_at: string | null;
  last_result: QuestionStats["lastResult"];
  srs_state: SrsState;
  due_at: string | null;
  stability: number | null;
  srs_difficulty: number | null;
  reps: number;
  lapses: number;
};

const PROGRESS_COLUMNS =
  "question_id, times_answered, times_correct, times_incorrect, last_answered_at, last_result, srs_state, due_at, stability, srs_difficulty, reps, lapses";

export const toStats = (p: ProgressRow): QuestionStats => ({
  timesAnswered: p.times_answered,
  timesCorrect: p.times_correct,
  timesIncorrect: p.times_incorrect,
  lastResult: p.last_result,
  lastAnsweredAt: p.last_answered_at,
  card: {
    state: p.srs_state,
    stability: p.stability,
    difficulty: p.srs_difficulty,
    reps: p.reps,
    lapses: p.lapses,
    dueAt: p.due_at,
    lastReviewAt: p.last_answered_at,
  },
});

export type CandidateFilters = {
  subjectId?: string;
  topicIds?: string[];
  questionTypes?: string[];
  difficultyMin?: number;
  difficultyMax?: number;
  sources?: SourceType[];
  questionIds?: string[];
};

/** Preguntas aprobadas y sin archivar que cumplen los filtros, con su historial. */
export async function loadCandidates(filters: CandidateFilters): Promise<Candidate[]> {
  const db = await createClient();
  let query = db
    .from("questions")
    .select(`id, subject_id, topic_id, question_type, difficulty, question_progress(${PROGRESS_COLUMNS})`)
    .eq("archived", false)
    .eq("review_status", "approved");
  if (filters.subjectId) query = query.eq("subject_id", filters.subjectId);
  if (filters.topicIds?.length) query = query.in("topic_id", filters.topicIds);
  if (filters.questionTypes?.length) query = query.in("question_type", filters.questionTypes);
  if (filters.sources?.length) query = query.in("source_type", filters.sources);
  if (filters.questionIds?.length) query = query.in("id", filters.questionIds);
  if (filters.difficultyMin) query = query.gte("difficulty", filters.difficultyMin);
  if (filters.difficultyMax) query = query.lte("difficulty", filters.difficultyMax);
  const rows = check<
    {
      id: string;
      subject_id: string;
      topic_id: string | null;
      question_type: string;
      difficulty: number;
      question_progress: ProgressRow[];
    }[]
  >("Preguntas para el test", await query.limit(5000));
  return rows.map((r) => ({
    id: r.id,
    subjectId: r.subject_id,
    topicId: r.topic_id,
    questionType: r.question_type,
    difficulty: r.difficulty,
    stats: r.question_progress[0] ? toStats(r.question_progress[0]) : null,
  }));
}

/** Dominio (0..1) guardado por tema. */
export async function loadTopicMastery(): Promise<Map<string, number>> {
  const db = await createClient();
  const rows = check<{ topic_id: string; mastery: number }[]>(
    "Dominio por tema",
    await db.from("topic_progress").select("topic_id, mastery"),
  );
  return new Map(rows.map((r) => [r.topic_id, r.mastery]));
}

/** Temas con actividad reciente (respuestas o estudio) desde `since`. */
export async function recentTopicIds(since: Date): Promise<Set<string>> {
  const db = await createClient();
  const [progress, studied] = await Promise.all([
    db
      .from("question_progress")
      .select("questions(topic_id)")
      .gte("last_answered_at", since.toISOString())
      .limit(2000),
    db.from("topic_progress").select("topic_id").gte("last_studied_at", since.toISOString()),
  ]);
  const ids = new Set<string>();
  for (const r of (check("Actividad reciente", progress) ?? []) as unknown as { questions: { topic_id: string | null } | null }[]) {
    if (r.questions?.topic_id) ids.add(r.questions.topic_id);
  }
  for (const r of check<{ topic_id: string }[]>("Temas estudiados", studied)) ids.add(r.topic_id);
  return ids;
}

/** Preguntas con el repaso vencido (para la pantalla de tests). */
export async function countDueQuestions(now: Date): Promise<number> {
  const db = await createClient();
  const { count, error } = await db
    .from("question_progress")
    .select("question_id, questions!inner(archived, review_status)", { count: "exact", head: true })
    .lte("due_at", now.toISOString())
    .eq("questions.archived", false)
    .eq("questions.review_status", "approved");
  if (error) throw new Error(`Repasos pendientes: ${error.message}`);
  return count ?? 0;
}

// ---------------------------------------------------------------- intentos

export type AttemptRow = {
  id: string;
  mode: TestMode | "exam_simulation" | "official_exam";
  subject_id: string | null;
  assessment_id: string | null;
  official_exam_id: string | null;
  config: Record<string, unknown>;
  status: "in_progress" | "finished" | "abandoned";
  started_at: string;
  finished_at: string | null;
  time_limit_seconds: number | null;
  time_used_seconds: number | null;
  score: number | string | null;
  max_score: number | string | null;
  grade: number | string | null;
  summary: Record<string, unknown>;
};

const ATTEMPT_COLUMNS =
  "id, mode, subject_id, assessment_id, official_exam_id, config, status, started_at, finished_at, time_limit_seconds, time_used_seconds, score, max_score, grade, summary";

export type ItemRow = {
  id: string;
  question_id: string;
  position: number;
  points: number | string;
  user_answer: { response?: unknown; selfGrade?: SelfGrade | null; grade?: Grade } | null;
  is_correct: boolean | null;
  score: number | string | null;
  flagged: boolean;
  answered_at: string | null;
  time_spent_seconds: number | null;
  grading_method: "auto" | "self" | "ai" | null;
};

const ITEM_COLUMNS =
  "id, question_id, position, points, user_answer, is_correct, score, flagged, answered_at, time_spent_seconds, grading_method";

export async function createAttempt(input: {
  mode: AttemptRow["mode"];
  subjectId: string | null;
  assessmentId: string | null;
  officialExamId?: string | null;
  timeLimitSeconds?: number | null;
  config: Record<string, unknown>;
  questionIds: string[];
  /** Puntos de cada pregunta (por defecto 1). */
  points?: number[];
}): Promise<string> {
  const db = await createClient();
  const attempt = check<{ id: string }>(
    "Crear test",
    await db
      .from("attempts")
      .insert({
        mode: input.mode,
        subject_id: input.subjectId,
        assessment_id: input.assessmentId,
        official_exam_id: input.officialExamId ?? null,
        time_limit_seconds: input.timeLimitSeconds ?? null,
        config: input.config,
      })
      .select("id")
      .single(),
  );
  const items = input.questionIds.map((question_id, i) => ({
    attempt_id: attempt.id,
    question_id,
    position: i + 1,
    points: input.points?.[i] ?? 1,
  }));
  const inserted = await db.from("attempt_items").insert(items);
  if (inserted.error) {
    await db.from("attempts").delete().eq("id", attempt.id);
    throw new Error(`Crear preguntas del test: ${inserted.error.message}`);
  }
  return attempt.id;
}

export async function getAttempt(id: string): Promise<{ attempt: AttemptRow; items: ItemRow[] } | null> {
  const db = await createClient();
  const rows = check<AttemptRow[]>("Leer test", await db.from("attempts").select(ATTEMPT_COLUMNS).eq("id", id).limit(1));
  if (!rows[0]) return null;
  const items = check<ItemRow[]>(
    "Leer preguntas del test",
    await db.from("attempt_items").select(ITEM_COLUMNS).eq("attempt_id", id).order("position"),
  );
  return { attempt: rows[0], items };
}

export async function getItem(itemId: string) {
  const db = await createClient();
  const rows = check<(ItemRow & { attempt_id: string; attempts: Pick<AttemptRow, "status" | "mode" | "started_at" | "time_limit_seconds" | "config"> })[]>(
    "Leer respuesta",
    // Relación muchos-a-uno: PostgREST devuelve un objeto (sin tipos generados, se indica a mano).
    (await db.from("attempt_items").select(`${ITEM_COLUMNS}, attempt_id, attempts(status, mode, started_at, time_limit_seconds, config)`).eq("id", itemId).limit(1)) as never,
  );
  return rows[0] ?? null;
}

export async function saveItemAnswer(
  itemId: string,
  values: {
    userAnswer: Record<string, unknown>;
    isCorrect: boolean | null;
    score: number;
    gradingMethod: "auto" | "self";
    timeSpentSeconds: number | null;
  },
): Promise<void> {
  const db = await createClient();
  check(
    "Guardar respuesta",
    await db
      .from("attempt_items")
      .update({
        user_answer: values.userAnswer,
        is_correct: values.isCorrect,
        score: values.score,
        grading_method: values.gradingMethod,
        time_spent_seconds: values.timeSpentSeconds,
        answered_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .is("answered_at", null),
  );
}

/** Simulacro: guarda (o borra, con null) la respuesta sin corregirla; se puede cambiar hasta entregar. */
export async function saveExamResponse(
  itemId: string,
  values: { response: unknown | null; timeSpentSeconds: number | null },
): Promise<void> {
  const db = await createClient();
  check(
    "Guardar respuesta",
    await db
      .from("attempt_items")
      .update({
        user_answer: values.response === null ? null : { response: values.response },
        answered_at: values.response === null ? null : new Date().toISOString(),
        time_spent_seconds: values.timeSpentSeconds,
      })
      .eq("id", itemId),
  );
}

/** Corrección de una respuesta ya guardada (al entregar o al autoevaluar). */
export async function gradeItem(
  itemId: string,
  values: { userAnswer: Record<string, unknown>; isCorrect: boolean | null; score: number | null; gradingMethod: "auto" | "self" },
): Promise<void> {
  const db = await createClient();
  check(
    "Corregir respuesta",
    await db
      .from("attempt_items")
      .update({
        user_answer: values.userAnswer,
        is_correct: values.isCorrect,
        score: values.score,
        grading_method: values.gradingMethod,
      })
      .eq("id", itemId),
  );
}

export async function setItemFlag(itemId: string, flagged: boolean): Promise<void> {
  const db = await createClient();
  check("Marcar pregunta", await db.from("attempt_items").update({ flagged }).eq("id", itemId));
}

export async function finishAttempt(
  id: string,
  values: { score: number; maxScore: number; grade: number; timeUsedSeconds: number; summary: Record<string, unknown> },
): Promise<void> {
  const db = await createClient();
  check(
    "Terminar test",
    await db
      .from("attempts")
      .update({
        status: "finished",
        finished_at: new Date().toISOString(),
        score: values.score,
        max_score: values.maxScore,
        grade: values.grade,
        time_used_seconds: values.timeUsedSeconds,
        summary: values.summary,
      })
      .eq("id", id)
      .eq("status", "in_progress"),
  );
}

/** Recalcula la nota de un intento ya terminado (tras autoevaluar). */
export async function updateAttemptScore(
  id: string,
  values: { score: number; maxScore: number; grade: number; summary: Record<string, unknown> },
): Promise<void> {
  const db = await createClient();
  check(
    "Actualizar nota",
    await db
      .from("attempts")
      .update({ score: values.score, max_score: values.maxScore, grade: values.grade, summary: values.summary })
      .eq("id", id),
  );
}

export async function deleteAttempt(id: string): Promise<void> {
  const db = await createClient();
  check("Borrar test", await db.from("attempts").delete().eq("id", id));
}

export async function listAttempts(limit = 30): Promise<AttemptRow[]> {
  const db = await createClient();
  return check<AttemptRow[]>(
    "Historial de tests",
    await db.from("attempts").select(ATTEMPT_COLUMNS).order("started_at", { ascending: false }).limit(limit),
  );
}

// ---------------------------------------------------------------- progreso

export async function getQuestionStats(questionId: string): Promise<QuestionStats | null> {
  const db = await createClient();
  const rows = check<ProgressRow[]>(
    "Leer progreso",
    await db.from("question_progress").select(PROGRESS_COLUMNS).eq("question_id", questionId).limit(1),
  );
  return rows[0] ? toStats(rows[0]) : null;
}

export async function saveQuestionStats(userId: string, questionId: string, stats: QuestionStats): Promise<void> {
  const db = await createClient();
  const card: SrsCard = stats.card;
  check(
    "Guardar progreso",
    await db.from("question_progress").upsert(
      {
        user_id: userId,
        question_id: questionId,
        times_answered: stats.timesAnswered,
        times_correct: stats.timesCorrect,
        times_incorrect: stats.timesIncorrect,
        last_answered_at: stats.lastAnsweredAt,
        last_result: stats.lastResult,
        srs_state: card.state,
        due_at: card.dueAt,
        stability: card.stability,
        srs_difficulty: card.difficulty,
        reps: card.reps,
        lapses: card.lapses,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,question_id" },
    ),
  );
}

export async function saveTopicProgress(
  userId: string,
  topicId: string,
  values: { mastery: number; lastReviewedAt: string; nextReviewAt: string | null },
): Promise<void> {
  const db = await createClient();
  check(
    "Guardar dominio del tema",
    await db.from("topic_progress").upsert(
      {
        user_id: userId,
        topic_id: topicId,
        mastery: values.mastery,
        last_reviewed_at: values.lastReviewedAt,
        next_review_at: values.nextReviewAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,topic_id" },
    ),
  );
}
