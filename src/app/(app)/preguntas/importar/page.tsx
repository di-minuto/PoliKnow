import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/questions/rich-text";
import { ImportForm } from "@/components/questions/import-form";
import { cardClass } from "@/components/ui/styles";
import { IMPORT_EXAMPLE } from "@/domain/questions/import";
import { listQuestionTypes } from "@/server/repositories/questions";
import { loadLibraryOptions } from "@/server/library-options";

export const metadata: Metadata = { title: "Importar preguntas" };

export default async function ImportPage({ searchParams }: PageProps<"/preguntas/importar">) {
  const { asignatura } = await searchParams;
  const [library, types] = await Promise.all([loadLibraryOptions(), listQuestionTypes()]);
  const defaultSubjectId = library.subjects.find((s) => s.id === asignatura)?.id;

  return (
    <>
      <header className="mb-6">
        <Link href="/preguntas" className="text-sm text-muted hover:underline">
          ← Preguntas
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Importar preguntas</h1>
        <p className="mt-1 text-muted">Desde un archivo JSON. Primero se comprueba y luego confirmas.</p>
      </header>

      {library.subjects.length === 0 ? (
        <p className={`${cardClass} p-5 text-muted`}>Primero crea una asignatura.</p>
      ) : (
        <ImportForm
          subjects={library.subjects}
          typeLabels={Object.fromEntries(types.map((t) => [t.code, t.label]))}
          defaultSubjectId={defaultSubjectId}
        />
      )}

      <details className={`${cardClass} mt-6 p-5 text-sm`}>
        <summary className="cursor-pointer font-medium">Formato del JSON</summary>
        <div className="mt-3 flex flex-col gap-2 leading-relaxed">
          <p>
            Una lista <code>questions</code>. Si añades el bloque <code>exam</code>, se crea ese examen oficial y todas las
            preguntas quedan marcadas como suyas; sin él, son tuyas (<code>manual</code>) o del material (
            <code>&quot;source&quot;: &quot;course_material&quot;</code>).
          </p>
          <p>
            Tipos: {types.map((t) => t.code).join(", ")}. Respuesta: letra (<code>&quot;B&quot;</code> o{" "}
            <code>[&quot;A&quot;,&quot;C&quot;]</code>) en tipo test, <code>true</code>/<code>false</code> en V/F, número en
            numéricas (con <code>tolerance</code> y <code>unit</code>), texto o lista en respuesta corta, y la respuesta modelo en el
            resto.
          </p>
          <p>
            El tema se busca por nombre (vale el principio: «Tema 2»). Las preguntas generadas por IA llevan{" "}
            <code>&quot;source&quot;: &quot;ai_generated&quot;</code> y <code>ai_model</code>, y entran como «Por revisar».
          </p>
          <CodeBlock language="json" code={JSON.stringify(IMPORT_EXAMPLE, null, 2)} />
        </div>
      </details>
    </>
  );
}
