import { z } from "zod";

/*
 * Contenido y respuesta de cada tipo de pregunta (columnas `content` y
 * `answer`, en JSON). Un único formato canónico por tipo: el editor, la
 * importación y la corrección trabajan con estas formas.
 */

export type ChoiceBody = { content: { options: string[]; multiple: boolean }; answer: { correct: number[] } };
export type TrueFalseBody = { content: Record<string, never>; answer: { value: boolean } };
export type ShortAnswerBody = { content: Record<string, never>; answer: { accepted: string[] } };
export type NumericBody = { content: { unit: string | null; tolerance: number }; answer: { value: number } };
export type CodeBody = { content: { language: string | null; code: string | null }; answer: { model: string | null } };
export type OpenBody = { content: Record<string, never>; answer: { model: string | null } };

/** Tipos cuya pregunta lleva código (programación, completar, encontrar errores). */
export const CODE_TYPES = ["programming", "code_completion", "find_errors"] as const;

export type BodyKind = "choice" | "true_false" | "short_answer" | "numeric" | "code" | "open";

/** Forma del cuerpo según el tipo; los tipos propios del usuario son abiertos. */
export function bodyKind(questionType: string): BodyKind {
  switch (questionType) {
    case "multiple_choice":
      return "choice";
    case "true_false":
      return "true_false";
    case "short_answer":
      return "short_answer";
    case "numeric":
      return "numeric";
    default:
      return (CODE_TYPES as readonly string[]).includes(questionType) ? "code" : "open";
  }
}

const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`);
const nullableText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), text(max).nullable().default(null));

const choiceBody = z
  .object({
    content: z.object({
      options: z
        .array(text(1000).min(1, "Hay una opción vacía."))
        .min(2, "Pon al menos dos opciones.")
        .max(10, "Máximo 10 opciones."),
      multiple: z.boolean().default(false),
    }),
    answer: z.object({
      correct: z.array(z.number().int().min(0)).min(1, "Marca la opción correcta."),
    }),
  })
  .superRefine((b, ctx) => {
    if (b.answer.correct.some((i) => i >= b.content.options.length)) {
      ctx.addIssue({ code: "custom", message: "La respuesta correcta no es una de las opciones." });
    }
    if (!b.content.multiple && b.answer.correct.length > 1) {
      ctx.addIssue({ code: "custom", message: "Solo puede haber una correcta (o marca «varias correctas»)." });
    }
  })
  .transform((b) => ({ ...b, answer: { correct: [...new Set(b.answer.correct)].sort((x, y) => x - y) } }));

const trueFalseBody = z.object({
  content: z.object({}).strip().default({}),
  answer: z.object({ value: z.boolean({ error: "Indica si es verdadero o falso." }) }),
});

const shortAnswerBody = z.object({
  content: z.object({}).strip().default({}),
  answer: z.object({
    accepted: z
      .array(text(500))
      .transform((a) => a.filter(Boolean))
      .pipe(z.array(z.string()).min(1, "Escribe al menos una respuesta aceptada.").max(20)),
  }),
});

const numericBody = z.object({
  content: z.object({
    unit: nullableText(30),
    tolerance: z.number().min(0, "La tolerancia no puede ser negativa.").default(0),
  }),
  answer: z.object({ value: z.number({ error: "Escribe el resultado numérico." }).finite() }),
});

const codeBody = z.object({
  content: z.object({ language: nullableText(40), code: nullableText(20000) }),
  answer: z.object({ model: nullableText(20000) }),
});

const openBody = z.object({
  content: z.object({}).strip().default({}),
  answer: z.object({ model: nullableText(20000) }),
});

export type QuestionBody = ChoiceBody | TrueFalseBody | ShortAnswerBody | NumericBody | CodeBody | OpenBody;

export function bodySchema(questionType: string): z.ZodType<QuestionBody> {
  const schemas: Record<BodyKind, z.ZodType<QuestionBody>> = {
    choice: choiceBody as z.ZodType<QuestionBody>,
    true_false: trueFalseBody as z.ZodType<QuestionBody>,
    short_answer: shortAnswerBody as z.ZodType<QuestionBody>,
    numeric: numericBody as z.ZodType<QuestionBody>,
    code: codeBody as z.ZodType<QuestionBody>,
    open: openBody as z.ZodType<QuestionBody>,
  };
  return schemas[bodyKind(questionType)];
}

/** Letra de una opción: 0 → A. */
export const optionLetter = (index: number) => String.fromCharCode(65 + index);

export { parseLocaleNumber } from "@/domain/shared/numbers";
