import { AIDisabledError, type AIProvider } from "../provider";

/** Proveedor nulo: la app funciona igual, solo sin funciones de IA. */
export class DisabledProvider implements AIProvider {
  readonly name = "none";
  readonly model = "none";
  readonly enabled = false;

  constructor(readonly reason?: string) {}

  async complete(): Promise<never> {
    throw new AIDisabledError(this.reason);
  }
}
