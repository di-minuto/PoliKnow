import type { AIProvider } from "../provider";
import type { AICompletionRequest, AICompletionResult } from "../types";
import { AIRequestError, postJson, type FetchLike } from "./http";

export const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-5-5";

type MessagesResponse = {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

/** Claude mediante la API de Messages (sin SDK: una sola petición HTTP). */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly enabled = true;

  constructor(
    private readonly apiKey: string,
    readonly model: string = ANTHROPIC_DEFAULT_MODEL,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    const data = (await postJson(
      this.fetcher,
      "Claude",
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      {
        model: this.model,
        max_tokens: request.maxTokens ?? 1500,
        ...(request.system ? { system: request.system } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        messages: request.messages,
      },
    )) as MessagesResponse;
    const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    if (!text) throw new AIRequestError("Claude ha devuelto una respuesta vacía.");
    return {
      text,
      provider: this.name,
      model: this.model,
      usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 },
    };
  }
}
