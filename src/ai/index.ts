import "server-only";
import { readServerEnv, type ServerEnv } from "@/lib/env";
import type { AIProvider } from "./provider";
import { DisabledProvider } from "./providers/disabled";
import { resolveAIProvider } from "./registry";

export type { AIProvider } from "./provider";
export { AIDisabledError } from "./provider";
export { completeJSON } from "./json";

/**
 * Proveedor de IA configurado por variables de entorno. Solo en servidor.
 * Si la configuración no es válida, devuelve el proveedor desactivado:
 * la app sigue funcionando sin IA.
 */
export function getAIProvider(env?: ServerEnv): AIProvider {
  try {
    if (!env) {
      const read = readServerEnv();
      // Proveedor o URL mal escritos: mejor sin IA que llamar a donde no es.
      const blocking = read.issues.filter((i) => i.key === "AI_PROVIDER" || i.key === "AI_BASE_URL");
      if (blocking.length) return new DisabledProvider(blocking.map((i) => i.message).join(" "));
      env = read.env;
    }
    return resolveAIProvider(env);
  } catch (error) {
    return new DisabledProvider(error instanceof Error ? error.message : undefined);
  }
}
