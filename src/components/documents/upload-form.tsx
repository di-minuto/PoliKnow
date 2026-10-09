"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CheckCircle2, CircleAlert, FileUp, Loader2 } from "lucide-react";
import { Field } from "@/components/ui/field";
import { buttonClass, cardClass, inputClass } from "@/components/ui/styles";
import { readDocumentForm } from "@/domain/documents/schemas";
import { MAX_UPLOAD_BYTES } from "@/domain/documents/types";
import { detectFormat, normalizedMimeType, titleFromFilename } from "@/documents/format";
import { processDocumentText, sha256Hex, uploadFile } from "@/lib/documents/browser";
import { createClient } from "@/lib/supabase/client";
import { abortUploadAction, prepareUploadAction, revalidateLibraryAction } from "@/server/actions/documents";
import { DocumentFields } from "./document-fields";
import type { LibraryOptions } from "./options";

const ACCEPT = ".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp";

type Step = "waiting" | "hashing" | "uploading" | "reading" | "done" | "duplicate" | "error";
type Item = { name: string; step: Step; message?: string; documentId?: string };

const STEP_LABELS: Record<Step, string> = {
  waiting: "En cola",
  hashing: "Comprobando…",
  uploading: "Subiendo…",
  reading: "Leyendo el texto…",
  done: "Listo",
  duplicate: "Ya estaba",
  error: "Error",
};

/**
 * Subida de uno o varios archivos con los mismos datos. Cada archivo:
 * huella → registro en la BD → subida a Storage → lectura del texto.
 */
export function UploadForm({ options, defaultSubjectId }: { options: LibraryOptions; defaultSubjectId?: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const update = (index: number, patch: Partial<Item>) =>
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (files.length === 0) return setFormError("Elige al menos un archivo.");
    const unsupported = files.find((f) => detectFormat(f.name, f.type) === "unsupported");
    if (unsupported) return setFormError(`Formato no admitido: ${unsupported.name}`);
    const tooBig = files.find((f) => f.size > MAX_UPLOAD_BYTES);
    if (tooBig) return setFormError(`${tooBig.name} supera los ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);

    const fields = readDocumentForm(new FormData(event.currentTarget));
    const supabase = createClient();
    setBusy(true);
    setItems(files.map((f) => ({ name: f.name, step: "waiting" })));

    for (const [index, file] of files.entries()) {
      try {
        update(index, { step: "hashing" });
        const data = await file.arrayBuffer();
        const mimeType = normalizedMimeType(file.name, file.type);
        const prepared = await prepareUploadAction({
          ...fields,
          title: files.length === 1 && fields.title ? fields.title : titleFromFilename(file.name),
          originalFilename: file.name,
          mimeType,
          sizeBytes: file.size,
          sha256: await sha256Hex(data),
        });
        if (!prepared.ok) {
          update(index, {
            step: prepared.duplicateOf ? "duplicate" : "error",
            message: prepared.error,
            documentId: prepared.duplicateOf?.id,
          });
          continue;
        }

        update(index, { step: "uploading", documentId: prepared.documentId });
        try {
          await uploadFile(supabase, prepared.storagePath, data, mimeType);
        } catch (error) {
          await abortUploadAction(prepared.documentId).catch(() => {});
          update(index, { documentId: undefined });
          throw error;
        }

        if (!prepared.extract) {
          update(index, { step: "done", message: "Imagen guardada (sin texto hasta el OCR)." });
          continue;
        }
        update(index, { step: "reading" });
        const result = await processDocumentText(supabase, {
          id: prepared.documentId,
          filename: file.name,
          mimeType,
          data,
        });
        update(index, {
          step: result.status === "failed" ? "error" : "done",
          message:
            result.status === "failed"
              ? `Subido, pero no se pudo leer: ${result.error}`
              : result.chunkCount === 0
                ? "Subido. No tiene texto seleccionable (¿escaneado?)."
                : `${result.chunkCount} ${result.chunkCount === 1 ? "fragmento" : "fragmentos"} de texto.`,
        });
      } catch (error) {
        update(index, { step: "error", message: error instanceof Error ? error.message : "Error inesperado." });
      }
    }

    await revalidateLibraryAction();
    router.refresh();
    setBusy(false);
    setFiles([]);
    const input = formRef.current?.querySelector<HTMLInputElement>('input[type="file"]');
    if (input) input.value = "";
  }

  if (options.subjects.length === 0) {
    return (
      <p className={`${cardClass} p-5 text-muted`}>
        Primero crea una asignatura en{" "}
        <Link href="/asignaturas" className="text-primary underline">
          Asignaturas
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form ref={formRef} onSubmit={handleSubmit} className={`${cardClass} flex flex-col gap-4 p-5`}>
        <Field label="Archivos" hint="PDF, DOCX, PPTX, TXT, Markdown o imágenes. Máximo 50 MB cada uno.">
          <input
            type="file"
            name="files"
            multiple
            accept={ACCEPT}
            disabled={busy}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-sm file:font-medium`}
          />
        </Field>
        {files.length === 1 && (
          <Field label="Título">
            <input
              key={files[0].name}
              name="title"
              required
              maxLength={200}
              defaultValue={titleFromFilename(files[0].name)}
              className={inputClass}
            />
          </Field>
        )}
        <DocumentFields options={options} values={{ subjectId: defaultSubjectId }} showTitle={false} />
        {files.length > 1 && (
          <p className="text-sm text-muted">Se subirán {files.length} archivos con estos datos; el título de cada uno será su nombre.</p>
        )}
        {formError && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        )}
        <div>
          <button type="submit" disabled={busy} className={buttonClass.primary}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileUp className="size-4" aria-hidden />}
            {busy ? "Subiendo…" : "Subir"}
          </button>
        </div>
      </form>

      {items.length > 0 && (
        <section aria-label="Progreso de la subida" className={`${cardClass} divide-y divide-border`}>
          {items.map((item, i) => (
            <div key={`${item.name}-${i}`} className="flex items-start gap-3 px-4 py-3 text-sm">
              {item.step === "done" ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              ) : item.step === "error" || item.step === "duplicate" ? (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              ) : (
                <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.name}</p>
                <p className="text-muted">
                  {STEP_LABELS[item.step]}
                  {item.message && ` · ${item.message}`}
                </p>
              </div>
              {item.documentId && (item.step === "done" || item.step === "duplicate" || item.step === "error") && (
                <Link href={`/biblioteca/${item.documentId}`} className="shrink-0 text-primary underline">
                  Ver
                </Link>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
