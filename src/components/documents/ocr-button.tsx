"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, ScanText } from "lucide-react";
import { buttonClass } from "@/components/ui/styles";
import { downloadFile, ocrDocumentText } from "@/lib/documents/browser";
import { OCR_MAX_PAGES, type OcrProgress } from "@/lib/documents/ocr";
import { createClient } from "@/lib/supabase/client";
import { revalidateLibraryAction } from "@/server/actions/documents";

/** OCR en tu dispositivo para escaneos e imágenes (gratis; tarda unos segundos por página). */
export function OcrButton({
  documentId,
  storagePath,
  filename,
  mimeType,
  pdf,
}: {
  documentId: string;
  storagePath: string;
  filename: string;
  mimeType: string | null;
  pdf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    setProgress(null);
    try {
      const supabase = createClient();
      const data = await downloadFile(supabase, storagePath);
      const result = await ocrDocumentText(supabase, { id: documentId, filename, mimeType, data }, setProgress);
      setMessage(
        result.status === "failed"
          ? `No se pudo reconocer: ${result.error}`
          : result.chunkCount === 0
            ? "El OCR no ha encontrado texto legible."
            : "Texto reconocido.",
      );
      await revalidateLibraryAction();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={run} disabled={busy} className={buttonClass.secondary}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ScanText className="size-4" aria-hidden />}
          {busy ? "Reconociendo…" : "Reconocer texto (OCR)"}
        </button>
        {busy && progress && (
          <span role="status" className="text-sm text-muted">
            {progress.pages > 1 ? `Página ${progress.page} de ${progress.pages} · ` : ""}
            {Math.round(progress.fraction * 100)}%
          </span>
        )}
        {!busy && message && (
          <p role="status" className="text-sm text-muted">
            {message}
          </p>
        )}
      </div>
      <p className="text-xs text-muted">
        Se hace en tu dispositivo, gratis y sin IA{pdf ? ` (hasta ${OCR_MAX_PAGES} páginas)` : ""}. Funciona mejor con escaneos nítidos.
      </p>
    </div>
  );
}
