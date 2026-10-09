import { z } from "zod";

/*
 * Formato de la copia de seguridad: un JSON con las filas de cada tabla tal
 * cual (sin user_id ni columnas calculadas). Con archivos, va dentro de un ZIP
 * junto a files/<id del documento>/<nombre>.
 */

export const BACKUP_FORMAT = "estudio-backup";
export const BACKUP_VERSION = 1;

/** Tablas en orden de dependencias: cada una solo apunta a las anteriores (o a sí misma). */
export const BACKUP_TABLES = [
  { name: "courses", order: ["created_at", "id"], refs: {} },
  { name: "subjects", order: ["created_at", "id"], refs: { course_id: "courses" } },
  { name: "topics", order: ["created_at", "id"], refs: { subject_id: "subjects", parent_id: "topics" } },
  { name: "assessments", order: ["created_at", "id"], refs: { subject_id: "subjects" } },
  { name: "assessment_topics", order: ["assessment_id", "topic_id"], refs: { assessment_id: "assessments", topic_id: "topics" } },
  { name: "documents", order: ["created_at", "id"], refs: { subject_id: "subjects" } },
  { name: "document_topics", order: ["document_id", "topic_id"], refs: { document_id: "documents", topic_id: "topics" } },
  {
    name: "document_assessments",
    order: ["document_id", "assessment_id"],
    refs: { document_id: "documents", assessment_id: "assessments" },
  },
  { name: "document_chunks", order: ["document_id", "chunk_index"], refs: { document_id: "documents" } },
  {
    name: "official_exams",
    order: ["created_at", "id"],
    refs: { subject_id: "subjects", assessment_id: "assessments", document_id: "documents", solution_document_id: "documents" },
  },
  {
    name: "questions",
    order: ["created_at", "id"],
    refs: { subject_id: "subjects", topic_id: "topics", document_id: "documents", official_exam_id: "official_exams", variant_of: "questions" },
  },
  { name: "question_progress", order: ["question_id"], refs: { question_id: "questions" } },
  { name: "topic_progress", order: ["topic_id"], refs: { topic_id: "topics" } },
  {
    name: "attempts",
    order: ["created_at", "id"],
    refs: { subject_id: "subjects", assessment_id: "assessments", official_exam_id: "official_exams" },
  },
  { name: "attempt_items", order: ["attempt_id", "position"], refs: { attempt_id: "attempts", question_id: "questions" } },
  { name: "availability_rules", order: ["weekday"], refs: {} },
  { name: "blocked_days", order: ["day"], refs: {} },
  {
    name: "plan_tasks",
    order: ["day", "id"],
    refs: { subject_id: "subjects", assessment_id: "assessments", topic_id: "topics", rescheduled_from: "plan_tasks" },
  },
  { name: "study_sessions", order: ["started_at", "id"], refs: { plan_task_id: "plan_tasks", subject_id: "subjects", topic_id: "topics" } },
  { name: "assistant_conversations", order: ["created_at", "id"], refs: { subject_id: "subjects" } },
  { name: "assistant_messages", order: ["created_at", "id"], refs: { conversation_id: "assistant_conversations" } },
] as const satisfies readonly { name: string; order: readonly string[]; refs: Record<string, string> }[];

export type BackupTable = (typeof BACKUP_TABLES)[number]["name"];

/** Referencias que pueden quedar vacías (en la BD admiten null). El resto, sin destino, descarta la fila. */
export const NULLABLE_REFS: Record<string, readonly string[]> = {
  topics: ["parent_id"],
  official_exams: ["assessment_id", "document_id", "solution_document_id"],
  questions: ["topic_id", "document_id", "variant_of"],
  attempts: ["subject_id", "assessment_id", "official_exam_id"],
  plan_tasks: ["assessment_id", "topic_id", "rescheduled_from"],
  study_sessions: ["plan_task_id", "subject_id", "topic_id"],
  assistant_conversations: ["subject_id"],
};

/** Catálogos ampliables: solo se copian las filas propias del usuario. */
export const CATALOG_TABLES = ["assessment_types", "document_types", "question_types"] as const;

/** Columnas que no se exportan: el dueño lo pone la BD al importar y las calculadas se regeneran. */
export const STRIPPED_COLUMNS = ["user_id", "tsv"];

export type Row = Record<string, unknown>;

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT, { error: "No es una copia de seguridad de esta app." }),
  version: z.number().int().max(BACKUP_VERSION, { error: "La copia es de una versión más nueva de la app." }),
  exportedAt: z.string(),
  account: z.string().nullable().optional(),
  profile: z.record(z.string(), z.unknown()).nullable().optional(),
  catalogs: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).default({}),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});
export type Backup = z.infer<typeof backupSchema>;

export function stripRow(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (!STRIPPED_COLUMNS.includes(k)) out[k] = v;
  return out;
}

/** Ruta del archivo de un documento dentro del ZIP. */
export const zipFilePath = (documentId: string, filename: string) => `files/${documentId}/${filename}`;

/** Resumen legible: filas por tabla. */
export function countRows(tables: Record<string, readonly unknown[]>): Record<string, number> {
  return Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.length]));
}
