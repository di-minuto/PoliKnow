import type { AICompletionRequest, AICompletionResult } from "./types";

/**
 * Contrato común para cualquier proveedor de IA (Claude, OpenAI, local...).
 * La app solo depende de esta interfaz, nunca de un SDK concreto.
 */
export interface AIProvider {
  readonly name: string;
  readonly model: string;
  /** false cuando la IA está desactivada: la UI oculta las funciones de IA. */
  readonly enabled: boolean;
  complete(request: AICompletionRequest): Promise<AICompletionResult>;
  /** Embeddings para búsqueda semántica (opcional: no todos los proveedores los ofrecen). */
  embed?(texts: string[]): Promise<number[][]>;
}

export class AIDisabledError extends Error {
  constructor(reason = "La IA está desactivada.") {
    super(reason);
    this.name = "AIDisabledError";
  }
}
