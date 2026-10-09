"use client";

import { useActionState, useState } from "react";
import { Brain, Loader2, RotateCcw, Zap } from "lucide-react";
import { Field } from "@/components/ui/field";
import { buttonClass, cardClass, inputClass } from "@/components/ui/styles";
import { SOURCE_TYPES, SOURCE_TYPE_LABELS } from "@/domain/questions/types";
import { initialActionState } from "@/lib/action-state";
import { createTestAction } from "@/server/actions/practice";

export type BuilderOptions = {
  subjects: { id: string; label: string }[];
  topics: { id: string; subjectId: string; name: string; depth: number }[];
  assessments: { id: string; subjectId: string; name: string }[];
  questionTypes: { code: string; label: string }[];
};

function ErrorBox({ error }: { error?: string | null }) {
  return error ? (
    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
      {error}
    </p>
  ) : null;
}

/** Modos automáticos: un botón por modo, con la asignatura opcional. */
export function QuickModes({ subjects, defaultSubjectId }: { subjects: BuilderOptions["subjects"]; defaultSubjectId?: string }) {
  const [state, action, pending] = useActionState(createTestAction, initialActionState);
  const modes = [
    { mode: "quick", label: "Test rápido", hint: "10 preguntas de lo que estás estudiando", icon: Zap },
    { mode: "failed_review", label: "Repaso de fallos", hint: "Las que has fallado", icon: RotateCcw },
    { mode: "smart_review", label: "Repaso inteligente", hint: "Lo olvidado y lo que peor llevas", icon: Brain },
  ];
  return (
    <form action={action} className={`${cardClass} flex flex-col gap-4 p-5`}>
      <input type="hidden" name="count" value="10" />
      <Field label="Asignatura">
        <select name="subjectId" defaultValue={defaultSubjectId ?? ""} className={inputClass}>
          <option value="">Todas</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-2 sm:grid-cols-3">
        {modes.map(({ mode, label, hint, icon: Icon }) => (
          <button
            key={mode}
            type="submit"
            name="mode"
            value={mode}
            disabled={pending}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left hover:border-primary disabled:opacity-60 sm:flex-col sm:items-start"
          >
            <Icon className="size-5 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block font-semibold">{label}</span>
              <span className="block text-xs text-muted">{hint}</span>
            </span>
          </button>
        ))}
      </div>
      {pending && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Preparando el test…
        </p>
      )}
      <ErrorBox error={state.error} />
    </form>
  );
}

/** Generador: asignatura, temas o parcial, número, dificultad, tipos y procedencia. */
export function TestBuilder({
  options,
  defaults = {},
}: {
  options: BuilderOptions;
  defaults?: { subjectId?: string; assessmentId?: string; topicId?: string };
}) {
  const [state, action, pending] = useActionState(createTestAction, initialActionState);
  const [subjectId, setSubjectId] = useState(defaults.subjectId ?? options.subjects[0]?.id ?? "");
  const [scope, setScope] = useState<"topics" | "assessment">(defaults.assessmentId ? "assessment" : "topics");
  const [topicIds, setTopicIds] = useState<string[]>(defaults.topicId ? [defaults.topicId] : []);
  const topics = options.topics.filter((t) => t.subjectId === subjectId);
  const assessments = options.assessments.filter((a) => a.subjectId === subjectId);
  const mode = scope === "assessment" ? "assessment" : topicIds.length === 1 ? "topic" : "custom";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="mode" value={mode} />
      <Field label="Asignatura">
        <select
          name="subjectId"
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value);
            setTopicIds([]);
          }}
          className={inputClass}
        >
          {options.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Qué entra</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={scope === "topics"} onChange={() => setScope("topics")} className="size-4" />
            Temas
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={scope === "assessment"} onChange={() => setScope("assessment")} className="size-4" />
            Un parcial
          </label>
        </div>
        {scope === "topics" ? (
          <div key={subjectId} className="flex flex-col gap-1">
            {topics.length === 0 && <p className="text-sm text-muted">Sin temas: entrarán todas las preguntas.</p>}
            {topics.length > 0 && <p className="text-xs text-muted">Sin marcar ninguno, entran todos. Cada tema incluye sus subtemas.</p>}
            {topics.map((t) => (
              <label key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm" style={{ paddingLeft: `${0.5 + t.depth * 1.25}rem` }}>
                <input
                  type="checkbox"
                  name="topic"
                  value={t.id}
                  checked={topicIds.includes(t.id)}
                  onChange={(e) => setTopicIds((ids) => (e.target.checked ? [...ids, t.id] : ids.filter((x) => x !== t.id)))}
                  className="size-4"
                />
                {t.name}
              </label>
            ))}
          </div>
        ) : (
          <select key={subjectId} name="assessmentId" defaultValue={defaults.assessmentId ?? ""} className={inputClass} aria-label="Parcial">
            <option value="" disabled>
              {assessments.length ? "Elige el parcial" : "Esta asignatura no tiene parciales"}
            </option>
            {assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        {scope === "assessment" && <p className="text-xs text-muted">Las preguntas se reparten según el peso de cada tema en el parcial.</p>}
      </fieldset>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Preguntas">
          <input name="count" type="number" min={1} max={100} defaultValue={10} className={inputClass} />
        </Field>
        <Field label="Dificultad mín.">
          <select name="difficultyMin" defaultValue="" className={inputClass}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dificultad máx.">
          <select name="difficultyMax" defaultValue="" className={inputClass}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Tipos y procedencia</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs text-muted">Tipos (sin marcar = todos)</legend>
            {options.questionTypes.map((t) => (
              <label key={t.code} className="flex items-center gap-2">
                <input type="checkbox" name="questionType" value={t.code} className="size-4" />
                {t.label}
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs text-muted">Procedencia (sin marcar = todas)</legend>
            {SOURCE_TYPES.map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input type="checkbox" name="source" value={s} className="size-4" />
                {SOURCE_TYPE_LABELS[s]}
              </label>
            ))}
          </fieldset>
        </div>
      </details>

      <ErrorBox error={state.error} />
      <div>
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Crear test
        </button>
      </div>
    </form>
  );
}

/** Un único botón que crea un test automático (p. ej. «Repasar fallos» desde los resultados). */
export function QuickModeButton({ mode, subjectId, label }: { mode: string; subjectId: string | null; label: string }) {
  const [state, action, pending] = useActionState(createTestAction, initialActionState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="count" value="10" />
      <input type="hidden" name="subjectId" value={subjectId ?? ""} />
      <button type="submit" disabled={pending} className={buttonClass.secondary}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
        {label}
      </button>
      <ErrorBox error={state.error} />
    </form>
  );
}
