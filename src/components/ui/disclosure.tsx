"use client";

import { useState, type ReactNode } from "react";
import { cardClass } from "./styles";

/**
 * Bloque plegable para formularios secundarios. `defaultOpen` solo se usa al
 * montar: si después cambian los datos (p. ej. ya hay un tema), no se cierra
 * en mitad de lo que estás haciendo.
 */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className={`${cardClass} group`} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer list-none px-4 py-3 font-medium marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="mr-2 inline-block text-primary transition-transform group-open:rotate-90">›</span>
        {summary}
      </summary>
      <div className="border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}
