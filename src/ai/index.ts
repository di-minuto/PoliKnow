import "server-only";
import { getServerEnv, type ServerEnv } from "@/lib/env";
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
export function getAIProvider(env: ServerEnv = getServerEnv()): AIProvider {
  try {
    return resolveAIProvider(env);
  } catch (error) {
    return new DisabledProvider(error instanceof Error ? error.message : undefined);
  }
}
