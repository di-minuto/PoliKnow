import { z } from "zod";
import { emptyToNull, optionalId } from "@/domain/academic/schemas";
import { parseLocaleNumber } from "@/domain/shared/numbers";
import { SOURCE_TYPES } from "@/domain/questions/types";

/*
 * Simulacros de examen: configuración, cronómetro y recomendaciones de estudio.
 * Un simulacro no enseña soluciones hasta el final, puede penalizar los fallos
 * (fracción de los puntos de la pregunta) y puede impedir volver atrás.
 */

export const EXAM_MODES = ["exam_simulation", "official_exam"] as const;
export type ExamMode = (typeof EXAM_MODES)[number];
export const isExamMode = (mode: string): mode is ExamMode => (EXAM_MODES as readonly string[]).includes(mode);

/** Penalizaciones habituales: cuánto de la pregunta resta un fallo. */
export const PENALTY_OPTIONS = [
  { value: 0, label: "Sin penalización" },
  { value: 0.25, label: "Resta 1/4" },
  { value: 0.33, label: "Resta 1/3" },
  { value: 0.5, label: "Resta 1/2" },
  { value: 1, label: "Resta lo mismo que suma" },
] as const;

const optionalLevel = z.preprocess(
  (v) => (v == null || v === "" ? null : v),
  z.coerce.number().int().min(1).max(5).nullable().default(null),
);

export const examConfigInput = z
  .object({
    subjectId: z.uuid("Elige una asignatura."),
    assessmentId: optionalId,
    /** Temas con su peso; vacío = todo el temario por igual. */
    topics: z.array(z.object({ topicId: z.uuid(), weight: z.number().min(0).max(100) })).max(200).default([]),
    count: z.coerce.number().int().min(1, "Al menos 1 pregunta.").max(100, "Máximo 100 preguntas."),
    durationMinutes: z.coerce.number().int().min(1, "Al menos 1 minuto.").max(600, "Máximo 600 minutos."),
    difficultyMin: optionalLevel,
    difficultyMax: optionalLevel,
    questionTypes: z.array(z.string().min(1).max(40)).max(20).default([]),
    sources: z.array(z.enum(SOURCE_TYPES)).max(4).default([]),
    penalty: z.number({ error: "Penalización no válida." }).min(0, "La penalización no puede ser negativa.").max(1, "Como mucho, un fallo resta lo que vale la pregunta."),
    allowBack: z.boolean(),
  })
  .superRefine((c, ctx) => {
    if (c.difficultyMin && c.difficultyMax && c.difficultyMin > c.difficultyMax) {
      ctx.addIssue({ code: "custom", message: "La dificultad mínima es mayor que la máxima." });
    }
    if (c.topics.length > 0 && c.topics.every((t) => t.weight === 0)) {
      ctx.addIssue({ code: "custom", message: "Algún tema tiene que pesar más de 0." });
    }
  });
export type ExamConfig = z.infer<typeof examConfigInput>;

/** Formulario del simulador: casillas `topic` + `weight:<id>`, como en los parciales. */
export function readExamConfigForm(formData: FormData) {
  const number = (v: FormDataEntryValue | null, fallback: number) => {
    const value = emptyToNull(v);
    return value === null ? fallback : (parseLocaleNumber(value) ?? Number.NaN);
  };
  return {
    subjectId: formData.get("subjectId") ?? "",
    assessmentId: emptyToNull(formData.get("assessmentId")),
    topics: formData
      .getAll("topic")
      .map(String)
      .filter(Boolean)
      .map((topicId) => ({ topicId, weight: number(formData.get(`weight:${topicId}`), 1) })),
    count: formData.get("count") || 20,
    durationMinutes: formData.get("durationMinutes") || 60,
    difficultyMin: formData.get("difficultyMin"),
    difficultyMax: formData.get("difficultyMax"),
    questionTypes: formData.getAll("questionType").map(String),
    sources: formData.getAll("source").map(String),
    penalty: number(formData.get("penalty"), 0),
    allowBack: formData.get("allowBack") === "on",
  };
}

// ---------------------------------------------------------------- tiempo

/** Margen para respuestas que salen justo al acabar el tiempo (latencia de red). */
export const GRACE_SECONDS = 30;

export function remainingSeconds(startedAt: string, limitSeconds: number | null, now: Date): number | null {
  if (!limitSeconds) return null;
  const end = new Date(startedAt).getTime() + limitSeconds * 1000;
  return Math.max(0, Math.ceil((end - now.getTime()) / 1000));
}

/** ¿Se ha pasado el tiempo (con el margen)? Sin límite, nunca. */
export function isExpired(startedAt: string, limitSeconds: number | null, now: Date): boolean {
  if (!limitSeconds) return false;
  return now.getTime() > new Date(startedAt).getTime() + (limitSeconds + GRACE_SECONDS) * 1000;
}

/** Tiempo usado, sin pasar del límite. */
export function usedSeconds(startedAt: string, limitSeconds: number | null, now: Date): number {
  const used = Math.max(0, Math.round((now.getTime() - new Date(startedAt).getTime()) / 1000));
  return limitSeconds ? Math.min(used, limitSeconds) : used;
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

// ---------------------------------------------------------------- recomendaciones

export type ExamReport = {
  grade: number;
  total: number;
  incorrect: number;
  unanswered: number;
  pending: number;
  /** puntos que se han restado por fallos */
  penaltyLost: number;
  maxScore: number;
  timeUsedSeconds: number | null;
  timeLimitSeconds: number | null;
  byTopic: { name: string; grade: number; count: number }[];
};

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Consejos concretos a partir del resultado de un examen o simulacro. */
export function studyRecommendations(r: ExamReport): string[] {
  const tips: string[] = [];
  const weak = r.byTopic.filter((t) => t.grade < 5).sort((a, b) => a.grade - b.grade);
  if (weak.length) {
    tips.push(
      `Repasa primero ${weak.map((t) => `${t.name} (${fmt(t.grade)})`).join(", ")}: es donde más nota pierdes.`,
    );
  }
  const strong = r.byTopic.filter((t) => t.grade >= 8 && t.count >= 2);
  if (strong.length && weak.length) {
    tips.push(`${strong.map((t) => t.name).join(", ")} lo llevas bien: dedícale menos tiempo por ahora.`);
  }
  if (r.penaltyLost > 0) {
    const pct = r.maxScore > 0 ? Math.round((r.penaltyLost / r.maxScore) * 100) : 0;
    tips.push(
      `Los fallos te han restado ${fmt(r.penaltyLost)} puntos (${pct}% del examen). Responde solo cuando puedas descartar opciones.`,
    );
  }
  const used = r.timeUsedSeconds ?? 0;
  const ranOut = r.timeLimitSeconds ? used >= r.timeLimitSeconds * 0.98 : false;
  if (r.unanswered > 0 && r.total > 0) {
    tips.push(
      ranOut
        ? `Se te acabó el tiempo con ${r.unanswered} sin responder: practica con simulacros más cortos para ganar ritmo.`
        : `Dejaste ${r.unanswered} sin responder. Repasa esas preguntas: son las que no sabías.`,
    );
  } else if (r.timeLimitSeconds && used < r.timeLimitSeconds * 0.5 && r.grade < 7) {
    tips.push("Te sobró más de la mitad del tiempo: úsalo para repasar las respuestas antes de entregar.");
  }
  if (r.pending > 0) {
    tips.push(
      r.pending === 1
        ? "Autoevalúa abajo la pregunta de desarrollo para tener la nota completa."
        : `Autoevalúa abajo las ${r.pending} preguntas de desarrollo para tener la nota completa.`,
    );
  }
  if (tips.length === 0) {
    tips.push(r.grade >= 9 ? "¡Muy bien! Prueba un simulacro más difícil o de otro parcial." : "Sigue con repasos cortos para fijarlo.");
  }
  return tips;
}
