import { splitHighlights } from "@/domain/documents/schemas";

/** Pinta un fragmento con las coincidencias marcadas (sin insertar HTML). */
export function Highlighted({ snippet }: { snippet: string }) {
  return (
    <>
      {splitHighlights(snippet).map((part, i) =>
        part.mark ? (
          <mark key={i} className="rounded bg-primary-soft px-0.5 font-medium text-foreground">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
