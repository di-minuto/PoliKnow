"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "./styles";

/** Botón de envío que pide confirmación (para borrar). */
export function ConfirmButton({
  message,
  children,
  className = buttonClass.danger,
  title,
}: {
  message: string;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      aria-label={title}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
