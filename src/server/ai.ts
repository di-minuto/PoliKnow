import "server-only";
import type { ZodType } from "zod";
import { AIDisabledError, getAIProvider } from "@/ai";
import { buildCacheKey } from "@/ai/cache-key";
import { AIResponseFormatError, extractJson } from "@/ai/json";
import { DisabledProvider } from "@/ai/providers/disabled";
import { AIRequestError } from "@/ai/providers/http";
import type { AICompletionRequest, AICompletionResult } from "@/ai/types";
import { toLocalDayKey, zonedLocalToUtc } from "@/lib/dates";
import { getServerEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/server/profile";
import { check } from "@/server/repositories/academic";

/*
 * Toda llamada a la IA pasa por aquí: caché por hash (la misma petición no se
 * paga dos veces), tope diario de tokens y registro del consumo en ai_cache.
 */

export class AILimitError extends Error {
  constructor(limit: number) {
    super(`Has llegado al tope diario de IA (${limit.toLocaleString("es-ES")} tokens). Mañana se renueva; puedes cambiarlo con AI_DAILY_TOKEN_LIMIT.`);
    this.name = "AILimitError";
  }
}

export function aiInfo() {
  const provider = getAIProvider();
  return {
    enabled: provider.enabled,
    provider: provider.name,
    model: provider.model,
    reason: provider instanceof DisabledProvider ? (provider.reason ?? null) : null,
    dailyLimit: getServerEnv().AI_DAILY_TOKEN_LIMIT,
  };
}

async function tokensSince(iso: string): Promise<{ tokens: number; calls: number }> {
  const db = await createClient();
  const rows = check<{ input_tokens: number | null; output_tokens: number | null }[]>(
    "Consumo de IA",
    await db.from("ai_cache").select("input_tokens, output_tokens").gte("created_at", iso),
  );
  return { tokens: rows.reduce((s, r) => s + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0), calls: rows.length };
}

/** Tokens gastados hoy y este mes (en la zona horaria del usuario). */
export async function aiUsage() {
  const { timezone } = await getProfile();
  const today = toLocalDayKey(new Date(), timezone);
  const [day, month] = await Promise.all([
    tokensSince(zonedLocalToUtc(`${today}T00:00`, timezone)),
    tokensSince(zonedLocalToUtc(`${today.slice(0, 8)}01T00:00`, timezone)),
  ]);
  return { today: day, month };
}

export type RunOptions = {
  /** Lo que identifica la petición en la caché (por defecto, la petición entera). */
  cacheInput?: unknown;
  /** false para no reutilizar respuestas (p. ej. «otra variante»). */
  useCache?: boolean;
};

/** Ejecuta una petición de IA con caché y tope diario. */
export async function runAI(request: AICompletionRequest, options: RunOptions = {}): Promise<AICompletionResult> {
  const provider = getAIProvider();
  if (!provider.enabled) throw new AIDisabledError();
  const db = await createClient();
  const key = buildCacheKey({
    provider: provider.name,
    model: provider.model,
    task: request.task,
    promptVersion: request.promptVersion,
    input: options.cacheInput ?? { system: request.system, messages: request.messages },
  });

  if (options.useCache !== false) {
    const hit = await db.from("ai_cache").select("response").eq("cache_key", key).maybeSingle();
    const text = (hit.data?.response as { text?: unknown } | undefined)?.text;
    if (typeof text === "string") return { text, provider: provider.name, model: provider.model, cached: true };
  }

  const { dailyLimit } = aiInfo();
  if (dailyLimit > 0) {
    const { timezone } = await getProfile();
    const today = toLocalDayKey(new Date(), timezone);
    const used = await tokensSince(zonedLocalToUtc(`${today}T00:00`, timezone));
    if (used.tokens >= dailyLimit) throw new AILimitError(dailyLimit);
  }

  const result = await provider.complete(request);
  const saved = await db.from("ai_cache").upsert(
    {
      cache_key: key,
      task: request.task,
      provider: provider.name,
      model: provider.model,
      prompt_version: request.promptVersion ?? "1",
      response: { text: result.text },
      input_tokens: result.usage?.inputTokens ?? null,
      output_tokens: result.usage?.outputTokens ?? null,
    },
    { onConflict: "user_id,cache_key" },
  );
  if (saved.error) console.error("[ia] no se ha podido guardar en caché:", saved.error.message);
  return result;
}

/**
 * Respuesta JSON validada. Si el formato no es válido no se guarda como
 * buena: se borra de la caché para que el siguiente intento vuelva a pedirla.
 */
export async function runAIJson<T>(request: AICompletionRequest, schema: ZodType<T>, options: RunOptions = {}) {
  const jsonRequest = { ...request, json: true };
  const parse = (text: string) => {
    try {
      return schema.safeParse(extractJson(text));
    } catch {
      return null;
    }
  };
  let result = await runAI(jsonRequest, options);
  let parsed = parse(result.text);
  // Un segundo intento sin caché: a veces la respuesta sale mal una vez (salvo si se ha cortado por largo).
  if (!parsed?.success && !result.truncated) {
    result = await runAI(jsonRequest, { ...options, useCache: false });
    parsed = parse(result.text);
  }
  if (!parsed?.success) {
    const db = await createClient();
    const key = buildCacheKey({
      provider: result.provider,
      model: result.model,
      task: request.task,
      promptVersion: request.promptVersion,
      input: options.cacheInput ?? { system: request.system, messages: request.messages },
    });
    await db.from("ai_cache").update({ response: { invalid: true } }).eq("cache_key", key);
    console.error(`[ia] formato no válido (${request.task}, ${result.provider}/${result.model}):`, result.text.slice(0, 500));
    throw new AIResponseFormatError(
      result.truncated
        ? "La respuesta de la IA se ha cortado por larga. Prueba con menos preguntas o con un tema más concreto."
        : "La IA no ha devuelto el formato esperado. Prueba otra vez.",
      result.text,
    );
  }
  return { data: parsed.data, result };
}

/** Mensaje de error para enseñar al usuario. */
export function aiErrorMessage(error: unknown): string {
  if (error instanceof AIDisabledError) return "La IA está desactivada. Configúrala en Vercel (mira Ajustes).";
  if (error instanceof AILimitError || error instanceof AIRequestError || error instanceof AIResponseFormatError) {
    return error.message;
  }
  console.error(error);
  return "La IA ha fallado. Inténtalo de nuevo.";
}
