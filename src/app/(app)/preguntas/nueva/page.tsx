import type { Metadata } from "next";
import Link from "next/link";
import { QuestionEditor } from "@/components/questions/question-editor";
import { ActionForm } from "@/components/ui/action-form";
import { cardClass } from "@/components/ui/styles";
import type { Question } from "@/domain/questions/types";
import { createQuestionAction } from "@/server/actions/questions";
import { getQuestion } from "@/server/repositories/questions";
import { loadQuestionOptions } from "@/server/question-options";

export const metadata: Metadata = { title: "Nueva pregunta" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (typeof v === "string" && UUID.test(v) ? v : undefined);

export default async function NewQuestionPage({ searchParams }: PageProps<"/preguntas/nueva">) {
  const params = await searchParams;
  const options = await loadQuestionOptions();
  const exam = options.exams.find((e) => e.id === one(params.examen));
  const original = one(params.variante) ? await getQuestion(one(params.variante)!) : null;

  let values: Partial<Question> = {};
  if (original) {
    // Una variante es una pregunta nueva «parecida a»: nunca hereda la procedencia oficial ni de IA.
    values = {
      ...original,
      id: undefined,
      sourceType: "manual",
      officialExamId: null,
      officialPosition: null,
      aiModel: null,
      originalText: null,
      reviewStatus: "approved",
      variantOf: original.id,
    };
  } else if (exam) {
    values = { subjectId: exam.subjectId, sourceType: "official_exam", officialExamId: exam.id };
  } else {
    const subjectId = options.subjects.find((s) => s.id === one(params.asignatura))?.id;
    const topicId = options.topics.find((t) => t.id === one(params.tema) && t.subjectId === subjectId)?.id;
    values = { subjectId, topicId: topicId ?? null };
  }

  const back = exam ? `/examenes/${exam.id}` : original ? `/preguntas/${original.id}` : "/preguntas";

  return (
    <>
      <header className="mb-6">
        <Link href={back} className="text-sm text-muted hover:underline">
          ← {exam ? exam.title : original ? "Pregunta original" : "Preguntas"}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{original ? "Nueva variante" : "Nueva pregunta"}</h1>
        {original && <p className="mt-1 text-muted">Parte de la pregunta original; cámbiala para practicar lo mismo de otra forma.</p>}
      </header>
      {options.subjects.length === 0 ? (
        <p className={`${cardClass} p-5 text-muted`}>
          Primero crea una asignatura en{" "}
          <Link href="/asignaturas" className="text-primary underline">
            Asignaturas
          </Link>
          .
        </p>
      ) : (
        <section className={`${cardClass} p-5`}>
          <ActionForm action={createQuestionAction} submitLabel="Guardar pregunta">
            <QuestionEditor options={options} values={values} />
          </ActionForm>
        </section>
      )}
    </>
  );
}
