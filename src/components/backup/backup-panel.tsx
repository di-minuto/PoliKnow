"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Download, FileArchive, Loader2, Upload } from "lucide-react";
import { buttonClass, cardClass, inputClass } from "@/components/ui/styles";
import { exportBackup, importBackup, readBackupFile, type BackupProgress, type LoadedBackup } from "@/lib/backup/browser";
import { createClient } from "@/lib/supabase/client";
import { revalidateAfterImportAction } from "@/server/actions/backup";

/** Nombres legibles de lo que se resume (el resto de tablas va igualmente en la copia). */
const LABELS: Record<string, [string, string]> = {
  courses: ["curso", "cursos"],
  subjects: ["asignatura", "asignaturas"],
  topics: ["tema", "temas"],
  assessments: ["evaluación", "evaluaciones"],
  documents: ["documento", "documentos"],
  official_exams: ["examen oficial", "exámenes oficiales"],
  questions: ["pregunta", "preguntas"],
  attempts: ["test o simulacro", "tests y simulacros"],
  plan_tasks: ["tarea del plan", "tareas del plan"],
  study_sessions: ["sesión de estudio", "sesiones de estudio"],
  assistant_conversations: ["conversación", "conversaciones"],
};

const plural = (n: number, [one, many]: [string, string]) => `${n.toLocaleString("es-ES")} ${n === 1 ? one : many}`;

function summary(counts: Record<string, number>): string {
  const parts = Object.entries(LABELS)
    .filter(([t]) => (counts[t] ?? 0) > 0)
    .map(([t, label]) => plural(counts[t], label));
  return parts.length ? parts.join(", ") : "sin datos";
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Error inesperado.");

function Progress({ progress }: { progress: BackupProgress | null }) {
  if (!progress) return null;
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {progress.step}
      {progress.total > 0 && ` · ${Math.round((progress.done / progress.total) * 100)}%`}
    </p>
  );
}

export function BackupPanel({ filesSize }: { filesSize: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedBackup | null>(null);
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Si se elige el archivo antes de que la página esté lista, se lee al terminar de cargar.
  useEffect(() => {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    const timer = setTimeout(() => choose(file), 0);
    return () => clearTimeout(timer);
  }, []);

  async function runExport(files: boolean) {
    setBusy("export");
    setExportMessage(null);
    try {
      const result = await exportBackup(createClient(), { files }, setProgress);
      save(result.blob, result.filename);
      setExportMessage(
        `Copia descargada (${result.filename}): ${summary(result.counts)}.` +
          (result.missingFiles ? ` No se han podido incluir ${result.missingFiles} archivos.` : ""),
      );
    } catch (error) {
      setExportMessage(`No se ha podido exportar: ${errorText(error)}`);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function choose(file: File | undefined) {
    setLoaded(null);
    setImportMessage(null);
    if (!file) return;
    try {
      setLoaded(await readBackupFile(file));
    } catch (error) {
      setImportMessage({ ok: false, text: errorText(error) });
    }
  }

  async function runImport() {
    if (!loaded) return;
    setBusy("import");
    setImportMessage(null);
    try {
      const result = await importBackup(createClient(), loaded, setProgress);
      const notes = [
        result.skipped.reusedDocuments &&
          `${plural(result.skipped.reusedDocuments, ["documento", "documentos"])} ya ${result.skipped.reusedDocuments === 1 ? "lo tenías" : "los tenías"} y no se han duplicado`,
        result.skipped.documentsWithoutFile &&
          `${plural(result.skipped.documentsWithoutFile, ["documento", "documentos"])} sin su archivo no se han importado`,
      ].filter(Boolean);
      setImportMessage({ ok: true, text: `Importado: ${summary(result.counts)}.${notes.length ? ` (${notes.join("; ")}.)` : ""}` });
      setLoaded(null);
      await revalidateAfterImportAction();
      router.refresh();
    } catch (error) {
      setImportMessage({ ok: false, text: `No se ha importado nada: ${errorText(error)}` });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  const backupCounts = loaded ? Object.fromEntries(Object.entries(loaded.backup.tables).map(([t, rows]) => [t, rows.length])) : null;
  const docsInBackup = loaded?.backup.tables.documents?.length ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="exportar">
        <h2 id="exportar" className="mb-1 text-lg font-semibold">
          Exportar
        </h2>
        <p className="mb-3 text-sm text-muted">
          Incluye ajustes, asignaturas, temas, evaluaciones, preguntas, resultados, repaso, planificación y conversaciones.
          El JSON es pequeño y legible; el ZIP añade los archivos de la biblioteca{filesSize ? ` (unos ${filesSize})` : ""}.
        </p>
        <div className={`${cardClass} flex flex-col gap-3 p-4`}>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => runExport(false)} disabled={busy !== null} className={buttonClass.primary}>
              <Download className="size-4" aria-hidden />
              Descargar datos (JSON)
            </button>
            <button type="button" onClick={() => runExport(true)} disabled={busy !== null} className={buttonClass.secondary}>
              <FileArchive className="size-4" aria-hidden />
              Datos y archivos (ZIP)
            </button>
          </div>
          {busy === "export" && <Progress progress={progress} />}
          {exportMessage && <p role="status" className="text-sm">{exportMessage}</p>}
        </div>
      </section>

      <section aria-labelledby="importar">
        <h2 id="importar" className="mb-1 text-lg font-semibold">
          Importar
        </h2>
        <p className="mb-3 text-sm text-muted">
          Añade a tu cuenta lo que haya en una copia (sirve también para pasarlo a otra cuenta). No borra ni modifica nada de lo que
          ya tienes: importar dos veces la misma copia duplica asignaturas y preguntas. Para recuperar la biblioteca usa la copia ZIP;
          los documentos que ya tengas no se duplican.
        </p>
        <div className={`${cardClass} flex flex-col gap-3 p-4`}>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Archivo de copia (.json o .zip)
            <input
              ref={fileInput}
              type="file"
              accept=".json,.zip,application/json,application/zip"
              disabled={busy !== null}
              onChange={(e) => choose(e.target.files?.[0])}
              className={inputClass}
            />
          </label>
          {loaded && backupCounts && (
            <div className="flex flex-col gap-3 rounded-lg bg-primary-soft p-3 text-sm" aria-label="Contenido de la copia">
              <p>
                Copia del {new Date(loaded.backup.exportedAt).toLocaleString("es-ES")}
                {loaded.backup.account && ` (${loaded.backup.account})`}: {summary(backupCounts)}.
              </p>
              {docsInBackup > 0 && loaded.files.size < docsInBackup && (
                <p className="text-muted">
                  {loaded.files.size === 0 ? "No incluye archivos" : `Incluye ${loaded.files.size} de ${docsInBackup} archivos`}: los
                  documentos que falten y no tengas ya se omitirán, y sus preguntas quedarán sin documento de origen.
                </p>
              )}
              <button type="button" onClick={runImport} disabled={busy !== null} className={`${buttonClass.primary} self-start`}>
                <Upload className="size-4" aria-hidden />
                Importar copia
              </button>
            </div>
          )}
          {busy === "import" && <Progress progress={progress} />}
          {importMessage && (
            <p role="status" className={`text-sm ${importMessage.ok ? "" : "text-danger"}`}>
              {importMessage.text}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
