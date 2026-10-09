import type { ZodType } from "zod";
import type { AIProvider } from "./provider";
import type { AICompletionRequest } from "./types";

export class AIResponseFormatError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = "AIResponseFormatError";
  }
}

/** Desde la posición de un { o [, hasta su cierre (respetando cadenas). Null si no se cierra. */
function balancedEnd(text: string, start: number): number | null {
  const stack: string[] = [];
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") {
      if (stack.pop() !== c) return null;
      if (stack.length === 0) return i + 1;
    }
  }
  return null;
}

/** Cierres pendientes al final del texto, o null si acaba dentro de una cadena. */
function pendingClosers(text: string): string | null {
  const stack: string[] = [];
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") stack.pop();
  }
  return inString ? null : stack.reverse().join("");
}

/**
 * Respuesta cortada a medias (límite de tokens): se queda con los elementos
 * completos y cierra lo que quedó abierto. Así no se pierden las preguntas ya escritas.
 */
function repairTruncated(text: string): unknown {
  let tries = 0;
  for (let i = text.length - 1; i > 0 && tries < 60; i--) {
    if (text[i] !== "}" && text[i] !== "]") continue;
    tries++;
    const head = text.slice(0, i + 1);
    const closers = pendingClosers(head);
    if (closers === null) continue;
    try {
      return JSON.parse((head + closers).replace(/,\s*([}\]])/g, "$1"));
    } catch {
      // probar con un cierre anterior
    }
  }
  return undefined;
}

/**
 * Extrae el JSON de la respuesta: admite ```json ... ```, texto antes o
 * después y comas sobrantes antes de } o ].
 */
export function extractJson(text: string): unknown {
  const clean = text.replace(/^\uFEFF/, "");
  const fenced = clean.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  const candidates = fenced ? [fenced[1], clean] : [clean];
  let lastError: unknown = new SyntaxError("No hay JSON en la respuesta.");
  for (const candidate of candidates) {
    // Prueba desde cada { o [ (los primeros), por si hay texto con llaves antes del JSON.
    let tries = 0;
    for (let start = candidate.search(/[[{]/); start !== -1 && tries < 20; tries++) {
      const end = balancedEnd(candidate, start);
      if (end === null && tries === 0) {
        const repaired = repairTruncated(candidate.slice(start));
        if (repaired !== undefined) return repaired;
      }
      if (end !== null) {
        const slice = candidate.slice(start, end);
        for (const attempt of [slice, slice.replace(/,\s*([}\]])/g, "$1")]) {
          try {
            return JSON.parse(attempt);
          } catch (error) {
            lastError = error;
          }
        }
      }
      const next = candidate.slice(start + 1).search(/[[{]/);
      start = next === -1 ? -1 : start + 1 + next;
    }
  }
  throw lastError;
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
