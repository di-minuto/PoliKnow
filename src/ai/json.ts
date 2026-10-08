import type { ZodType } from "zod";
import type { AIProvider } from "./provider";
import type { AICompletionRequest } from "./types";

export class AIResponseFormatError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = "AIResponseFormatError";
  }
}

/** Extrae el primer bloque JSON de un texto (admite ```json ... ```). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new SyntaxError("No hay JSON en la respuesta.");
  return JSON.parse(candidate.slice(start));
}

/**
 * Pide una respuesta estructurada a cualquier proveedor y la valida con zod.
 * Independiente del proveedor: funciona igual con Claude, OpenAI u otro.
 */
export async function completeJSON<T>(
  provider: AIProvider,
  request: AICompletionRequest,
  schema: ZodType<T>,
): Promise<T> {
  const result = await provider.complete(request);
  let data: unknown;
  try {
    data = extractJson(result.text);
  } catch {
    throw new AIResponseFormatError("La IA no devolvió JSON válido.", result.text);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new AIResponseFormatError("El JSON de la IA no tiene el formato esperado.", result.text);
  }
  return parsed.data;
}
