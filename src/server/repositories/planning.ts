import "server-only";
import type { TaskType, TopicState } from "@/domain/scheduler/plan";
import { createClient } from "@/lib/supabase/server";
import { check } from "./academic";

/* Planificación: disponibilidad, días sin estudio, tareas del plan, progreso por tema y sesiones. */

export type BlockedDay = { id: string; day: string; reason: string | null };

/** Minutos disponibles por día de la semana, índice 0 = domingo. */
export async function getWeeklyAvailability(): Promise<number[]> {
  const db = await createClient();
  const { data, error } = await db.from("availability_rules").select("weekday, minutes");
  if (error) throw new Error(`Cargar disponibilidad: ${error.message}`);
  const minutes = Array<number>(7).fill(0);
  for (const r of data as { weekday: number; minutes: number }[]) minutes[r.weekday] = r.minutes;
  return minutes;
}

export async function saveWeeklyAvailability(userId: string, minutesByWeekday: number[]): Promise<void> {
  const db = await createClient();
  const { error } = await db.from("availability_rules").upsert(
    minutesByWeekday.map((minutes, weekday) => ({ user_id: userId, weekday, minutes })),
    { onConflict: "user_id,weekday" },
  );
  if (error) throw new Error(`Guardar disponibilidad: ${error.message}`);
}

export async function listBlockedDays(fromDay?: string): Promise<BlockedDay[]> {
  const db = await createClient();
  let query = db.from("blocked_days").select("id, day, reason");
  if (fromDay) query = query.gte("day", fromDay);
  const { data, error } = await query.order("day");
  if (error) throw new Error(`Cargar días sin estudio: ${error.message}`);
  return data as BlockedDay[];
}

export async function addBlockedDay(userId: string, day: string, reason: string | null): Promise<void> {
  const db = await createClient();
  const { error } = await db
    .from("blocked_days")
    .upsert({ user_id: userId, day, reason }, { onConflict: "user_id,day" });
  if (error) throw new Error(`Añadir día sin estudio: ${error.message}`);
}

export async function removeBlockedDay(id: string): Promise<void> {
  const db = await createClient();
  const { error } = await db.from("blocked_days").delete().eq("id", id);
  if (error) throw new Error(`Quitar día sin estudio: ${error.message}`);
}

// ---------------------------------------------------------------- plan y sesiones

export type TaskStatus = "pending" | "in_progress" | "done" | "partial" | "skipped" | "rescheduled";

export type PlanTask = {
  id: string;
  day: string;
  subjectId: string;
  assessmentId: string | null;
  topicId: string | null;
  type: TaskType;
  minutes: number;
  questionCount: number | null;
  priority: number;
  status: TaskStatus;
  origin: "auto" | "manual";
  position: number;
};

type TaskRow = {
  id: string;
  day: string;
  subject_id: string;
  assessment_id: string | null;
  topic_id: string | null;
  task_type: TaskType;
  planned_minutes: number;
  question_count: number | null;
  priority: number;
  status: TaskStatus;
  origin: "auto" | "manual";
  position: number;
};
const TASK_COLUMNS =
  "id, day, subject_id, assessment_id, topic_id, task_type, planned_minutes, question_count, priority, status, origin, position";
const toTask = (r: TaskRow): PlanTask => ({
  id: r.id,
  day: r.day,
  subjectId: r.subject_id,
  assessmentId: r.assessment_id,
  topicId: r.topic_id,
  type: r.task_type,
  minutes: r.planned_minutes,
  questionCount: r.question_count,
  priority: Number(r.priority),
  status: r.status,
  origin: r.origin,
  position: r.position,
});

export async function listTasks(fromDay: string, toDay?: string): Promise<PlanTask[]> {
  const db = await createClient();
  let query = db.from("plan_tasks").select(TASK_COLUMNS).gte("day", fromDay);
  if (toDay) query = query.lte("day", toDay);
  const rows = check<TaskRow[]>("Leer plan", await query.order("day").order("position"));
  return rows.map(toTask);
}

export async function getTask(id: string): Promise<PlanTask | null> {
  const db = await createClient();
  const rows = check<TaskRow[]>("Leer tarea", await db.from("plan_tasks").select(TASK_COLUMNS).eq("id", id).limit(1));
  return rows[0] ? toTask(rows[0]) : null;
}

/** Tareas automáticas pendientes de días pasados: su trabajo vuelve al reparto. */
export async function markMissedTasks(today: string): Promise<void> {
  const db = await createClient();
  check(
    "Reprogramar tareas no hechas",
    await db
      .from("plan_tasks")
      .update({ status: "rescheduled", updated_at: new Date().toISOString() })
      .lt("day", today)
      .eq("status", "pending")
      .eq("origin", "auto"),
  );
}

/** Sustituye las tareas automáticas pendientes desde hoy por las nuevas. */
export async function replaceAutoTasks(
  userId: string,
  today: string,
  tasks: {
    day: string;
    subjectId: string;
    assessmentId: string | null;
    topicId: string | null;
    type: TaskType;
    minutes: number;
    questionCount: number | null;
    priority: number;
    position: number;
  }[],
): Promise<void> {
  const db = await createClient();
  check(
    "Borrar plan anterior",
    await db.from("plan_tasks").delete().gte("day", today).eq("status", "pending").eq("origin", "auto"),
  );
  if (tasks.length === 0) return;
  check(
    "Guardar plan",
    await db.from("plan_tasks").insert(
      tasks.map((t) => ({
        user_id: userId,
        day: t.day,
        subject_id: t.subjectId,
        assessment_id: t.assessmentId,
        topic_id: t.topicId,
        task_type: t.type,
        planned_minutes: t.minutes,
        question_count: t.questionCount,
        priority: t.priority,
        position: t.position,
      })),
    ),
  );
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const db = await createClient();
  check(
    "Actualizar tarea",
    await db.from("plan_tasks").update({ status, updated_at: new Date().toISOString() }).eq("id", id),
  );
}

// ---------------------------------------------------------------- progreso por tema

type TopicProgressRow = {
  topic_id: string;
  mastery: number;
  coverage: number;
  last_studied_at: string | null;
  next_review_at: string | null;
  not_understood_count: number;
  priority_adjustment: number;
};

export type TopicProgressRecord = Omit<TopicState, "lastStudiedDay" | "nextReviewDay"> & {
  topicId: string;
  lastStudiedAt: string | null;
  nextReviewAt: string | null;
};

export async function listTopicProgress(): Promise<TopicProgressRecord[]> {
  const db = await createClient();
  const rows = check<TopicProgressRow[]>(
    "Progreso por tema",
    await db
      .from("topic_progress")
      .select("topic_id, mastery, coverage, last_studied_at, next_review_at, not_understood_count, priority_adjustment"),
  );
  return rows.map((r) => ({
    topicId: r.topic_id,
    mastery: Number(r.mastery),
    coverage: Number(r.coverage),
    lastStudiedAt: r.last_studied_at,
    nextReviewAt: r.next_review_at,
    notUnderstoodCount: r.not_understood_count,
    priorityAdjustment: Number(r.priority_adjustment),
  }));
}

export async function saveStudyProgress(
  userId: string,
  topicId: string,
  values: {
    coverage: number;
    lastStudiedAt: string | null;
    nextReviewAt: string | null;
    notUnderstoodCount: number;
    priorityAdjustment: number;
  },
): Promise<void> {
  const db = await createClient();
  check(
    "Guardar progreso del tema",
    await db.from("topic_progress").upsert(
      {
        user_id: userId,
        topic_id: topicId,
        coverage: values.coverage,
        last_studied_at: values.lastStudiedAt,
        next_review_at: values.nextReviewAt,
        not_understood_count: values.notUnderstoodCount,
        priority_adjustment: values.priorityAdjustment,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,topic_id" },
    ),
  );
}

/** Temas con preguntas disponibles (aprobadas y sin archivar): un id por pregunta. */
export async function listQuestionTopics(): Promise<{ topicId: string | null; subjectId: string }[]> {
  const db = await createClient();
  const rows = check<{ topic_id: string | null; subject_id: string }[]>(
    "Preguntas por tema",
    await db.from("questions").select("topic_id, subject_id").eq("archived", false).eq("review_status", "approved"),
  );
  return rows.map((r) => ({ topicId: r.topic_id, subjectId: r.subject_id }));
}

// ---------------------------------------------------------------- sesiones

export async function recordSession(values: {
  planTaskId: string | null;
  subjectId: string;
  topicId: string | null;
  durationSeconds: number;
  completed: boolean;
  perceivedDifficulty: number;
  notUnderstood: boolean;
  notes: string | null;
}): Promise<void> {
  const db = await createClient();
  const ended = new Date();
  check(
    "Guardar sesión",
    await db.from("study_sessions").insert({
      plan_task_id: values.planTaskId,
      subject_id: values.subjectId,
      topic_id: values.topicId,
      started_at: new Date(ended.getTime() - values.durationSeconds * 1000).toISOString(),
      ended_at: ended.toISOString(),
      duration_seconds: values.durationSeconds,
      completed: values.completed,
      perceived_difficulty: values.perceivedDifficulty,
      not_understood: values.notUnderstood,
      notes: values.notes,
    }),
  );
}

/** Minutos estudiados por día (sesiones cerradas) desde una fecha. */
export async function listSessionsSince(sinceIso: string) {
  const db = await createClient();
  return check<{ started_at: string; duration_seconds: number | null; subject_id: string | null }[]>(
    "Sesiones",
    await db.from("study_sessions").select("started_at, duration_seconds, subject_id").gte("started_at", sinceIso).not("ended_at", "is", null),
  );
}
