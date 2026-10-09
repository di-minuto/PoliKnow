import { z } from "zod";
import { emptyToNull, optionalId } from "@/domain/academic/schemas";
import { SOURCE_TYPES } from "@/domain/questions/types";
import { TEST_MODES } from "./types";

const optionalLevel = z.preprocess(
  (v) => (v == null || v === "" ? null : v),
  z.coerce.number().int().min(1).max(5).nullable().default(null),
);

/** Configuración de un test (formulario del generador y modos automáticos). */
export const testConfigInput = z
  .object({
    mode: z.enum(TEST_MODES),
    subjectId: optionalId,
    assessmentId: optionalId,
    topicIds: z.array(z.uuid()).max(200).default([]),
    count: z.preprocess(
      (v) => (v == null || v === "" ? undefined : v),
      z.coerce.number().int().min(1, "Al menos 1 pregunta.").max(100, "Máximo 100 preguntas.").default(10),
    ),
    difficultyMin: optionalLevel,
    difficultyMax: optionalLevel,
    questionTypes: z.array(z.string().min(1).max(40)).max(20).default([]),
    sources: z.array(z.enum(SOURCE_TYPES)).max(4).default([]),
  })
  .superRefine((c, ctx) => {
    if (["topic", "assessment", "custom"].includes(c.mode) && !c.subjectId) {
      ctx.addIssue({ code: "custom", message: "Elige una asignatura." });
    }
    if (c.mode === "topic" && c.topicIds.length === 0) ctx.addIssue({ code: "custom", message: "Elige un tema." });
    if (c.mode === "assessment" && !c.assessmentId) ctx.addIssue({ code: "custom", message: "Elige el parcial." });
    if (c.difficultyMin && c.difficultyMax && c.difficultyMin > c.difficultyMax) {
      ctx.addIssue({ code: "custom", message: "La dificultad mínima es mayor que la máxima." });
    }
  });
export type TestConfig = z.infer<typeof testConfigInput>;

export function readTestConfigForm(formData: FormData) {
  return {
    mode: formData.get("mode"),
    subjectId: emptyToNull(formData.get("subjectId")),
    assessmentId: emptyToNull(formData.get("assessmentId")),
    topicIds: formData.getAll("topic").map(String).filter(Boolean),
    count: formData.get("count"),
    difficultyMin: formData.get("difficultyMin"),
    difficultyMax: formData.get("difficultyMax"),
    questionTypes: formData.getAll("questionType").map(String),
    sources: formData.getAll("source").map(String),
  };
}

/** Mensaje cuando no hay preguntas para el modo pedido. */
export const EMPTY_MESSAGES: Record<(typeof TEST_MODES)[number], string> = {
  quick: "No hay preguntas todavía. Crea o importa algunas en Preguntas.",
  failed_review: "No tienes preguntas falladas. ¡Bien!",
  smart_review: "No hay preguntas todavía. Crea o importa algunas en Preguntas.",
  topic: "Ese tema no tiene preguntas (aprobadas y sin archivar).",
  assessment: "Los temas de ese parcial no tienen preguntas. Revisa qué temas entran en el parcial.",
  custom: "No hay preguntas con esos filtros.",
};
