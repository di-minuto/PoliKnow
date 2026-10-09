"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Field } from "@/components/ui/field";
import { buttonClass, cardClass, inputClass } from "@/components/ui/styles";
import { importQuestionsAction, type ImportSummary } from "@/server/actions/questions";

/** Importar preguntas: pegar o elegir un JSON, comprobarlo y confirmar. */
export function ImportForm({
  subjects,
  typeLabels,
  defaultSubjectId,
}: {
  subjects: { id: string; label: string }[];
  typeLabels: Record<string, string>;
  defaultSubjectId?: string;
}) {
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? subjects[0]?.id ?? "");
  const [json, setJson] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(commit: boolean) {
    setBusy(true);
    try {
      setSummary(await importQuestionsAction({ subjectId, json, commit }));
    } catch {
      setSummary({ ok: false, error: "Error inesperado. Inténtalo de nuevo." });
    } finally {
      setBusy(false);
    }
  }

  const reset = () => setSummary(null);
  const imported = summary?.ok ? summary.imported : undefined;

  return (
    <div className="flex flex-col gap-4">
      <section className={`${cardClass} flex flex-col gap-4 p-5`}>
        <Field label="Asignatura">
          <select
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              reset();
            }}
            className={inputClass}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Archivo JSON">
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                setJson(await file.text());
                reset();
              }
            }}
            className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-sm file:font-medium`}
          />
        </Field>
        <Field label="…o pega el JSON aquí">
          <textarea
            value={json}
            onChange={(e) => {
              setJson(e.target.value);
              reset();
            }}
            rows={8}
            spellCheck={false}
            className={`${inputClass} font-mono text-sm`}
          />
        </Field>
        <div>
          <button type="button" onClick={() => run(false)} disabled={busy || !json.trim() || !subjectId} className={buttonClass.secondary}>
            {busy && !summary && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Comprobar
          </button>
        </div>
      </section>

      {summary && !summary.ok && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {summary.error}
        </p>
      )}

      {summary?.ok && (
        <section aria-label="Resultado de la comprobación" className={`${cardClass} flex flex-col gap-3 p-5 text-sm`}>
          {imported ? (
            <p className="flex items-center gap-2 font-medium text-success">
              <CheckCircle2 className="size-5" aria-hidden />
              {imported.count === 1 ? "1 pregunta importada." : `${imported.count} preguntas importadas.`}
            </p>
          ) : (
            <p className="font-medium">
              {summary.valid === 1 ? "1 pregunta lista" : `${summary.valid} preguntas listas`} para importar
              {summary.examTitle ? ` como examen oficial «${summary.examTitle}»` : ""}.
            </p>
          )}
          {Object.keys(summary.byType).length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {Object.entries(summary.byType).map(([type, n]) => (
                <li key={type} className="rounded-full bg-primary-soft px-2 py-0.5">
                  {typeLabels[type] ?? type}: {n}
                </li>
              ))}
            </ul>
          )}
          {summary.warnings.map((w) => (
            <p key={w} className="text-muted">
              {w}
            </p>
          ))}
          {summary.errors.length > 0 && (
            <div>
              <p className="font-medium text-danger">
                {summary.errors.length === 1 ? "1 pregunta tiene errores" : `${summary.errors.length} preguntas tienen errores`} y no se
                importará{summary.errors.length === 1 ? "" : "n"}:
              </p>
              <ul className="mt-1 list-disc pl-5 text-danger">
                {summary.errors.slice(0, 30).map((e) => (
                  <li key={e.index}>
                    Pregunta {e.index}: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {imported ? (
            <div className="flex flex-wrap gap-2">
              {imported.examId ? (
                <Link href={`/examenes/${imported.examId}`} className={buttonClass.primary}>
                  Ver el examen
                </Link>
              ) : (
                <Link href={`/preguntas?asignatura=${subjectId}`} className={buttonClass.primary}>
                  Ver las preguntas
                </Link>
              )}
            </div>
          ) : (
            summary.valid > 0 && (
              <div>
                <button type="button" onClick={() => run(true)} disabled={busy} className={buttonClass.primary}>
                  {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  Importar {summary.valid === 1 ? "1 pregunta" : `${summary.valid} preguntas`}
                </button>
              </div>
            )
          )}
        </section>
      )}
    </div>
  );
}
