import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ExamBuilder } from "@/components/practice/exam-builder";
import { cardClass } from "@/components/ui/styles";
import { loadLibraryOptions } from "@/server/library-options";
import { listAssessmentTopics, listAssessments } from "@/server/repositories/academic";
import { aiInfo } from "@/server/ai";
import { countExamQuestions, listOfficialExams, listQuestionTypes, questionAvailability } from "@/server/repositories/questions";

export const metadata: Metadata = { title: "Simulacro de examen" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function SimulationPage({ searchParams }: PageProps<"/simulacro">) {
  const params = await searchParams;
  const [library, assessments, questionTypes, exams, available] = await Promise.all([
    loadLibraryOptions(),
    listAssessments(),
    listQuestionTypes(),
    listOfficialExams(),
    questionAvailability(),
  ]);
  const active = new Set(library.subjects.map((s) => s.id));
  const visible = assessments.filter((a) => active.has(a.subjectId) && a.status !== "cancelled");
  const [links, counts] = await Promise.all([
    listAssessmentTopics(visible.map((a) => a.id)),
    countExamQuestions(exams.map((e) => e.id)),
  ]);
  const subjectLabel = new Map(library.subjects.map((s) => [s.id, s.label.split(" · ")[0]]));
  const officialExams = exams.filter((e) => active.has(e.subjectId) && (counts.get(e.id) ?? 0) > 0);

  return (
    <>
      <PageHeader
        title="Simulacro de examen"
        subtitle="Como el examen de verdad: con tiempo, sin ver soluciones hasta entregar y con penalización si quieres."
      />
      {library.subjects.length === 0 ? (
        <p className={`${cardClass} p-5 text-muted`}>
          Primero crea una asignatura y añade preguntas en{" "}
          <Link href="/preguntas" className="text-primary underline">
            Preguntas
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          <section className={`${cardClass} p-5`} aria-label="Configurar simulacro">
            <ExamBuilder
              options={{
                subjects: library.subjects,
                topics: library.topics,
                assessments: visible.map((a) => ({
                  id: a.id,
                  subjectId: a.subjectId,
                  name: a.name,
                  durationMinutes: a.durationMinutes,
                  topics: links.filter((l) => l.assessmentId === a.id).map((l) => ({ topicId: l.topicId, weight: l.weight })),
                })),
                questionTypes,
                available,
                aiEnabled: aiInfo().enabled,
              }}
              defaults={{ subjectId: one(params.asignatura), assessmentId: one(params.parcial) }}
            />
          </section>

          {officialExams.length > 0 && (
            <section aria-labelledby="oficiales">
              <h2 id="oficiales" className="mb-3 text-lg font-semibold">
                Exámenes oficiales
              </h2>
              <p className="mb-3 text-sm text-muted">Hazlos tal cual, con sus preguntas y su puntuación.</p>
              <ul className={`${cardClass} divide-y divide-border`}>
                {officialExams.map((e) => (
                  <li key={e.id}>
                    <Link href={`/examenes/${e.id}#hacer`} className="flex items-center gap-3 px-4 py-3 hover:bg-primary-soft/50">
                      <FileText className="size-5 shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{e.title}</span>
                        <span className="block text-sm text-muted">
                          {subjectLabel.get(e.subjectId)} · {counts.get(e.id)} preguntas
                          {e.durationMinutes ? ` · ${e.durationMinutes} min` : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
