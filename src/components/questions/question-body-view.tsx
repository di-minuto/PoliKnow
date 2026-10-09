import { Check } from "lucide-react";
import { bodyKind, optionLetter } from "@/domain/questions/body";
import type { Question } from "@/domain/questions/types";
import { CodeBlock, RichText } from "./rich-text";

const fmt = (n: number) => String(n).replace(".", ",");

/** Muestra el cuerpo de una pregunta con su solución (ficha y repaso). */
export function QuestionBodyView({ question }: { question: Question }) {
  const kind = bodyKind(question.questionType);
  const content = question.content as Record<string, unknown>;
  const answer = (question.answer ?? {}) as Record<string, unknown>;

  if (kind === "choice") {
    const options = (content.options as string[]) ?? [];
    const correct = new Set((answer.correct as number[]) ?? []);
    return (
      <ol className="flex flex-col gap-2" aria-label="Opciones">
        {options.map((o, i) => (
          <li
            key={i}
            className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
              correct.has(i) ? "border-success bg-success-soft" : "border-border"
            }`}
          >
            <span className="font-semibold text-muted">{optionLetter(i)}</span>
            <span className="min-w-0 flex-1">{o}</span>
            {correct.has(i) && (
              <Check className="size-5 shrink-0 text-success" aria-label="Correcta" />
            )}
          </li>
        ))}
      </ol>
    );
  }

  const solution = (() => {
    switch (kind) {
      case "true_false":
        return <p className="font-semibold">{answer.value ? "Verdadero" : "Falso"}</p>;
      case "short_answer":
        return <p>{((answer.accepted as string[]) ?? []).join(" · ")}</p>;
      case "numeric":
        return (
          <p className="font-semibold">
            {fmt(answer.value as number)}
            {content.tolerance ? ` ± ${fmt(content.tolerance as number)}` : ""}
            {content.unit ? ` ${content.unit}` : ""}
          </p>
        );
      case "code":
        return answer.model ? <CodeBlock code={answer.model as string} language={content.language as string | null} /> : null;
      default:
        return answer.model ? <RichText text={answer.model as string} /> : null;
    }
  })();

  return (
    <div className="flex flex-col gap-3">
      {kind === "code" && typeof content.code === "string" && content.code && (
        <CodeBlock code={content.code} language={content.language as string | null} />
      )}
      <div className="rounded-lg border border-success/40 bg-success-soft/50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-success">
          {kind === "code" || kind === "open" ? "Respuesta modelo" : "Solución"}
        </p>
        {solution ?? <p className="text-sm text-muted">Sin respuesta modelo.</p>}
      </div>
    </div>
  );
}
