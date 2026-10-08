import type { ServerEnv } from "@/lib/env";
import type { AIProvider } from "./provider";
import { DisabledProvider } from "./providers/disabled";

type ProviderFactory = (env: ServerEnv) => AIProvider;

/**
 * Registro de proveedores. Añadir uno nuevo = escribir su clase y registrarla aquí.
 * Los proveedores reales (Claude, OpenAI) se implementan en la Fase 9.
 */
const factories: Partial<Record<ServerEnv["AI_PROVIDER"], ProviderFactory>> = {
  none: () => new DisabledProvider(),
};

export function resolveAIProvider(env: ServerEnv): AIProvider {
  const factory = factories[env.AI_PROVIDER];
  if (!factory) {
    throw new Error(`El proveedor de IA "${env.AI_PROVIDER}" aún no está implementado.`);
  }
  return factory(env);
}
