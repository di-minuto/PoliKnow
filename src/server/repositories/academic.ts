import "server-only";
import type {
  Assessment,
  AssessmentStatus,
  AssessmentTopic,
  CatalogEntry,
  Course,
  Level,
  Subject,
  Topic,
  TopicKind,
} from "@/domain/academic/types";
import type { CourseInput, SubjectInput, TopicInput } from "@/domain/academic/schemas";
import { createClient } from "@/lib/supabase/server";

/*
 * Acceso a datos de la jerarquía académica. Única capa que conoce los nombres
 * de columnas (snake_case). RLS garantiza que solo se ven filas propias.
 */

type CourseRow = {
  id: string;
  name: string;
  academic_year: string | null;
  start_date: string | null;
  end_date: string | null;
  archived: boolean;
};
type SubjectRow = {
  id: string;
  course_id: string;
  name: string;
  code: string | null;
  color: string;
  perceived_difficulty: number;
  importance: number;
  position: number;
  archived: boolean;
};
type TopicRow = {
  id: string;
  subject_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  kind: TopicKind;
  estimated_hours: number | string | null;
  position: number;
};
type AssessmentRow = {
  id: string;
  subject_id: string;
  assessment_type: string;
  name: string;
  exam_at: string | null;
  duration_minutes: number | null;
  importance: number;
  perceived_difficulty: number | null;
  grade_weight: number | string | null;
  status: AssessmentStatus;
  position: number;
};

const COURSE_COLUMNS = "id, name, academic_year, start_date, end_date, archived";
const SUBJECT_COLUMNS = "id, course_id, name, code, color, perceived_difficulty, importance, position, archived";
const TOPIC_COLUMNS = "id, subject_id, parent_id, name, description, kind, estimated_hours, position";
const ASSESSMENT_COLUMNS =
  "id, subject_id, assessment_type, name, exam_at, duration_minutes, importance, perceived_difficulty, grade_weight, status, position";

const num = (v: number | string | null) => (v === null ? null : Number(v));

export const toCourse = (r: CourseRow): Course => ({
  id: r.id,
  name: r.name,
  academicYear: r.academic_year,
  startDate: r.start_date,
  endDate: r.end_date,
  archived: r.archived,
});

export const toSubject = (r: SubjectRow): Subject => ({
  id: r.id,
  courseId: r.course_id,
  name: r.name,
  code: r.code,
  color: r.color,
  perceivedDifficulty: r.perceived_difficulty as Level,
  importance: r.importance as Level,
  position: r.position,
  archived: r.archived,
});

export const toTopic = (r: TopicRow): Topic => ({
  id: r.id,
  subjectId: r.subject_id,
  parentId: r.parent_id,
  name: r.name,
  description: r.description,
  kind: r.kind,
  estimatedHours: num(r.estimated_hours),
  position: r.position,
});

export const toAssessment = (r: AssessmentRow): Assessment => ({
  id: r.id,
  subjectId: r.subject_id,
  assessmentType: r.assessment_type,
  name: r.name,
  examAt: r.exam_at,
  durationMinutes: r.duration_minutes,
  importance: r.importance as Level,
  perceivedDifficulty: r.perceived_difficulty as Level | null,
  gradeWeight: num(r.grade_weight),
  status: r.status,
  position: r.position,
});

export class RepositoryError extends Error {
  constructor(action: string, cause: { message: string }) {
    super(`${action}: ${cause.message}`);
    this.name = "RepositoryError";
  }
}

export function check<T>(action: string, result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new RepositoryError(action, result.error);
  return result.data as T;
}

// ---------------------------------------------------------------- lectura

export async function listCourses(): Promise<Course[]> {
  const db = await createClient();
  const rows = check<CourseRow[]>(
    "Listar cursos",
    await db.from("courses").select(COURSE_COLUMNS).order("archived").order("created_at"),
  );
  return rows.map(toCourse);
}

export async function listSubjects(): Promise<Subject[]> {
  const db = await createClient();
  const rows = check<SubjectRow[]>(
    "Listar asignaturas",
    await db.from("subjects").select(SUBJECT_COLUMNS).order("position").order("name"),
  );
  return rows.map(toSubject);
}

export async function getSubject(id: string): Promise<Subject | null> {
  const db = await createClient();
  const row = check<SubjectRow | null>(
    "Cargar asignatura",
    await db.from("subjects").select(SUBJECT_COLUMNS).eq("id", id).maybeSingle(),
  );
  return row ? toSubject(row) : null;
}

/** Temas de una asignatura, o de todas si no se indica. */
export async function listTopics(subjectId?: string): Promise<Topic[]> {
  const db = await createClient();
  let query = db.from("topics").select(TOPIC_COLUMNS);
  if (subjectId) query = query.eq("subject_id", subjectId);
  const rows = check<TopicRow[]>("Listar temas", await query.order("position"));
  return rows.map(toTopic);
}

export async function getTopic(id: string): Promise<Topic | null> {
  const db = await createClient();
  const row = check<TopicRow | null>(
    "Cargar tema",
    await db.from("topics").select(TOPIC_COLUMNS).eq("id", id).maybeSingle(),
  );
  return row ? toTopic(row) : null;
}

/** Evaluaciones de una asignatura, o de todas si no se indica. */
export async function listAssessments(subjectId?: string): Promise<Assessment[]> {
  const db = await createClient();
  let query = db.from("assessments").select(ASSESSMENT_COLUMNS);
  if (subjectId) query = query.eq("subject_id", subjectId);
  const rows = check<AssessmentRow[]>(
    "Listar evaluaciones",
    await query.order("exam_at", { ascending: true, nullsFirst: false }).order("position"),
  );
  return rows.map(toAssessment);
}

export async function getAssessment(id: string): Promise<Assessment | null> {
  const db = await createClient();
  const row = check<AssessmentRow | null>(
    "Cargar evaluación",
    await db.from("assessments").select(ASSESSMENT_COLUMNS).eq("id", id).maybeSingle(),
  );
  return row ? toAssessment(row) : null;
}

export async function listAssessmentTopics(assessmentIds: string[]): Promise<AssessmentTopic[]> {
  if (assessmentIds.length === 0) return [];
  const db = await createClient();
  const rows = check<{ assessment_id: string; topic_id: string; weight: number | string }[]>(
    "Listar temas de evaluaciones",
    await db.from("assessment_topics").select("assessment_id, topic_id, weight").in("assessment_id", assessmentIds),
  );
  return rows.map((r) => ({ assessmentId: r.assessment_id, topicId: r.topic_id, weight: Number(r.weight) }));
}

export async function listAssessmentTypes(): Promise<CatalogEntry[]> {
  const db = await createClient();
  const rows = check<{ code: string; label: string; user_id: string | null; position: number }[]>(
    "Listar tipos de evaluación",
    await db.from("assessment_types").select("code, label, user_id, position").order("position"),
  );
  return rows.map((r) => ({ code: r.code, label: r.label, userId: r.user_id, position: r.position }));
}

// ---------------------------------------------------------------- escritura

export async function createCourse(input: CourseInput): Promise<string> {
  const db = await createClient();
  const row = check<{ id: string }>(
    "Crear curso",
    await db.from("courses").insert({ name: input.name, academic_year: input.academicYear }).select("id").single(),
  );
  return row.id;
}

export async function updateCourse(id: string, input: CourseInput): Promise<void> {
  const db = await createClient();
  check("Actualizar curso", await db.from("courses").update({ name: input.name, academic_year: input.academicYear }).eq("id", id));
}

export async function deleteCourse(id: string): Promise<void> {
  const db = await createClient();
  check("Borrar curso", await db.from("courses").delete().eq("id", id));
}

const subjectColumns = (input: SubjectInput) => ({
  course_id: input.courseId,
  name: input.name,
  code: input.code,
  color: input.color,
  perceived_difficulty: input.perceivedDifficulty,
  importance: input.importance,
});

export async function createSubject(input: SubjectInput, position: number): Promise<string> {
  const db = await createClient();
  const row = check<{ id: string }>(
    "Crear asignatura",
    await db
      .from("subjects")
      .insert({ ...subjectColumns(input), position })
      .select("id")
      .single(),
  );
  return row.id;
}

export async function updateSubject(id: string, input: SubjectInput): Promise<void> {
  const db = await createClient();
  check("Actualizar asignatura", await db.from("subjects").update(subjectColumns(input)).eq("id", id));
}

export async function deleteSubject(id: string): Promise<void> {
  const db = await createClient();
  check("Borrar asignatura", await db.from("subjects").delete().eq("id", id));
}

const topicColumns = (input: TopicInput) => ({
  subject_id: input.subjectId,
  parent_id: input.parentId,
  name: input.name,
  description: input.description,
  kind: input.kind,
  estimated_hours: input.estimatedHours,
});

export async function createTopic(input: TopicInput, position: number): Promise<string> {
  const db = await createClient();
  const row = check<{ id: string }>(
    "Crear tema",
    await db
      .from("topics")
      .insert({ ...topicColumns(input), position })
      .select("id")
      .single(),
  );
  return row.id;
}

export async function updateTopic(id: string, input: TopicInput, position?: number): Promise<void> {
  const db = await createClient();
  const values = position === undefined ? topicColumns(input) : { ...topicColumns(input), position };
  check("Actualizar tema", await db.from("topics").update(values).eq("id", id));
}

export async function deleteTopic(id: string): Promise<void> {
  const db = await createClient();
  check("Borrar tema", await db.from("topics").delete().eq("id", id));
}

/** Guarda nuevas posiciones (tabla indicada: topics, subjects o assessments). */
export async function setPositions(
  table: "topics" | "subjects" | "assessments",
  positions: { id: string; position: number }[],
): Promise<void> {
  if (positions.length === 0) return;
  const db = await createClient();
  const results = await Promise.all(
    positions.map((p) => db.from(table).update({ position: p.position }).eq("id", p.id)),
  );
  for (const r of results) check("Reordenar", r);
}

export type AssessmentValues = {
  subjectId: string;
  assessmentType: string;
  name: string;
  examAt: string | null;
  durationMinutes: number | null;
  importance: number;
  perceivedDifficulty: number | null;
  gradeWeight: number | null;
  status: AssessmentStatus;
};

const assessmentColumns = (v: AssessmentValues) => ({
  subject_id: v.subjectId,
  assessment_type: v.assessmentType,
  name: v.name,
  exam_at: v.examAt,
  duration_minutes: v.durationMinutes,
  importance: v.importance,
  perceived_difficulty: v.perceivedDifficulty,
  grade_weight: v.gradeWeight,
  status: v.status,
});

export async function createAssessment(values: AssessmentValues, position: number): Promise<string> {
  const db = await createClient();
  const row = check<{ id: string }>(
    "Crear evaluación",
    await db
      .from("assessments")
      .insert({ ...assessmentColumns(values), position })
      .select("id")
      .single(),
  );
  return row.id;
}

export async function updateAssessment(id: string, values: AssessmentValues): Promise<void> {
  const db = await createClient();
  check("Actualizar evaluación", await db.from("assessments").update(assessmentColumns(values)).eq("id", id));
}

export async function deleteAssessment(id: string): Promise<void> {
  const db = await createClient();
  check("Borrar evaluación", await db.from("assessments").delete().eq("id", id));
}

/** Sustituye el conjunto de temas (y pesos) de una evaluación. */
export async function replaceAssessmentTopics(
  assessmentId: string,
  topics: { topicId: string; weight: number }[],
): Promise<void> {
  const db = await createClient();
  const keep = topics.map((t) => t.topicId);
  let removal = db.from("assessment_topics").delete().eq("assessment_id", assessmentId);
  if (keep.length > 0) removal = removal.not("topic_id", "in", `(${keep.join(",")})`);
  check("Quitar temas de la evaluación", await removal);
  if (topics.length === 0) return;
  check(
    "Guardar temas de la evaluación",
    await db.from("assessment_topics").upsert(
      topics.map((t) => ({ assessment_id: assessmentId, topic_id: t.topicId, weight: t.weight })),
      { onConflict: "assessment_id,topic_id" },
    ),
  );
}
