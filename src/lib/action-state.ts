/** Resultado de una Server Action de formulario. */
export type ActionState = {
  ok?: boolean;
  error?: string;
  /** Cambia en cada éxito para que el formulario pueda reiniciarse. */
  at?: number;
};

export const initialActionState: ActionState = {};

export const success = (): ActionState => ({ ok: true, at: Date.now() });
export const failure = (error: string): ActionState => ({ ok: false, error, at: Date.now() });
