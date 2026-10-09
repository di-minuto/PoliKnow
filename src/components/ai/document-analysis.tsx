import { Sparkles } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClass, cardClass } from "@/components/ui/styles";
import { analyzeDocumentAction, applySuggestedTopicsAction } from "@/server/actions/ai";
import type { DocumentAnalysisRecord } from "@/server/repositories/documents";

/** Resumen, conceptos clave y temas propuestos por la IA (se guardan; no se vuelven a pedir). */
export function DocumentAnalysis({
  documentId,
  analysis,
  topicNames,
  assignedTopicIds,
  hasText,
}: {
  documentId: string;
  analysis: DocumentAnalysisRecord | null;
  topicNames: Map<string, string>;
  assignedTopicIds: string[];
  hasText: boolean;
}) {
  const missing = analysis?.topicIds.filter((id) => !assignedTopicIds.includes(id) && topicNames.has(id)) ?? [];
  return (
    <section aria-labelledby="analisis" className={`${cardClass} flex flex-col gap-3 p-5`}>
      <h2 id="analisis" className="flex items-center gap-2 text-lg font-semibold">
        <Sparkles className="size-5 text-primary" aria-hidden />
        Análisis con IA
      </h2>
      {analysis ? (
        <>
          <p className="text-sm leading-relaxed">{analysis.summary}</p>
          {analysis.concepts.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Conceptos clave">
              {analysis.concepts.map((c) => (
                <li key={c} className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs text-primary">
                  {c}
                </li>
              ))}
            </ul>
          )}
          {analysis.topicIds.length > 0 && (
            <p className="text-sm">
              <span className="text-muted">Temas: </span>
              {analysis.topicIds.map((id) => topicNames.get(id)).filter(Boolean).join(", ")}
            </p>
          )}
          {missing.length > 0 && (
            <form action={applySuggestedTopicsAction}>
              <input type="hidden" name="id" value={documentId} />
              <SubmitButton className={buttonClass.secondary}>Asignar {missing.length === 1 ? "este tema" : "estos temas"} al documento</SubmitButton>
            </form>
          )}
          <p className="text-xs text-muted">Generado por IA ({analysis.model}).</p>
        </>
      ) : hasText ? (
        <ActionForm action={analyzeDocumentAction} submitLabel="Analizar documento" pendingLabel="Analizando…" className="flex flex-col gap-2">
          <input type="hidden" name="id" value={documentId} />
          <p className="text-sm text-muted">Resume el documento, saca los conceptos clave y te dice a qué temas pertenece.</p>
        </ActionForm>
      ) : (
        <p className="text-sm text-muted">Cuando el documento tenga texto podrás analizarlo.</p>
      )}
    </section>
  );
}
