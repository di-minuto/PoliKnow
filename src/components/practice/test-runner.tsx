"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Flag, Loader2, X } from "lucide-react";
import { RichText } from "@/components/questions/rich-text";
import { QuestionBodyView } from "@/components/questions/question-body-view";
import { SourceBadge } from "@/components/questions/source-badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { buttonClass, cardClass, inputClass } from "@/components/ui/styles";
import { SELF_GRADE_LABELS, type SelfGrade } from "@/domain/practice/types";
import { bodyKind, optionLetter } from "@/domain/questions/body";
import type { Response } from "@/domain/questions/grading";
import type { Question } from "@/domain/questions/types";
import { answerItemAction, finishAttemptAction, flagItemAction, type AnswerFeedback } from "@/server/actions/practice";
import { EMPTY_DRAFT as EMPTY, toResponse, type Draft } from "./draft";
import type { RunnerItem } from "./types";

function resultOf(f: AnswerFeedback): "correct" | "incorrect" | "partial" | null {
  if (f.needsSelfGrade) return null;
  if (f.grade === "correct") return "correct";
  if (f.grade === "incorrect") return "incorrect";
  return f.selfGrade === "right" ? "correct" : f.selfGrade === "partial" ? "partial" : "incorrect";
}

const RESULT_STYLE = {
  correct: "bg-success-soft text-success",
  incorrect: "bg-danger-soft text-danger",
  partial: "bg-warning-soft text-warning",
};

/** Hacer un test: una pregunta por pantalla, corrección al responder y navegación libre. */
export function TestRunner({ attemptId, items }: { attemptId: string; items: RunnerItem[] }) {
  const [index, setIndexRaw] = useState(() => Math.max(0, items.findIndex((i) => !i.done)));
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [done, setDone] = useState<Record<string, { response: unknown; feedback: AnswerFeedback }>>(() =>
    Object.fromEntries(items.filter((i) => i.done).map((i) => [i.itemId, i.done!])),
  );
  const [flags, setFlags] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((i) => [i.itemId, i.flagged])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef<number | null>(null);

  const item = items[index];
  const q = item.question;
  const kind = bodyKind(q.questionType);
  const draft = drafts[item.itemId] ?? EMPTY;
  const state = done[item.itemId];
  const feedback = state?.feedback;
  const locked = Boolean(feedback && !feedback.needsSelfGrade);
  const answeredCount = Object.values(done).filter((d) => !d.feedback.needsSelfGrade).length;

  // Cronómetro de la pregunta visible (para el tiempo dedicado a cada una).
  useEffect(() => {
    shownAt.current = Date.now();
  }, [index]);

  const setIndex = (next: number | ((i: number) => number)) => {
    setError(null);
    setIndexRaw(next);
  };

  const setDraft = (patch: Partial<Draft>) => setDrafts((all) => ({ ...all, [item.itemId]: { ...draft, ...patch } }));

  async function submit(selfGrade: SelfGrade | null = null) {
    const response = (state?.response as Response | undefined) ?? toResponse(kind, draft);
    if (!response) return setError("Elige o escribe una respuesta.");
    setBusy(true);
    setError(null);
    const result = await answerItemAction({
      itemId: item.itemId,
      response,
      selfGrade,
      timeSpentSeconds: Math.round((Date.now() - (shownAt.current ?? Date.now())) / 1000),
    }).catch(() => ({ ok: false as const, error: "Sin conexión. Inténtalo de nuevo." }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setDone((all) => ({ ...all, [item.itemId]: { response, feedback: result.feedback } }));
  }

  async function toggleFlag() {
    const next = !flags[item.itemId];
    setFlags((all) => ({ ...all, [item.itemId]: next }));
    await flagItemAction(item.itemId, next).catch(() => setFlags((all) => ({ ...all, [item.itemId]: !next })));
  }

  const selected = new Set((state?.response as { selected?: number[] } | undefined)?.selected ?? draft.selected);
  const correctSet = new Set(locked ? ((feedback!.answer as { correct?: number[] })?.correct ?? []) : []);
  const result = feedback ? resultOf(feedback) : null;
  const unanswered = items.length - answeredCount;

  return (
    <div className="flex flex-col gap-4">
      {/* Progreso y saltos */}
      <div>
        <div className="mb-2 flex items-center justify-between text-sm text-muted">
          <span>
            Pregunta {index + 1} de {items.length}
          </span>
          <span>{answeredCount} respondidas</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
          <div className="h-full bg-primary transition-all" style={{ width: `${(answeredCount / items.length) * 100}%` }} />
        </div>
        <nav aria-label="Ir a la pregunta" className="mt-3 flex flex-wrap gap-1.5">
          {items.map((it, i) => {
            const r = done[it.itemId] ? resultOf(done[it.itemId].feedback) : null;
            return (
              <button
                key={it.itemId}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Pregunta ${i + 1}${r ? ` (${r === "correct" ? "acierto" : r === "incorrect" ? "fallo" : "regular"})` : ""}${flags[it.itemId] ? ", marcada" : ""}`}
                aria-current={i === index ? "step" : undefined}
                className={`relative size-8 rounded-md text-xs font-medium ${
                  r ? RESULT_STYLE[r] : "bg-surface"
                } ${i === index ? "ring-2 ring-primary" : "border border-border"}`}
              >
                {i + 1}
                {flags[it.itemId] && <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-amber-500" />}
              </button>
            );
          })}
        </nav>
      </div>

      <section className={`${cardClass} flex flex-col gap-4 p-5`} aria-label={`Pregunta ${index + 1}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <SourceBadge source={q.sourceType} detail={q.sourceDetail} />
          <span>{q.typeLabel}</span>
          {q.topicName && <span>· {q.topicName}</span>}
          <button
            type="button"
            onClick={toggleFlag}
            aria-pressed={flags[item.itemId]}
            className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 ${flags[item.itemId] ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "hover:bg-primary-soft"}`}
          >
            <Flag className="size-3.5" aria-hidden />
            {flags[item.itemId] ? "Marcada" : "Marcar"}
          </button>
        </div>

        <RichText text={q.stem} className="text-lg" />
        {kind === "code" && q.content.code && (
          <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-sm">{q.content.code}</pre>
        )}

        {/* Respuesta */}
        {kind === "choice" && (
          <div role={q.content.multiple ? "group" : "radiogroup"} aria-label="Opciones" className="flex flex-col gap-2">
            {q.content.multiple && <p className="text-xs text-muted">Puede haber varias correctas.</p>}
            {(q.content.options ?? []).map((option, i) => {
              const isSelected = selected.has(i);
              const style = locked
                ? correctSet.has(i)
                  ? "border-success bg-success-soft"
                  : isSelected
                    ? "border-danger bg-danger-soft"
                    : "border-border opacity-70"
                : isSelected
                  ? "border-primary bg-primary-soft"
                  : "border-border";
              return (
                <button
                  key={i}
                  type="button"
                  role={q.content.multiple ? "checkbox" : "radio"}
                  aria-checked={isSelected}
                  disabled={locked || busy}
                  onClick={() =>
                    setDraft({
                      selected: q.content.multiple
                        ? isSelected
                          ? draft.selected.filter((x) => x !== i)
                          : [...draft.selected, i]
                        : [i],
                    })
                  }
                  className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-left ${style}`}
                >
                  <span className="font-semibold text-muted">{optionLetter(i)}</span>
                  <span className="min-w-0 flex-1">{option}</span>
                  {locked && correctSet.has(i) && <Check className="size-5 shrink-0 text-success" aria-label="Correcta" />}
                  {locked && isSelected && !correctSet.has(i) && <X className="size-5 shrink-0 text-danger" aria-label="Tu respuesta" />}
                </button>
              );
            })}
          </div>
        )}

        {kind === "true_false" && (
          <div role="radiogroup" aria-label="Verdadero o falso" className="grid grid-cols-2 gap-2">
            {[true, false].map((value) => {
              const chosen = ((state?.response as { value?: boolean } | undefined)?.value ?? draft.tf) === value;
              const right = locked && (feedback!.answer as { value: boolean }).value === value;
              return (
                <button
                  key={String(value)}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  disabled={locked || busy}
                  onClick={() => setDraft({ tf: value })}
                  className={`rounded-lg border px-3 py-3 font-medium ${
                    locked ? (right ? "border-success bg-success-soft" : chosen ? "border-danger bg-danger-soft" : "border-border") : chosen ? "border-primary bg-primary-soft" : "border-border"
                  }`}
                >
                  {value ? "Verdadero" : "Falso"}
                </button>
              );
            })}
          </div>
        )}

        {(kind === "short_answer" || kind === "numeric") && (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Tu respuesta{kind === "numeric" && q.content.unit ? ` (${q.content.unit})` : ""}
            <input
              value={state ? String((state.response as { value?: string }).value ?? "") : draft.text}
              onChange={(e) => setDraft({ text: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && !locked && submit()}
              inputMode={kind === "numeric" ? "decimal" : undefined}
              disabled={locked || busy}
              autoComplete="off"
              className={inputClass}
            />
          </label>
        )}

        {(kind === "code" || kind === "open") && (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Tu respuesta (opcional; luego te autoevalúas)
            <textarea
              value={state ? String((state.response as { value?: string }).value ?? "") : draft.text}
              onChange={(e) => setDraft({ text: e.target.value })}
              disabled={Boolean(state) || busy}
              rows={kind === "code" ? 8 : 5}
              spellCheck={kind !== "code"}
              className={`${inputClass} ${kind === "code" ? "font-mono text-sm" : ""}`}
            />
          </label>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {/* Corrección */}
        {feedback && (
          <div className="flex flex-col gap-3" role="status">
            {result && (
              <p className={`rounded-lg px-3 py-2 font-semibold ${RESULT_STYLE[result]}`}>
                {result === "correct" ? "¡Correcto!" : result === "incorrect" ? "Incorrecto" : "Regular"}
              </p>
            )}
            {kind !== "choice" && (
              <QuestionBodyView
                question={{ questionType: q.questionType, content: { ...q.content, code: null }, answer: feedback.answer } as unknown as Question}
              />
            )}
            {feedback.needsSelfGrade && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">¿Cómo te ha salido comparado con la solución?</p>
                <div className="grid grid-cols-3 gap-2">
                  {(["wrong", "partial", "right"] as const).map((g) => (
                    <button key={g} type="button" disabled={busy} onClick={() => submit(g)} className={buttonClass.secondary}>
                      {SELF_GRADE_LABELS[g]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {feedback.explanation && (
              <div className="rounded-lg bg-primary-soft/60 p-3 text-sm">
                <p className="mb-1 font-semibold">Explicación</p>
                <RichText text={feedback.explanation} />
              </div>
            )}
          </div>
        )}

        {!feedback && (
          <div>
            <button type="button" onClick={() => submit()} disabled={busy} className={buttonClass.primary}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {kind === "code" || kind === "open" ? "Ver solución" : "Comprobar"}
            </button>
          </div>
        )}
      </section>

      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setIndex((i) => i - 1)} disabled={index === 0} className={buttonClass.secondary}>
          <ChevronLeft className="size-4" aria-hidden />
          Anterior
        </button>
        {index < items.length - 1 ? (
          <button type="button" onClick={() => setIndex((i) => i + 1)} className={locked ? buttonClass.primary : buttonClass.secondary}>
            Siguiente
            <ChevronRight className="size-4" aria-hidden />
          </button>
        ) : (
          <form action={finishAttemptAction}>
            <input type="hidden" name="id" value={attemptId} />
            {unanswered > 0 ? (
              <ConfirmButton
                message={`Te quedan ${unanswered} sin responder. ¿Terminar igualmente?`}
                className={buttonClass.primary}
              >
                Terminar test
              </ConfirmButton>
            ) : (
              <button type="submit" className={buttonClass.primary}>
                Terminar test
              </button>
            )}
          </form>
        )}
      </div>
      {index < items.length - 1 && (
        <form action={finishAttemptAction} className="text-center">
          <input type="hidden" name="id" value={attemptId} />
          <ConfirmButton
            message={unanswered > 0 ? `Te quedan ${unanswered} sin responder. ¿Terminar ya?` : "¿Terminar el test?"}
            className="text-sm text-muted underline"
          >
            Terminar ahora
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
