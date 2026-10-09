import { z } from "zod";
import type { AICompletionRequest } from "../types";
import { SPANISH, clip, sourcesBlock, type SourceExcerpt } from "./shared";

/*
 * Generar preguntas a partir de los apuntes. La IA responde en el mismo
 * formato JSON que la importación manual, así se valida con el mismo código.
 */

export const GENERATE_QUESTIONS_VERSION = "1";

/** Tipos que la IA puede generar y cómo se escribe cada uno en el JSON. */
export const GENERATABLE_TYPES = {
  multiple_choice: '{"type":"multiple_choice","stem":"…","options":["…","…","…","…"],"answer":"B","explanation":"…"}',
  true_false: '{"type":"true_false","stem":"…","answer":true,"explanation":"…"}',
  short_answer: '{"type":"short_answer","stem":"…","answer":["respuesta","sinónimo aceptado"],"explanation":"…"}',
  numeric: '{"type":"numeric","stem":"…","answer":3.5,"tolerance":0.01,"unit":"s","explanation":"…"}',
  theory: '{"type":"theory","stem":"…","answer":"respuesta modelo","explanation":"…"}',
  programming: '{"type":"programming","stem":"…","language":"c","code":"código de partida (opcional)","answer":"solución","explanation":"…"}',
  long_problem: '{"type":"long_problem","stem":"…","answer":"resolución paso a paso","explanation":"…"}',
} as const;
export type GeneratableType = keyof typeof GENERATABLE_TYPES;
export const isGeneratableType = (t: string): t is GeneratableType => t in GENERATABLE_TYPES;

export type GenerateQuestionsInput = {
  subject: string;
  topic: string | null;
  count: number;
  types: GeneratableType[];
  /** 1..5, o null para mezclar */
  difficulty: number | null;
  sources: SourceExcerpt[];
  /** Enunciados que ya existen: no repetirlos. */
  avoid: string[];
  instructions?: string | null;
};

export function generateQuestionsRequest(input: GenerateQuestionsInput): AICompletionRequest {
  const system = [
    "Eres un profesor universitario que prepara preguntas de examen a partir de los apuntes de su asignatura.",
    SPANISH,
    "Reglas:",
    "- Basa cada pregunta SOLO en las fuentes dadas; no inventes datos que no estén en ellas.",
    "- Preguntas claras, autocontenidas y sin ambigüedad, con una única respuesta correcta.",
    "- En las de tipo test, 4 opciones plausibles; «answer» es la letra de la correcta (A, B, C…).",
    "- «explanation» explica por qué es correcta (y por qué fallan las demás si es tipo test) en 1-3 frases.",
    "- «source_ref» indica de qué fuente sale, p. ej. «[2] pág. 4».",
    "- «difficulty» de 1 (muy fácil) a 5 (muy difícil).",
    "Devuelve SOLO un objeto JSON {\"questions\":[…]} sin texto alrededor.",
  ].join("\n");

  const formats = input.types.map((t) => `- ${GENERATABLE_TYPES[t]}`).join("\n");
  const user = [
    `Asignatura: ${input.subject}${input.topic ? `\nTema: ${input.topic}` : ""}`,
    `Genera ${input.count} preguntas nuevas${input.difficulty ? ` de dificultad ${input.difficulty} sobre 5` : " de dificultad variada"}.`,
    `Tipos permitidos (repártelas entre ellos) con su formato:\n${formats}`,
    'Cada pregunta lleva además "difficulty" y "source_ref".',
    input.instructions ? `Indicaciones del alumno: ${clip(input.instructions, 500)}` : "",
    input.avoid.length ? `No repitas estas preguntas que ya tiene:\n${input.avoid.map((s) => `- ${clip(s, 160)}`).join("\n")}` : "",
    `Fuentes:\n\n${sourcesBlock(input.sources)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    task: "generate_questions",
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: Math.min(8000, 600 + input.count * 450),
    temperature: 0.7,
    promptVersion: GENERATE_QUESTIONS_VERSION,
  };
}

/** Respuesta mínima esperada; el detalle lo valida la importación. */
export const generatedQuestionsSchema = z.object({ questions: z.array(z.record(z.string(), z.unknown())).min(1) });

/**
 * Prepara el JSON de la IA para la importación: siempre «ai_generated», con
 * el modelo, el tema elegido y solo los tipos pedidos.
 */
export function toImportFile(
  data: z.infer<typeof generatedQuestionsSchema>,
  opts: { model: string; topic: string | null; types: readonly string[]; limit: number },
) {
  const questions = data.questions
    .filter((q) => typeof q.type === "string" && opts.types.includes(q.type))
    .slice(0, opts.limit)
    .map((q) => {
      // Nada de lo que venga de la IA puede hacerse pasar por oficial o por propio.
      const rest = Object.fromEntries(Object.entries(q).filter(([k]) => !["source", "ai_model", "position", "points"].includes(k)));
      return { ...rest, ...(opts.topic ? { topic: opts.topic } : {}), source: "ai_generated", ai_model: opts.model };
    });
  return { questions };
}
