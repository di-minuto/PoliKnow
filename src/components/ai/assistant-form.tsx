"use client";

import { useActionState, useRef, useState } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui/styles";
import { initialActionState } from "@/lib/action-state";
import { sendAssistantMessageAction } from "@/server/actions/assistant";

export const SUGGESTIONS = [
  "¿Qué debería estudiar hoy?",
  "¿Qué temas llevo peor?",
  "Explícame por qué he fallado mis últimas preguntas.",
  "¿Qué diferencia hay entre critical y atomic en OpenMP?",
];

/** Caja para preguntar al asistente. Mientras responde, muestra la pregunta enviada. */
export function AssistantForm({
  conversationId,
  subjects,
  suggestions = [],
}: {
  conversationId?: string;
  subjects?: { id: string; label: string }[];
  suggestions?: string[];
}) {
  const [state, action, pending] = useActionState(sendAssistantMessageAction, initialActionState);
  const [sent, setSent] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  function ask(text: string) {
    if (!textRef.current || pending) return;
    textRef.current.value = text;
    formRef.current?.requestSubmit();
  }

  return (
    <div className="flex flex-col gap-3">
      {pending && sent && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 whitespace-pre-line text-primary-foreground">{sent}</p>
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Buscando en tus documentos y pensando…
          </p>
        </div>
      )}
      {suggestions.length > 0 && !pending && (
        <div className="flex flex-wrap gap-2" aria-label="Sugerencias">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-border bg-surface px-3 py-1.5 text-left text-sm hover:bg-primary-soft">
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        ref={formRef}
        action={action}
        onSubmit={() => setSent(textRef.current?.value.trim() ?? "")}
        className="flex flex-col gap-2"
        aria-label="Preguntar al asistente"
      >
        {conversationId && <input type="hidden" name="conversationId" value={conversationId} />}
        {subjects && subjects.length > 1 && (
          <select name="subjectId" aria-label="Buscar en" className={inputClass} defaultValue="">
            <option value="">Buscar en todas las asignaturas</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                Solo {s.label}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={textRef}
            name="message"
            required
            rows={2}
            maxLength={4000}
            placeholder={conversationId ? "Sigue preguntando…" : "Pregunta sobre tus apuntes, exámenes o tu plan…"}
            aria-label="Tu pregunta"
            className={`${inputClass} min-h-12 resize-y`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) formRef.current?.requestSubmit();
            }}
          />
          <button type="submit" disabled={pending} className={`${buttonClass.primary} shrink-0`} aria-label="Enviar">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <SendHorizontal className="size-4" aria-hidden />}
          </button>
        </div>
        {state.error && !pending && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}
