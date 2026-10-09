"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { buttonClass } from "@/components/ui/styles";
import { downloadFile, processDocumentText } from "@/lib/documents/browser";
import { createClient } from "@/lib/supabase/client";
import { revalidateLibraryAction } from "@/server/actions/documents";

/** Vuelve a descargar el archivo y a leer su texto (si falló o mejoró el lector). */
export function ReprocessButton({
  documentId,
  storagePath,
  filename,
  mimeType,
}: {
  documentId: string;
  storagePath: string;
  filename: string;
  mimeType: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const data = await downloadFile(supabase, storagePath);
      const result = await processDocumentText(supabase, { id: documentId, filename, mimeType, data });
      setMessage(result.status === "failed" ? `No se pudo leer: ${result.error}` : "Texto actualizado.");
      await revalidateLibraryAction();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={run} disabled={busy} className={buttonClass.secondary}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
        {busy ? "Leyendo…" : "Volver a leer el texto"}
      </button>
      {message && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}
    </div>
  );
}
