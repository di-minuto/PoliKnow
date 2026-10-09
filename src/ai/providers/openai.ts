import type { AIProvider } from "../provider";
import type { AICompletionRequest, AICompletionResult } from "../types";
import { AIRequestError, postJson, type FetchLike } from "./http";

export const OPENAI_DEFAULT_MODEL = "gpt-5-mini";
export const OPENAI_BASE_URL = "https://api.openai.com/v1";

type ChatResponse = {
  choices?: { message?: { content?: string | null } }[];
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
    const label = official ? "OpenAI" : "El proveedor de IA";
    const data = (await postJson(
      this.fetcher,
      label,
      `${this.baseUrl}/chat/completions`,
      { authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        // Los modelos nuevos de OpenAI usan max_completion_tokens; los compatibles, max_tokens.
        [official ? "max_completion_tokens" : "max_tokens"]: request.maxTokens ?? 1500,
        ...(!official && request.temperature !== undefined ? { temperature: request.temperature } : {}),
        messages: [...(request.system ? [{ role: "system", content: request.system }] : []), ...request.messages],
      },
    )) as ChatResponse;
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new AIRequestError(`${label} ha devuelto una respuesta vacía.`);
    return {
      text,
      provider: this.name,
      model: this.model,
      usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
    };
  }
}
