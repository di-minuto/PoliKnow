import type { ServerEnv } from "@/lib/env";
import type { AIProvider } from "./provider";
import { AnthropicProvider } from "./providers/anthropic";
import { DisabledProvider } from "./providers/disabled";
import { OpenAIProvider } from "./providers/openai";

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
/** Estable y con capa gratuita (gemini-2.5-flash ya no está disponible). */
export const GEMINI_MODEL = "gemini-3.5-flash";

type ProviderFactory = (env: ServerEnv) => AIProvider;

/** Registro de proveedores. Añadir uno nuevo = escribir su clase y registrarla aquí. */
const factories: Partial<Record<ServerEnv["AI_PROVIDER"], ProviderFactory>> = {
  none: () => new DisabledProvider(),
  anthropic: (env) => {
    if (!env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY.");
    return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.AI_MODEL);
  },
  openai: (env) => {
    if (!env.OPENAI_API_KEY) throw new Error("Falta OPENAI_API_KEY.");
    if (env.AI_BASE_URL && !env.AI_MODEL) throw new Error("Con AI_BASE_URL hay que indicar AI_MODEL.");
    return new OpenAIProvider(env.OPENAI_API_KEY, env.AI_MODEL, env.AI_BASE_URL);
  },
  // Gemini por su API compatible con OpenAI (tiene capa gratuita).
  gemini: (env) => {
    const key = env.GEMINI_API_KEY ?? env.OPENAI_API_KEY;
    if (!key) throw new Error("Falta GEMINI_API_KEY (la clave de Google AI Studio).");
    return new OpenAIProvider(key, env.AI_MODEL ?? GEMINI_MODEL, env.AI_BASE_URL ?? GEMINI_BASE_URL);
  },
};

export function resolveAIProvider(env: ServerEnv): AIProvider {
  const factory = factories[env.AI_PROVIDER];
  if (!factory) {
    throw new Error(`El proveedor de IA "${env.AI_PROVIDER}" aún no está implementado.`);
  }
  return factory(env);
}
