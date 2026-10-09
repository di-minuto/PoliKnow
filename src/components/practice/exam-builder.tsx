"use client";

import { useActionState, useState } from "react";
import { Loader2, Timer } from "lucide-react";
import { Field } from "@/components/ui/field";
import { buttonClass, inputClass } from "@/components/ui/styles";
import { PENALTY_OPTIONS } from "@/domain/practice/exam";
import { SOURCE_TYPES, SOURCE_TYPE_LABELS } from "@/domain/questions/types";
import { initialActionState } from "@/lib/action-state";
import { createSimulationAction, startOfficialExamAction } from "@/server/actions/exams-practice";

export type ExamBuilderOptions = {
  subjects: { id: string; label: string }[];
  topics: { id: string; subjectId: string; name: string; depth: number }[];
  assessments: {
    id: string;
    subjectId: string;
    name: string;
    durationMinutes: number | null;
    topics: { topicId: string; weight: number }[];
  }[];
  questionTypes: { code: string; label: string }[];
};

function ErrorBox({ error }: { error?: string | null }) {
  return error ? (
    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
      {error}
    </p>
  ) : null;
}

const LEVELS = [1, 2, 3, 4, 5];

/** Configurador del simulacro: asignatura, parcial o temas con peso, duración, penalización... */
export function ExamBuilder({
  options,
  defaults = {},
}: {
  options: ExamBuilderOptions;
  defaults?: { subjectId?: string; assessmentId?: string };
}) {
  const [state, action, pending] = useActionState(createSimulationAction, initialActionState);
  const initialAssessment = options.assessments.find((a) => a.id === defaults.assessmentId);
  const [subjectId, setSubjectId] = useState(initialAssessment?.subjectId ?? defaults.subjectId ?? options.subjects[0]?.id ?? "");
  const [assessmentId, setAssessmentId] = useState(initialAssessment?.id ?? "");
  const [weights, setWeights] = useState<Record<string, string>>(() =>
    Object.fromEntries((initialAssessment?.topics ?? []).map((t) => [t.topicId, String(t.weight)])),
  );
  const [duration, setDuration] = useState(String(initialAssessment?.durationMinutes ?? 60));

  const topics = options.topics.filter((t) => t.subjectId === subjectId);
  const assessments = options.assessments.filter((a) => a.subjectId === subjectId);
  const checked = Object.keys(weights);

  function chooseAssessment(id: string) {
    setAssessmentId(id);
    const a = options.assessments.find((x) => x.id === id);
    setWeights(a ? Object.fromEntries(a.topics.map((t) => [t.topicId, String(t.weight)])) : {});
    if (a?.durationMinutes) setDuration(String(a.durationMinutes));
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Asignatura">
          <select
            name="subjectId"
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setAssessmentId("");
              setWeights({});
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
        <Field label="Simular el parcial" hint="Copia sus temas, pesos y duración. Puedes cambiarlos.">
          <select name="assessmentId" value={assessmentId} onChange={(e) => chooseAssessment(e.target.value)} className={inputClass}>
            <option value="">Ninguno (elijo los temas)</option>
            {assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">Temas y ponderación</legend>
        {topics.length === 0 ? (
          <p className="text-sm text-muted">Sin temas: entrarán todas las preguntas de la asignatura.</p>
        ) : (
          <p className="mb-1 text-xs text-muted">
            Sin marcar ninguno, entra todo el temario. El peso decide cuántas preguntas salen de cada tema.
          </p>
        )}
        {topics.map((t) => {
          const on = checked.includes(t.id);
          return (
            <div key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-1" style={{ paddingLeft: `${0.5 + t.depth * 1.25}rem` }}>
              <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="topic"
                  value={t.id}
                  checked={on}
                  onChange={(e) =>
                    setWeights((all) => {
                      const next = { ...all };
                      if (e.target.checked) next[t.id] = "1";
                      else delete next[t.id];
                      return next;
                    })
                  }
                  className="size-4 shrink-0"
                />
                <span className="truncate">{t.name}</span>
              </label>
              {on && (
                <input
                  name={`weight:${t.id}`}
                  value={weights[t.id]}
                  onChange={(e) => setWeights((all) => ({ ...all, [t.id]: e.target.value }))}
                  inputMode="decimal"
                  aria-label={`Peso de ${t.name}`}
                  className="w-16 shrink-0 rounded-lg border border-border bg-surface px-2 py-1.5 text-right text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              )}
            </div>
          );
        })}
      </fieldset>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Preguntas">
          <input name="count" type="number" min={1} max={100} defaultValue={20} className={inputClass} />
        </Field>
        <Field label="Duración (min)">
          <input
            name="durationMinutes"
            type="number"
            min={1}
            max={600}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Dificultad mín.">
          <select name="difficultyMin" defaultValue="" className={inputClass}>
            <option value="">—</option>
            {LEVELS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dificultad máx.">
          <select name="difficultyMax" defaultValue="" className={inputClass}>
            <option value="">—</option>
            {LEVELS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <Field label="Penalización por fallo">
          <select name="penalty" defaultValue="0" className={inputClass}>
            {PENALTY_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 py-2.5 text-sm">
          <input type="checkbox" name="allowBack" defaultChecked className="size-4" />
          Permitir volver atrás
        </label>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Tipos de ejercicio y procedencia</summary>
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
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Timer className="size-4" aria-hidden />}
          Empezar simulacro
        </button>
      </div>
    </form>
  );
}

/** Hacer un examen oficial como examen real (en su ficha). */
export function OfficialExamStart({
  examId,
  durationMinutes,
  penalty,
  allowBack,
  questionCount,
}: {
  examId: string;
  durationMinutes: number | null;
  penalty: number;
  allowBack: boolean;
  questionCount: number;
}) {
  const [state, action, pending] = useActionState(startOfficialExamAction, initialActionState);
  const known = PENALTY_OPTIONS.some((p) => p.value === penalty);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="examId" value={examId} />
      <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
        <Field label="Duración (min)" hint="Vacío = sin límite">
          <input name="durationMinutes" type="number" min={1} max={600} defaultValue={durationMinutes ?? ""} className={inputClass} />
        </Field>
        <Field label="Penalización por fallo">
          <select name="penalty" defaultValue={String(penalty)} className={inputClass}>
            {!known && <option value={penalty}>Resta {String(penalty).replace(".", ",")}</option>}
            {PENALTY_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 py-2.5 text-sm">
          <input type="checkbox" name="allowBack" defaultChecked={allowBack} className="size-4" />
          Permitir volver atrás
        </label>
      </div>
      <ErrorBox error={state.error} />
      <div>
        <button type="submit" disabled={pending || questionCount === 0} className={buttonClass.primary}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Timer className="size-4" aria-hidden />}
          Hacer este examen
        </button>
      </div>
    </form>
  );
}
