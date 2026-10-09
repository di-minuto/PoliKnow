"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { buttonClass } from "./styles";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Formulario conectado a una Server Action que devuelve ActionState.
 * Muestra errores y, si se pide, se vacía tras guardar con éxito.
 */
export function ActionForm({
  action,
  children,
  submitLabel = "Guardar",
  resetOnSuccess = false,
  successMessage,
  className = "flex flex-col gap-4",
}: {
  action: FormAction;
  children: ReactNode;
  submitLabel?: string;
  resetOnSuccess?: boolean;
  successMessage?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.ok && successMessage && (
        <p role="status" className="text-sm text-success">
          {successMessage}
        </p>
      )}
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

export function SubmitButton({ children, className = buttonClass.primary }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "Guardando…" : children}
    </button>
  );
}
