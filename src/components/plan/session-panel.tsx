"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { buttonClass, cardClass, inputClass } from "@/components/ui/styles";
import { formatClock } from "@/domain/practice/exam";
import { COMPLETION, COMPLETION_LABELS, DIFFICULTY_LABELS } from "@/domain/scheduler/session";
import { initialActionState } from "@/lib/action-state";
import { closeSessionAction, markTaskStartedAction } from "@/server/actions/planning";

type Saved = { accumulated: number; runningSince: number | null };
const read = (key: string): Saved => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as Saved;
  } catch {
    // almacenamiento no disponible: el cronómetro empieza de cero
  }
  return { accumulated: 0, runningSince: null };
};
const write = (key: string, value: Saved) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sin almacenamiento: no se recuerda al recargar
  }
};
const elapsed = (s: Saved, now: number) => s.accumulated + (s.runningSince ? Math.floor((now - s.runningSince) / 1000) : 0);

/** Cronómetro de la sesión y cierre: ¿completado?, dificultad, "no lo he entendido". */
export function SessionPanel({ taskId, plannedMinutes, topicName }: { taskId: string; plannedMinutes: number; topicName: string | null }) {
  const key = `sesion:${taskId}`;
  const [saved, setSaved] = useState<Saved>({ accumulated: 0, runningSince: null });
  const [now, setNow] = useState(0);
  const [state, action, pending] = useActionState(closeSessionAction, initialActionState);
  const started = useRef(false);

  useEffect(() => {
    const restore = setTimeout(() => {
      setSaved(read(key));
      setNow(Date.now());
    }, 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(restore);
      clearInterval(timer);
    };
  }, [key]);

  const update = (next: Saved) => {
    setSaved(next);
    setNow(Date.now());
    write(key, next);
  };
  const seconds = elapsed(saved, now);
  const running = saved.runningSince !== null;
  const target = plannedMinutes * 60;

  function toggle() {
    const t = Date.now();
    if (running) update({ accumulated: elapsed(saved, t), runningSince: null });
    else {
      update({ ...saved, runningSince: t });
      if (!started.current) {
        started.current = true;
        markTaskStartedAction(taskId).catch(() => undefined);
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Cronómetro" className={`${cardClass} flex flex-col items-center gap-4 p-6`}>
        <p role="timer" aria-label={`Tiempo de estudio ${formatClock(seconds)}`} className="font-mono text-5xl font-bold tabular-nums">
          {formatClock(seconds)}
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-border" aria-hidden>
          <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, (seconds / target) * 100)}%` }} />
        </div>
        <p className="text-sm text-muted">
          Objetivo: {plannedMinutes} min{seconds >= target && " · ¡conseguido!"}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={toggle} className={buttonClass.primary}>
            {running ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            {running ? "Pausar" : seconds > 0 ? "Seguir" : "Iniciar cronómetro"}
          </button>
          {seconds > 0 && !running && (
            <button type="button" onClick={() => update({ accumulated: 0, runningSince: null })} className={buttonClass.secondary}>
              <RotateCcw className="size-4" aria-hidden />
              Poner a cero
            </button>
          )}
        </div>
      </section>

      <form
        action={(formData) => {
          formData.set("durationSeconds", String(elapsed(saved, Date.now())));
          try {
            localStorage.removeItem(key);
          } catch {
            // nada que borrar
          }
          action(formData);
        }}
        className={`${cardClass} flex flex-col gap-4 p-5`}
        aria-label="Terminar sesión"
      >
        <input type="hidden" name="taskId" value={taskId} />
        <h2 className="text-lg font-semibold">Terminar sesión</h2>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">¿Lo has completado?</legend>
          <div className="grid grid-cols-3 gap-2">
            {COMPLETION.map((c) => (
              <label key={c} className="flex cursor-pointer items-center justify-center rounded-lg border border-border px-3 py-2.5 text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                <input type="radio" name="completion" value={c} className="sr-only" required />
                {COMPLETION_LABELS[c]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Dificultad percibida</legend>
          <div className="grid grid-cols-5 gap-1.5">
            {DIFFICULTY_LABELS.map((label, i) => (
              <label
                key={label}
                className="flex cursor-pointer items-center justify-center rounded-lg border border-border px-1 py-2.5 text-center text-xs font-medium has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
              >
                <input type="radio" name="difficulty" value={i + 1} className="sr-only" required />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {topicName && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="notUnderstood" className="size-4" />
            No he entendido bien este tema
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm font-medium">
          Notas (opcional)
          <textarea name="notes" rows={2} maxLength={2000} className={inputClass} />
        </label>

        {state.error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}
        <div>
          <button type="submit" disabled={pending} className={buttonClass.primary}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Guardar y volver a Hoy
          </button>
        </div>
      </form>
    </div>
  );
}
