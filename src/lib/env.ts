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

/** Variables solo de servidor. Nunca importar desde componentes de cliente. */
export const serverEnvSchema = z.object({
  AI_PROVIDER: z.enum(["none", "anthropic", "openai"]).default("none"),
  AI_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error("Variables de entorno de servidor no válidas.\n" + z.prettifyError(parsed.error));
  }
  return parsed.data;
}
