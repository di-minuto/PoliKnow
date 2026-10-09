import { RichText, type Citation } from "@/components/questions/rich-text";
import type { AssistantMessage } from "@/server/repositories/assistant";

const sourceHref = (c: { document_id: string; chunk_index: number }) =>
  `/biblioteca/${c.document_id}?fragmento=${c.chunk_index}#fragmento-${c.chunk_index}`;

/** Conversación: tus preguntas a la derecha; las respuestas con sus fuentes enlazadas. */
export function AssistantMessages({ messages }: { messages: AssistantMessage[] }) {
  return (
    <ol className="flex flex-col gap-4" aria-label="Conversación">
      {messages.map((m) =>
        m.role === "user" ? (
          <li key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 whitespace-pre-line text-primary-foreground">
            {m.content}
          </li>
        ) : (
          <li key={m.id} className="flex flex-col gap-2 rounded-2xl rounded-bl-sm border border-border bg-surface px-4 py-3" aria-label="Respuesta del asistente">
            <RichText
              text={m.content}
              citations={m.citations.map(
                (c): Citation => ({ n: c.n, href: sourceHref(c), label: `${c.title}${c.location ? `, ${c.location}` : ""}` }),
              )}
            />
            {m.citations.length > 0 && (
              <div className="border-t border-border pt-2 text-xs">
                <p className="mb-1 font-medium text-muted">Fuentes de tus documentos</p>
                <ul className="flex flex-col gap-0.5">
                  {m.citations.map((c) => (
                    <li key={c.n}>
                      <a href={sourceHref(c)} className="text-primary hover:underline">
                        [{c.n}] {c.title}
                        {c.location ? `, ${c.location}` : ""}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {m.model && <p className="text-[11px] text-muted">Respuesta generada por IA ({m.model}). Contrasta lo importante con tus apuntes.</p>}
          </li>
        ),
      )}
    </ol>
  );
}
