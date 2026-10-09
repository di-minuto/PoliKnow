"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Flag, Loader2 } from "lucide-react";
import { useWakeLock } from "@/components/pwa/use-wake-lock";
import { RichText } from "@/components/questions/rich-text";
import { SourceBadge } from "@/components/questions/source-badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { buttonClass, cardClass, inputClass } from "@/components/ui/styles";
import { formatClock } from "@/domain/practice/exam";
import { bodyKind, optionLetter } from "@/domain/questions/body";
import { finishAttemptAction, flagItemAction } from "@/server/actions/practice";
import { saveExamAnswerAction } from "@/server/actions/exams-practice";
import { fromResponse, toResponse, type Draft } from "./draft";
import { readPending, writePending, type PendingAnswer } from "./offline-answers";
import type { ExamItem } from "./types";

const fmtPoints = (n: number) => String(n).replace(".", ",");
const secondsSince = (start: number | null) => (start === null ? null : Math.round((Date.now() - start) / 1000));

/** Simulacro: cronómetro, sin soluciones, respuestas modificables hasta entregar. */
export function ExamRunner({
  attemptId,
  items,
  startedAt,
  timeLimitSeconds,
  allowBack,
  penalty,
}: {
  attemptId: string;
  items: ExamItem[];
  startedAt: string;
  timeLimitSeconds: number | null;
  allowBack: boolean;
  penalty: number;
}) {
  const [index, setIndex] = useState(() => {
    if (allowBack) return 0;
    // Sin volver atrás: se sigue desde la última respondida.
    const last = items.reduce((max, it, i) => (it.response != null ? i : max), -1);
    return Math.min(items.length - 1, last + 1);
  });
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(items.map((i) => [i.itemId, fromResponse(i.response)])),
  );
  const [answered, setAnswered] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.itemId, i.response != null])),
  );
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((i) => [i.itemId, i.flagged])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Respuestas guardadas solo en el dispositivo (sin conexión), pendientes de enviar.
  const [pending, setPending] = useState<Record<string, PendingAnswer>>({});
  const [now, setNow] = useState<number | null>(null);
  const shownAt = useRef<number | null>(null);
  const finishForm = useRef<HTMLFormElement>(null);
  const autoSubmitted = useRef(false);
  useWakeLock(true);

  const item = items[index];
  const q = item.question;
  const kind = bodyKind(q.questionType);
  const draft = drafts[item.itemId];

  const deadline = timeLimitSeconds ? new Date(startedAt).getTime() + timeLimitSeconds * 1000 : null;
  const remaining = deadline && now !== null ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;

  // Reloj: el servidor fija el inicio; aquí solo se cuenta.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [index]);

  /** Envía lo que quedó guardado en el dispositivo. true si ya no queda nada pendiente. */
  async function flushPending(): Promise<boolean> {
    const queued = readPending(attemptId);
    for (const [itemId, answer] of Object.entries(queued)) {
      let result: { ok: true } | { ok: false; error: string } | null;
      try {
        result = await saveExamAnswerAction({ itemId, ...answer });
      } catch {
        result = null; // sigue sin red
      }
      if (result === null) break;
      if (!result.ok) setError(result.error);
      delete queued[itemId];
      writePending(attemptId, queued);
    }
    setPending({ ...queued });
    return Object.keys(queued).length === 0;
  }

  // Al abrir (p. ej. tras recargar sin red) se recuperan las respuestas del
  // dispositivo; al volver la conexión se envían.
  useEffect(() => {
    const restore = setTimeout(() => {
      const queued = readPending(attemptId);
      if (Object.keys(queued).length === 0) return;
      setPending(queued);
      setDrafts((all) => ({ ...all, ...Object.fromEntries(Object.entries(queued).map(([id, a]) => [id, fromResponse(a.response)])) }));
      setAnswered((all) => ({ ...all, ...Object.fromEntries(Object.keys(queued).map((id) => [id, true])) }));
      if (navigator.onLine) void flushPending();
    }, 0);
    const online = () => void flushPending();
    window.addEventListener("online", online);
    return () => {
      clearTimeout(restore);
      window.removeEventListener("online", online);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [attemptId]);

  // Se acaba el tiempo: se entrega solo.
  useEffect(() => {
    if (remaining === 0 && !autoSubmitted.current) {
      autoSubmitted.current = true;
      finishForm.current?.requestSubmit();
    }
  }, [remaining]);

  const answeredCount = Object.values(answered).filter(Boolean).length;
  const flaggedCount = Object.values(flags).filter(Boolean).length;
  const unanswered = items.length - answeredCount;

  function setDraft(patch: Partial<Draft>) {
    setDrafts((all) => ({ ...all, [item.itemId]: { ...all[item.itemId], ...patch } }));
    setDirty((all) => ({ ...all, [item.itemId]: true }));
  }

  /** Guarda la pregunta visible si ha cambiado. false si no se ha podido. */
  async function saveCurrent(): Promise<boolean> {
    if (!dirty[item.itemId]) return true;
    const response = toResponse(kind, draft);
    const answer = { response, timeSpentSeconds: secondsSince(shownAt.current) };
    const filled = response !== null && !(response.kind === "text" && response.value.trim() === "");
    setSaving(true);
    const result = navigator.onLine ? await saveExamAnswerAction({ itemId: item.itemId, ...answer }).catch(() => null) : null;
    setSaving(false);
    if (result === null) {
      // Sin red: se queda en el dispositivo y se envía al volver la conexión.
      const queued = { ...readPending(attemptId), [item.itemId]: answer };
      writePending(attemptId, queued);
      setPending(queued);
      setAnswered((all) => ({ ...all, [item.itemId]: filled }));
      setDirty((all) => ({ ...all, [item.itemId]: false }));
      return true;
    }
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setAnswered((all) => ({ ...all, [item.itemId]: filled }));
    setDirty((all) => ({ ...all, [item.itemId]: false }));
    return true;
  }

  async function go(next: number) {
    if (next < 0 || next >= items.length || next === index) return;
    if (!(await saveCurrent())) return;
    setError(null);
    setIndex(next);
  }

  async function toggleFlag() {
    const next = !flags[item.itemId];
    setFlags((all) => ({ ...all, [item.itemId]: next }));
    await flagItemAction(item.itemId, next).catch(() => setFlags((all) => ({ ...all, [item.itemId]: !next })));
  }

  const lowTime = remaining !== null && remaining <= 300;
  const finishMessage = [
    unanswered > 0 ? `Te quedan ${unanswered} sin responder.` : null,
    flaggedCount > 0 ? `Tienes ${flaggedCount} marcada${flaggedCount > 1 ? "s" : ""}.` : null,
    "¿Entregar el examen?",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-4">
      {/* Cronómetro y progreso, siempre a la vista */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <span
            role="timer"
            aria-label={remaining === null ? "Sin límite de tiempo" : `Tiempo restante ${formatClock(remaining)}`}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-lg font-semibold tabular-nums ${
              lowTime ? "bg-danger-soft text-danger" : "bg-surface"
            }`}
          >
            <Clock className="size-4" aria-hidden />
            {timeLimitSeconds ? (remaining === null ? "--:--" : formatClock(remaining)) : "Sin límite"}
          </span>
          <span className="flex-1 text-sm text-muted">
            {answeredCount}/{items.length} respondidas
          </span>
          <form
            ref={finishForm}
            action={async (formData) => {
              await saveCurrent();
              if (!(await flushPending())) {
                setError("Sin conexión: tus respuestas están guardadas en el móvil. Entrega cuando vuelva la red.");
                autoSubmitted.current = false;
                return;
              }
              await finishAttemptAction(formData);
            }}
          >
            <input type="hidden" name="id" value={attemptId} />
            <ConfirmButton message={finishMessage} className={buttonClass.primary}>
              Entregar
            </ConfirmButton>
          </form>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
          <div className="h-full bg-primary transition-all" style={{ width: `${(answeredCount / items.length) * 100}%` }} />
        </div>
      </div>

      {Object.keys(pending).length > 0 && (
        <p role="status" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          {Object.keys(pending).length === 1 ? "1 respuesta guardada" : `${Object.keys(pending).length} respuestas guardadas`} en el
          dispositivo. Se enviarán al volver la conexión.
        </p>
      )}

      <p className="text-xs text-muted">
        {penalty > 0 ? `Cada fallo resta ${fmtPoints(Math.round(penalty * 100) / 100)} de lo que vale la pregunta. ` : "Los fallos no restan. "}
        {allowBack ? "Puedes volver a cualquier pregunta y cambiar la respuesta hasta entregar." : "No se puede volver atrás."}
      </p>

      <nav aria-label="Ir a la pregunta" className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <button
            key={it.itemId}
            type="button"
            onClick={() => go(i)}
            disabled={!allowBack && i !== index}
            aria-label={`Pregunta ${i + 1}${answered[it.itemId] ? " (respondida)" : ""}${flags[it.itemId] ? ", marcada" : ""}`}
            aria-current={i === index ? "step" : undefined}
            className={`relative size-8 rounded-md text-xs font-medium disabled:opacity-50 ${
              answered[it.itemId] ? "bg-primary-soft text-primary" : "bg-surface"
            } ${i === index ? "ring-2 ring-primary" : "border border-border"}`}
          >
            {i + 1}
            {flags[it.itemId] && <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-warning" />}
          </button>
        ))}
      </nav>

      <section className={`${cardClass} flex flex-col gap-4 p-5`} aria-label={`Pregunta ${index + 1}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-semibold text-foreground">
            {index + 1} de {items.length}
          </span>
          <SourceBadge source={q.sourceType} detail={q.sourceDetail} />
          <span>{q.typeLabel}</span>
          <span>· {fmtPoints(item.points)} pto{item.points === 1 ? "" : "s"}.</span>
          <button
            type="button"
            onClick={toggleFlag}
            aria-pressed={flags[item.itemId]}
            className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 ${flags[item.itemId] ? "bg-warning-soft text-warning" : "hover:bg-primary-soft"}`}
          >
            <Flag className="size-3.5" aria-hidden />
            {flags[item.itemId] ? "Marcada" : "Marcar"}
          </button>
        </div>

        <RichText text={q.stem} className="text-lg" />
        {kind === "code" && q.content.code && (
          <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-sm">{q.content.code}</pre>
        )}

        {kind === "choice" && (
          <div role={q.content.multiple ? "group" : "radiogroup"} aria-label="Opciones" className="flex flex-col gap-2">
            {q.content.multiple && <p className="text-xs text-muted">Puede haber varias correctas.</p>}
            {(q.content.options ?? []).map((option, i) => {
              const isSelected = draft.selected.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  role={q.content.multiple ? "checkbox" : "radio"}
                  aria-checked={isSelected}
                  onClick={() =>
                    setDraft({
                      selected: q.content.multiple
                        ? isSelected
                          ? draft.selected.filter((x) => x !== i)
                          : [...draft.selected, i]
                        : isSelected
                          ? [] // volver a pulsar la deja en blanco
                          : [i],
                    })
                  }
                  className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-left ${
                    isSelected ? "border-primary bg-primary-soft" : "border-border"
                  }`}
                >
                  <span className="font-semibold text-muted">{optionLetter(i)}</span>
                  <span className="min-w-0 flex-1">{option}</span>
                </button>
              );
            })}
            {!q.content.multiple && <p className="text-xs text-muted">Vuelve a pulsar la opción para dejarla en blanco.</p>}
          </div>
        )}

        {kind === "true_false" && (
          <div role="radiogroup" aria-label="Verdadero o falso" className="grid grid-cols-2 gap-2">
            {[true, false].map((value) => (
              <button
                key={String(value)}
                type="button"
                role="radio"
                aria-checked={draft.tf === value}
                onClick={() => setDraft({ tf: draft.tf === value ? null : value })}
                className={`rounded-lg border px-3 py-3 font-medium ${
                  draft.tf === value ? "border-primary bg-primary-soft" : "border-border"
                }`}
              >
                {value ? "Verdadero" : "Falso"}
              </button>
            ))}
          </div>
        )}

        {(kind === "short_answer" || kind === "numeric") && (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Tu respuesta{kind === "numeric" && q.content.unit ? ` (${q.content.unit})` : ""}
            <input
              value={draft.text}
              onChange={(e) => setDraft({ text: e.target.value })}
              inputMode={kind === "numeric" ? "decimal" : undefined}
              autoComplete="off"
              className={inputClass}
            />
          </label>
        )}

        {(kind === "code" || kind === "open") && (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Tu respuesta
            <textarea
              value={draft.text}
              onChange={(e) => setDraft({ text: e.target.value })}
              rows={kind === "code" ? 10 : 6}
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
      </section>

      <div className="flex items-center justify-between gap-3">
        {allowBack ? (
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0 || saving} className={buttonClass.secondary}>
            <ChevronLeft className="size-4" aria-hidden />
            Anterior
          </button>
        ) : (
          <span />
        )}
        {saving && (
          <span className="flex items-center gap-1 text-xs text-muted">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Guardando…
          </span>
        )}
        {index < items.length - 1 && (
          <button type="button" onClick={() => go(index + 1)} disabled={saving} className={buttonClass.primary}>
            Siguiente
            <ChevronRight className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
