import { z } from "zod";

/**
 * Variables públicas (llegan al navegador). Se referencian de forma literal
 * para que Next.js pueda incrustarlas en el bundle del cliente.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  // Un error típico es copiar la clave recortada desde el panel ("sb_publishable_abc…").
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1)
    .regex(/^[\x21-\x7e]+$/, "La clave contiene caracteres no válidos (¿se copió recortada con «…»?)."),
});

export type PublicEnv = z.infer<typeof publicSchema>;

export function getPublicEnv(): PublicEnv {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(
      "Faltan variables de entorno de Supabase. Copia .env.example a .env.local y rellénalas.\n" +
        z.prettifyError(parsed.error),
    );
  }
  return parsed.data;
}

/** Nombres que se suelen escribir para cada proveedor (sin mayúsculas ni espacios). */
const PROVIDER_ALIASES: Record<string, string> = {
  claude: "anthropic",
  google: "gemini",
  "google-gemini": "gemini",
  "openai-compatible": "openai",
  chatgpt: "openai",
  no: "none",
  off: "none",
  ninguno: "none",
  false: "none",
};

/** Variables solo de servidor. Nunca importar desde componentes de cliente. */
export const serverEnvSchema = z.object({
  AI_PROVIDER: z
    .preprocess(
      (v) => (typeof v === "string" ? (PROVIDER_ALIASES[v.trim().toLowerCase()] ?? v.trim().toLowerCase()) : v),
      z.enum(["none", "anthropic", "openai", "gemini"], {
        error: "AI_PROVIDER debe ser anthropic, openai o gemini.",
      }),
    )
    .default("none"),
  AI_MODEL: z.string().trim().optional(),
  ANTHROPIC_API_KEY: z.string().trim().optional(),
  OPENAI_API_KEY: z.string().trim().optional(),
  GEMINI_API_KEY: z.string().trim().optional(),
  /** Otra API compatible con OpenAI (Gemini, Groq, OpenRouter, Ollama…). */
  AI_BASE_URL: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.url({ error: "AI_BASE_URL no es una URL válida." }).optional()),
  /** Tope de tokens al día (entrada + salida); 0 = sin tope. */
  AI_DAILY_TOKEN_LIMIT: z.coerce.number({ error: "AI_DAILY_TOKEN_LIMIT debe ser un número." }).int().min(0).default(300_000),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
type ServerKey = keyof ServerEnv;

/**
 * Lee las variables de servidor sin romper nunca la app: una variable mal
 * escrita se ignora (vale su valor por defecto) y queda anotada en issues.
 */
export function readServerEnv(source: Record<string, string | undefined> = process.env): {
  env: ServerEnv;
  issues: { key: ServerKey; message: string }[];
} {
  const shape = serverEnvSchema.shape;
  const env: Record<string, unknown> = {};
  const issues: { key: ServerKey; message: string }[] = [];
  for (const key of Object.keys(shape) as ServerKey[]) {
    // Una variable vacía (AI_MODEL= en .env) cuenta como no puesta.
    const raw = source[key];
    const value = raw === undefined || raw.trim() === "" ? undefined : raw;
    const parsed = shape[key].safeParse(value);
    if (parsed.success) env[key] = parsed.data;
    else {
      issues.push({ key, message: parsed.error.issues[0]?.message ?? `${key} no es válida.` });
      env[key] = shape[key].parse(undefined);
    }
  }
  return { env: env as ServerEnv, issues };
}

export function getServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  return readServerEnv(source).env;
}
