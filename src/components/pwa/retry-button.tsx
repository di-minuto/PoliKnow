"use client";

import { buttonClass } from "@/components/ui/styles";

export function RetryButton() {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => window.location.reload()} className={buttonClass.primary}>
        Reintentar
      </button>
      <button type="button" onClick={() => window.history.back()} className={buttonClass.secondary}>
        Volver
      </button>
    </div>
  );
}
