import type { Metadata } from "next";
import Link from "next/link";
import { AIDisabled } from "@/components/ai/ai-disabled";
import { ActionForm } from "@/components/ui/action-form";
import { Field } from "@/components/ui/field";
import { SelectNav } from "@/components/ui/select-nav";
import { cardClass, inputClass } from "@/components/ui/styles";
import { GENERATABLE_TYPES } from "@/ai/prompts";
import { generateQuestionsAction } from "@/server/actions/ai";
import { aiInfo } from "@/server/ai";
import { listDocuments } from "@/server/repositories/documents";
import { listQuestionTypes } from "@/server/repositories/questions";
import { loadLibraryOptions } from "@/server/library-options";

export const metadata: Metadata = { title: "Generar preguntas con IA" };

const DEFAULT_TYPES = ["multiple_choice", "true_false"];

export default async function GeneratePage({ searchParams }: PageProps<"/preguntas/generar">) {
  const { asignatura, tema, documento } = await searchParams;
  const ai = aiInfo();
  const library = await loadLibraryOptions();
  const subjectId = library.subjects.find((s) => s.id === asignatura)?.id ?? library.subjects[0]?.id;
  const [types, documents] = await Promise.all([listQuestionTypes(), subjectId ? listDocuments({ subjectId }) : []]);
  const topics = library.topics.filter((t) => t.subjectId === subjectId);
  const withText = documents.filter((d) => (d.chunkCount ?? 0) > 0);
  const typeLabel = new Map(types.map((t) => [t.code, t.label]));

  return (
    <>
      <header className="mb-6">
        <Link href="/preguntas" className="text-sm text-muted hover:underline">
          ← Preguntas
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Generar preguntas con IA</h1>
        <p className="mt-1 text-muted">
          A partir de tus apuntes. Quedan marcadas como «Generada por IA» y «Por revisar»: no entran en los tests hasta que las
          apruebes.
        </p>
      </header>

      {!ai.enabled ? (
        <AIDisabled feature="Generar preguntas" reason={ai.reason} />
      ) : library.subjects.length === 0 ? (
        <p className={`${cardClass} p-5 text-muted`}>Primero crea una asignatura y sube sus apuntes.</p>
      ) : (
        <div className={`${cardClass} flex flex-col gap-4 p-5`}>
          <Field label="Asignatura">
            <SelectNav
              label="Asignatura"
              value={subjectId ?? ""}
              options={library.subjects.map((s) => ({ value: s.id, label: s.label, href: `/preguntas/generar?asignatura=${s.id}` }))}
            />
          </Field>
          <ActionForm action={generateQuestionsAction} submitLabel="Generar preguntas" pendingLabel="Generando… (puede tardar un poco)">
            <input type="hidden" name="subjectId" value={subjectId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tema" hint="Se usan los documentos asignados a ese tema.">
                <select name="topicId" defaultValue={topics.some((t) => t.id === tema) ? tema : ""} className={inputClass}>
                  <option value="">Toda la asignatura</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {`${"  ".repeat(t.depth)}${t.name}`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Documento (opcional)" hint={withText.length ? undefined : "Ningún documento de esta asignatura tiene texto aún."}>
                <select name="documentId" defaultValue={withText.some((d) => d.id === documento) ? documento : ""} className={inputClass}>
                  <option value="">Buscar en todos</option>
                  {withText.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Número de preguntas">
                <input name="count" type="number" min={1} max={15} defaultValue={5} className={inputClass} />
              </Field>
              <Field label="Dificultad">
                <select name="difficulty" defaultValue="" className={inputClass}>
                  <option value="">Variada</option>
                  {[1, 2, 3, 4, 5].map((d) => (
                    <option key={d} value={d}>
                      {d} de 5
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Tipos</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.keys(GENERATABLE_TYPES).map((code) => (
                  <label key={code} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="types" value={code} defaultChecked={DEFAULT_TYPES.includes(code)} />
                    {typeLabel.get(code) ?? code}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Indicaciones (opcional)" hint="Por ejemplo: «céntrate en las cláusulas de planificación» o «como en el examen de enero».">
              <textarea name="instructions" rows={2} maxLength={500} className={inputClass} />
            </Field>
          </ActionForm>
        </div>
      )}
    </>
  );
}
