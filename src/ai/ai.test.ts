import { describe, expect, it } from "vitest";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { buildCacheKey, stableStringify } from "./cache-key";
import { AIResponseFormatError, completeJSON, extractJson } from "./json";
import { AIDisabledError, type AIProvider } from "./provider";
import { AnthropicProvider } from "./providers/anthropic";
import { DisabledProvider } from "./providers/disabled";
import { AIRequestError } from "./providers/http";
import { OpenAIProvider } from "./providers/openai";
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

  it("exige la clave del proveedor elegido", () => {
    expect(() => resolveAIProvider(getServerEnv({ AI_PROVIDER: "anthropic" }))).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => resolveAIProvider(getServerEnv({ AI_PROVIDER: "openai", OPENAI_API_KEY: "" }))).toThrow(/OPENAI_API_KEY/);
    expect(() =>
      resolveAIProvider(getServerEnv({ AI_PROVIDER: "openai", OPENAI_API_KEY: "k", AI_BASE_URL: "http://localhost:1/v1" })),
    ).toThrow(/AI_MODEL/);
  });

  it("una variable vacía cuenta como no puesta", () => {
    const env = getServerEnv({ AI_BASE_URL: "", AI_MODEL: " " });
    expect(env.AI_BASE_URL).toBeUndefined();
    expect(env.AI_MODEL).toBeUndefined();
  });
});

describe("proveedores", () => {
  const request = { task: "explain_answer" as const, system: "sé breve", messages: [{ role: "user" as const, content: "hola" }] };
  function recorder(status: number, body: unknown) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    };
    return { calls, fetcher };
  }

  it("Claude: API de Messages con system aparte", async () => {
    const { calls, fetcher } = recorder(200, { content: [{ type: "text", text: "¡Hola!" }], usage: { input_tokens: 5, output_tokens: 2 } });
    const result = await new AnthropicProvider("clave", "modelo-x", fetcher).complete(request);
    expect(result).toMatchObject({ text: "¡Hola!", provider: "anthropic", model: "modelo-x", usage: { inputTokens: 5, outputTokens: 2 } });
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect((calls[0].init.headers as Record<string, string>)["x-api-key"]).toBe("clave");
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ model: "modelo-x", system: "sé breve", messages: request.messages });
  });

  it("OpenAI compatible: URL base propia y system como primer mensaje", async () => {
    const { calls, fetcher } = recorder(200, { choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 3, completion_tokens: 1 } });
    const provider = new OpenAIProvider("k", "gemini-x", "https://ejemplo.dev/v1/", fetcher);
    const result = await provider.complete(request);
    expect(provider.name).toBe("openai-compatible");
    expect(result.text).toBe("ok");
    expect(calls[0].url).toBe("https://ejemplo.dev/v1/chat/completions");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.messages[0]).toEqual({ role: "system", content: "sé breve" });
    expect(body.max_tokens).toBe(1500);
  });

  it("los errores HTTP se traducen sin filtrar la clave", async () => {
    const { fetcher } = recorder(401, { error: "bad key secreta" });
    const error = await new AnthropicProvider("secreta", undefined, fetcher).complete(request).catch((e) => e);
    expect(error).toBeInstanceOf(AIRequestError);
    expect(error.message).toMatch(/clave de API/);
    expect(error.message).not.toContain("secreta");
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
