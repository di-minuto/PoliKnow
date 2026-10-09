"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { RichText } from "@/components/questions/rich-text";
import { buttonClass } from "@/components/ui/styles";
import { explainItemAction, type ExplainResult } from "@/server/actions/ai";

/** «Explícame el fallo»: la IA explica el error con tus apuntes (respuesta guardada en caché). */
export function ExplainButton({ itemId }: { itemId: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExplainResult | null>(null);

  async function run() {
    setBusy(true);
    setResult(await explainItemAction(itemId).catch(() => ({ ok: false as const, error: "La IA ha fallado. Inténtalo de nuevo." })));
    setBusy(false);
  }

  if (result?.ok) {
    return (
      <div className="rounded-lg border border-fuchsia-300 bg-fuchsia-50 p-3 text-sm dark:border-fuchsia-900 dark:bg-fuchsia-950/40" aria-label="Explicación de la IA">
        <p className="mb-1 flex items-center gap-1.5 font-medium">
          <Sparkles className="size-4" aria-hidden /> Por qué has fallado (IA)
        </p>
        <RichText text={result.text} />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={run} disabled={busy} className={buttonClass.secondary}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
        {busy ? "Pensando…" : "Explícame el fallo"}
      </button>
      {result && !result.ok && (
        <p role="alert" className="text-sm text-danger">
          {result.error}
        </p>
      )}
    </div>
  );
}
