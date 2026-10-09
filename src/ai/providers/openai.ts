import type { AIProvider } from "../provider";
import type { AICompletionRequest, AICompletionResult } from "../types";
import { AIRequestError, postJson, type FetchLike } from "./http";

export const OPENAI_DEFAULT_MODEL = "gpt-5-mini";
export const OPENAI_BASE_URL = "https://api.openai.com/v1";

/** Tokens extra para el razonamiento de Gemini (cuenta dentro de max_tokens). */
const GEMINI_THINKING_HEADROOM = 4096;

type ChatResponse = {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/**
 * API de Chat Completions de OpenAI o de cualquier servicio compatible
 * (Gemini, Groq, OpenRouter, Ollama…) cambiando la URL base.
 */
export class OpenAIProvider implements AIProvider {
  readonly name: string;
  readonly enabled = true;
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    readonly model: string = OPENAI_DEFAULT_MODEL,
    baseUrl: string = OPENAI_BASE_URL,
    private readonly fetcher: FetchLike = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.name =
      this.baseUrl === OPENAI_BASE_URL ? "openai" : this.baseUrl.includes("generativelanguage.googleapis.com") ? "gemini" : "openai-compatible";
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    const official = this.name === "openai";
    const gemini = this.name === "gemini";
    const label = official ? "OpenAI" : gemini ? "Gemini" : "El proveedor de IA";
    const maxTokens = request.maxTokens ?? 1500;
    const data = (await postJson(
      this.fetcher,
      label,
      `${this.baseUrl}/chat/completions`,
      { authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        // Los modelos nuevos de OpenAI usan max_completion_tokens; los compatibles, max_tokens.
        // En Gemini el «pensamiento» gasta del mismo máximo: se limita y se deja margen para que no corte la respuesta.
        [official ? "max_completion_tokens" : "max_tokens"]: gemini ? maxTokens + GEMINI_THINKING_HEADROOM : maxTokens,
        ...(gemini ? { reasoning_effort: "low" } : {}),
        ...(!official && request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.json && (official || gemini) ? { response_format: { type: "json_object" } } : {}),
        messages: [...(request.system ? [{ role: "system", content: request.system }] : []), ...request.messages],
      },
    )) as ChatResponse;
    const choice = data.choices?.[0];
    const text = choice?.message?.content ?? "";
    const truncated = choice?.finish_reason === "length";
    if (!text) {
      throw new AIRequestError(
        truncated ? `${label} se ha quedado sin espacio antes de responder. Prueba con menos contenido.` : `${label} ha devuelto una respuesta vacía.`,
      );
    }
    return {
      text,
      provider: this.name,
      model: this.model,
      usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
      ...(truncated ? { truncated } : {}),
    };
  }
}
