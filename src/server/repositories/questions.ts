import "server-only";
import type { QuestionInput, OfficialExamInput } from "@/domain/questions/schemas";
import type { OfficialExam, Question, ReviewStatus, SourceType } from "@/domain/questions/types";
import { createClient } from "@/lib/supabase/server";
import { check } from "./academic";

/*
 * Banco de preguntas y exámenes oficiales. La procedencia (source_type) se
 * guarda siempre y la BD impide mezclar oficiales con el resto.
 */

type QuestionRow = {
  id: string;
  subject_id: string;
  topic_id: string | null;
  subtopic: string | null;
  question_type: string;
  source_type: SourceType;
  stem: string;
  content: Record<string, unknown>;
  answer: unknown;
  explanation: string | null;
  difficulty: 1 | 2 | 3 | 4 | 5;
  document_id: string | null;
  source_ref: string | null;
  official_exam_id: string | null;
  official_position: number | null;
  points: number | string | null;
  original_text: string | null;
  review_status: ReviewStatus;
  ai_model: string | null;
  variant_of: string | null;
  tags: string[];
  archived: boolean;
};

const QUESTION_COLUMNS =
  "id, subject_id, topic_id, subtopic, question_type, source_type, stem, content, answer, explanation, difficulty, document_id, source_ref, official_exam_id, official_position, points, original_text, review_status, ai_model, variant_of, tags, archived";

const toQuestion = (r: QuestionRow): Question => ({
  id: r.id,
  subjectId: r.subject_id,
  topicId: r.topic_id,
  subtopic: r.subtopic,
  questionType: r.question_type,
  sourceType: r.source_type,
  stem: r.stem,
  content: r.content,
  answer: r.answer,
  explanation: r.explanation,
  difficulty: r.difficulty,
  documentId: r.document_id,
  sourceRef: r.source_ref,
  officialExamId: r.official_exam_id,
  officialPosition: r.official_position,
  points: r.points === null ? null : Number(r.points),
  originalText: r.original_text,
  reviewStatus: r.review_status,
  aiModel: r.ai_model,
  variantOf: r.variant_of,
  tags: r.tags,
  archived: r.archived,
});

const toRow = (q: QuestionInput) => ({
  subject_id: q.subjectId,
  topic_id: q.topicId,
  subtopic: q.subtopic,
  question_type: q.questionType,
  source_type: q.sourceType,
  stem: q.stem,
  content: q.content,
  answer: q.answer,
  explanation: q.explanation,
  difficulty: q.difficulty,
  document_id: q.documentId,
  source_ref: q.sourceRef,
  official_exam_id: q.officialExamId,
  official_position: q.officialPosition,
  points: q.points,
  original_text: q.originalText,
  review_status: q.reviewStatus,
  ai_model: q.aiModel,
  variant_of: q.variantOf,
  tags: q.tags,
});

export type QuestionFilters = {
  subjectId?: string;
  topicIds?: string[];
  questionType?: string;
  sourceType?: SourceType;
  reviewStatus?: ReviewStatus;
  officialExamId?: string;
  archived?: boolean;
  text?: string;
};

export const QUESTIONS_PAGE_SIZE = 30;

export async function listQuestions(filters: QuestionFilters, page = 0) {
  const db = await createClient();
  let query = db.from("questions").select(QUESTION_COLUMNS, { count: "exact" });
  if (filters.subjectId) query = query.eq("subject_id", filters.subjectId);
  if (filters.topicIds?.length) query = query.in("topic_id", filters.topicIds);
  if (filters.questionType) query = query.eq("question_type", filters.questionType);
  if (filters.sourceType) query = query.eq("source_type", filters.sourceType);
  if (filters.reviewStatus) query = query.eq("review_status", filters.reviewStatus);
  if (filters.officialExamId) query = query.eq("official_exam_id", filters.officialExamId);
  query = query.eq("archived", filters.archived ?? false);
  if (filters.text) query = query.textSearch("tsv", filters.text, { config: "es_unaccent", type: "websearch" });
  const from = page * QUESTIONS_PAGE_SIZE;
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, from + QUESTIONS_PAGE_SIZE - 1);
  if (error) throw new Error(`Listar preguntas: ${error.message}`);
  return { questions: (data as QuestionRow[]).map(toQuestion), total: count ?? 0 };
}

export async function listExamQuestions(officialExamId: string): Promise<Question[]> {
  const db = await createClient();
  const rows = check<QuestionRow[]>(
    "Preguntas del examen",
    await db
      .from("questions")
      .select(QUESTION_COLUMNS)
      .eq("official_exam_id", officialExamId)
      .order("official_position", { nullsFirst: false })
      .order("created_at"),
  );
  return rows.map(toQuestion);
}

export async function getQuestion(id: string): Promise<Question | null> {
  const db = await createClient();
  const rows = check<QuestionRow[]>(
    "Leer pregunta",
    await db.from("questions").select(QUESTION_COLUMNS).eq("id", id).limit(1),
  );
  return rows[0] ? toQuestion(rows[0]) : null;
}

/** Recuento por asignatura (sin archivadas). */
export async function countQuestions(subjectId: string): Promise<number> {
  const db = await createClient();
  const { count, error } = await db
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("subject_id", subjectId)
    .eq("archived", false);
  if (error) throw new Error(`Contar preguntas: ${error.message}`);
  return count ?? 0;
}

export async function listQuestionTypes() {
  const db = await createClient();
  const rows = check<{ code: string; label: string; auto_gradable: boolean }[]>(
    "Tipos de pregunta",
    await db.from("question_types").select("code, label, auto_gradable").order("position"),
  );
  return rows.map((r) => ({ code: r.code, label: r.label, autoGradable: r.auto_gradable }));
}

export async function createQuestion(input: QuestionInput): Promise<string> {
  const db = await createClient();
  const row = check<{ id: string }>(
    "Crear pregunta",
    await db.from("questions").insert(toRow(input)).select("id").single(),
  );
  return row.id;
}

export async function createQuestions(inputs: QuestionInput[]): Promise<number> {
  if (inputs.length === 0) return 0;
  const db = await createClient();
  const rows = check<{ id: string }[]>(
    "Importar preguntas",
    await db.from("questions").insert(inputs.map(toRow)).select("id"),
  );
  return rows.length;
}

export async function updateQuestion(id: string, input: QuestionInput): Promise<void> {
  const db = await createClient();
  check("Actualizar pregunta", await db.from("questions").update(toRow(input)).eq("id", id));
}

export async function setQuestionFlags(id: string, flags: { archived?: boolean; reviewStatus?: ReviewStatus }) {
  const db = await createClient();
  const patch: Record<string, unknown> = {};
  if (flags.archived !== undefined) patch.archived = flags.archived;
  if (flags.reviewStatus) patch.review_status = flags.reviewStatus;
  check("Actualizar pregunta", await db.from("questions").update(patch).eq("id", id));
}

export async function deleteQuestion(id: string): Promise<void> {
  const db = await createClient();
  check("Borrar pregunta", await db.from("questions").delete().eq("id", id));
}

// ---------------------------------------------------------------- exámenes oficiales

type OfficialExamRow = {
  id: string;
  subject_id: string;
  assessment_id: string | null;
  document_id: string | null;
  solution_document_id: string | null;
  title: string;
  year: number | null;
  exam_session: string | null;
  exam_date: string | null;
  duration_minutes: number | null;
  total_points: number | string | null;
  rules: { wrong_answer_penalty?: number; allow_back?: boolean } | null;
  instructions: string | null;
};

const EXAM_COLUMNS =
  "id, subject_id, assessment_id, document_id, solution_document_id, title, year, exam_session, exam_date, duration_minutes, total_points, rules, instructions";

const toExam = (r: OfficialExamRow): OfficialExam => ({
  id: r.id,
  subjectId: r.subject_id,
  assessmentId: r.assessment_id,
  documentId: r.document_id,
  solutionDocumentId: r.solution_document_id,
  title: r.title,
  year: r.year,
  examSession: r.exam_session,
  examDate: r.exam_date,
  durationMinutes: r.duration_minutes,
  totalPoints: r.total_points === null ? null : Number(r.total_points),
  rules: { wrongAnswerPenalty: r.rules?.wrong_answer_penalty, allowBack: r.rules?.allow_back },
  instructions: r.instructions,
});

const examRow = (input: OfficialExamInput) => ({
  subject_id: input.subjectId,
  assessment_id: input.assessmentId,
  document_id: input.documentId,
  solution_document_id: input.solutionDocumentId,
  title: input.title,
  year: input.year,
  exam_session: input.examSession,
  exam_date: input.examDate,
  duration_minutes: input.durationMinutes,
  total_points: input.totalPoints,
  rules: input.wrongAnswerPenalty !== null ? { wrong_answer_penalty: input.wrongAnswerPenalty } : {},
  instructions: input.instructions,
});

export async function listOfficialExams(subjectId?: string): Promise<OfficialExam[]> {
  const db = await createClient();
  let query = db.from("official_exams").select(EXAM_COLUMNS);
  if (subjectId) query = query.eq("subject_id", subjectId);
  const rows = check<OfficialExamRow[]>(
    "Listar exámenes oficiales",
    await query.order("year", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
  );
  return rows.map(toExam);
}

export async function getOfficialExam(id: string): Promise<OfficialExam | null> {
  const db = await createClient();
  const rows = check<OfficialExamRow[]>(
    "Leer examen oficial",
    await db.from("official_exams").select(EXAM_COLUMNS).eq("id", id).limit(1),
  );
  return rows[0] ? toExam(rows[0]) : null;
}

/** Número de preguntas por examen oficial. */
export async function countExamQuestions(examIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (examIds.length === 0) return counts;
  const db = await createClient();
  const rows = check<{ official_exam_id: string }[]>(
    "Contar preguntas de exámenes",
    await db.from("questions").select("official_exam_id").in("official_exam_id", examIds),
  );
  for (const r of rows) counts.set(r.official_exam_id, (counts.get(r.official_exam_id) ?? 0) + 1);
  return counts;
}

export async function createOfficialExam(input: OfficialExamInput): Promise<string> {
  const db = await createClient();
  const row = check<{ id: string }>(
    "Crear examen oficial",
    await db.from("official_exams").insert(examRow(input)).select("id").single(),
  );
  return row.id;
}

export async function updateOfficialExam(id: string, input: OfficialExamInput): Promise<void> {
  const db = await createClient();
  check("Actualizar examen oficial", await db.from("official_exams").update(examRow(input)).eq("id", id));
}

/** Borra el examen y, en cascada, sus preguntas oficiales. */
export async function deleteOfficialExam(id: string): Promise<void> {
  const db = await createClient();
  check("Borrar examen oficial", await db.from("official_exams").delete().eq("id", id));
}

/** Siguiente posición libre dentro de un examen. */
export async function nextExamPosition(officialExamId: string): Promise<number> {
  const db = await createClient();
  const rows = check<{ official_position: number | null }[]>(
    "Posición en el examen",
    await db
      .from("questions")
      .select("official_position")
      .eq("official_exam_id", officialExamId)
      .order("official_position", { ascending: false, nullsFirst: false })
      .limit(1),
  );
  return (rows[0]?.official_position ?? 0) + 1;
}
