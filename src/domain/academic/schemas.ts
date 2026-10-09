import { z } from "zod";

/**
 * Validación de la entrada de formularios (FormData → objetos tipados).
 * Los campos vacíos de un formulario llegan como "" y se convierten en null.
 */

export const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max, `Máximo ${max} caracteres.`).nullable().default(null));

export const requiredText = (max: number, label: string) =>
  z.string({ error: `${label} es obligatorio.` }).trim().min(1, `${label} es obligatorio.`).max(max, `Máximo ${max} caracteres.`);

const level = z.coerce.number().int().min(1).max(5);

const optionalNumber = (min: number, max: number) =>
  z.preprocess(emptyToNull, z.coerce.number().min(min).max(max).nullable().default(null));

export const optionalInt = (min: number, max: number) =>
  z.preprocess(emptyToNull, z.coerce.number().int().min(min).max(max).nullable().default(null));

export const id = z.uuid("Identificador no válido.");
const optionalId = z.preprocess(emptyToNull, id.nullable().default(null));

export const courseInput = z.object({
  name: requiredText(100, "El nombre"),
  academicYear: optionalText(20),
});
export type CourseInput = z.infer<typeof courseInput>;

export const subjectInput = z.object({
  courseId: id,
  name: requiredText(100, "El nombre"),
  code: optionalText(20),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color no válido.").default("#6366f1"),
  perceivedDifficulty: level.default(3),
  importance: level.default(3),
});
export type SubjectInput = z.infer<typeof subjectInput>;

export const TOPIC_KINDS = ["theory", "lab", "other"] as const;
export const TOPIC_KIND_LABELS: Record<(typeof TOPIC_KINDS)[number], string> = {
  theory: "Tema",
  lab: "Práctica",
  other: "Otro",
};

export const topicInput = z.object({
  subjectId: id,
  parentId: optionalId,
  name: requiredText(150, "El nombre"),
  description: optionalText(2000),
  kind: z.enum(TOPIC_KINDS).default("theory"),
  estimatedHours: optionalNumber(0, 500),
});
export type TopicInput = z.infer<typeof topicInput>;

export const ASSESSMENT_STATUSES = ["upcoming", "done", "cancelled"] as const;
export const ASSESSMENT_STATUS_LABELS: Record<(typeof ASSESSMENT_STATUSES)[number], string> = {
  upcoming: "Pendiente",
  done: "Realizado",
  cancelled: "Cancelado",
};

export const assessmentInput = z.object({
  subjectId: id,
  assessmentType: z.string().trim().min(1).max(40),
  name: requiredText(100, "El nombre"),
  /** Valor de <input type="datetime-local">, en la zona del usuario. */
  examAtLocal: z.preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Fecha no válida.")
      .nullable()
      .default(null),
  ),
  durationMinutes: optionalInt(1, 600),
  importance: level.default(3),
  perceivedDifficulty: z.preprocess(emptyToNull, level.nullable().default(null)),
  gradeWeight: optionalNumber(0, 100),
  status: z.enum(ASSESSMENT_STATUSES).default("upcoming"),
});
export type AssessmentInput = z.infer<typeof assessmentInput>;

export const assessmentTopicsInput = z.object({
  assessmentId: id,
  topics: z
    .array(z.object({ topicId: id, weight: z.coerce.number().min(0, "El peso no puede ser negativo.").max(100) }))
    .max(500),
});
export type AssessmentTopicsInput = z.infer<typeof assessmentTopicsInput>;

/** Horas por día de la semana (0 = domingo). Se guardan en minutos. */
export const availabilityInput = z.object({
  hoursByWeekday: z
    .array(z.preprocess((v) => (v === "" || v == null ? 0 : v), z.coerce.number().min(0).max(16)))
    .length(7),
});

export const blockedDayInput = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida."),
  reason: optionalText(200),
});
export type BlockedDayInput = z.infer<typeof blockedDayInput>;

/** Primer mensaje de error legible de un resultado de zod. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Datos no válidos.";
}

/** Lee los pesos del formulario de temas de un parcial: casillas `topic` + campos `weight:<id>`. */
export function readAssessmentTopicsForm(formData: FormData) {
  const selected = formData.getAll("topic").map(String);
  return {
    assessmentId: formData.get("assessmentId"),
    topics: selected.map((topicId) => ({
      topicId,
      weight: formData.get(`weight:${topicId}`) || 1,
    })),
  };
}
