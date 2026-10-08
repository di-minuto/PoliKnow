import { describe, expect, it } from "vitest";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { buildCacheKey, stableStringify } from "./cache-key";
import { AIResponseFormatError, completeJSON, extractJson } from "./json";
import { AIDisabledError, type AIProvider } from "./provider";
import { DisabledProvider } from "./providers/disabled";
import { resolveAIProvider } from "./registry";

function fakeProvider(text: string): AIProvider {
  return {
    name: "fake",
    model: "fake-1",
    enabled: true,
    complete: async () => ({ text, provider: "fake", model: "fake-1" }),
  };
}

describe("configuración de IA", () => {
  it("por defecto la IA está desactivada", () => {
    const provider = resolveAIProvider(getServerEnv({}));
    expect(provider.enabled).toBe(false);
  });

  it("el proveedor desactivado falla de forma controlada", async () => {
    await expect(new DisabledProvider().complete()).rejects.toBeInstanceOf(AIDisabledError);
  });

  it("rechaza proveedores aún no implementados", () => {
    expect(() => resolveAIProvider(getServerEnv({ AI_PROVIDER: "anthropic" }))).toThrow(/no está implementado/);
  });
});

describe("respuestas estructuradas", () => {
  const schema = z.object({ topic: z.string(), confidence: z.number() });
  const request = { task: "classify_topic" as const, messages: [{ role: "user" as const, content: "x" }] };

  it("extrae JSON de un bloque markdown", () => {
    expect(extractJson('Aquí tienes:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it("valida la respuesta con zod", async () => {
    const result = await completeJSON(fakeProvider('{"topic":"OpenMP","confidence":0.9}'), request, schema);
    expect(result).toEqual({ topic: "OpenMP", confidence: 0.9 });
  });

  it("detecta respuestas con formato incorrecto", async () => {
    await expect(completeJSON(fakeProvider('{"topic":3}'), request, schema)).rejects.toBeInstanceOf(
      AIResponseFormatError,
    );
    await expect(completeJSON(fakeProvider("no sé"), request, schema)).rejects.toBeInstanceOf(AIResponseFormatError);
  });
});

describe("clave de caché", () => {
  it("no depende del orden de las claves", () => {
    expect(stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(stableStringify({ a: [2, { c: 4, d: 3 }], b: 1 }));
  });

  it("cambia con el modelo o la versión del prompt", () => {
    const base = { provider: "anthropic", model: "m1", task: "explain_answer", input: { q: 1 } };
    const key = buildCacheKey(base);
    expect(key).toHaveLength(64);
    expect(buildCacheKey({ ...base, model: "m2" })).not.toBe(key);
    expect(buildCacheKey({ ...base, promptVersion: "2" })).not.toBe(key);
    expect(buildCacheKey({ ...base })).toBe(key);
  });
});
