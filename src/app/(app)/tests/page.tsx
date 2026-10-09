import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { QuickModes, TestBuilder } from "@/components/practice/test-builder";
import { Disclosure } from "@/components/ui/disclosure";
import { cardClass } from "@/components/ui/styles";
import { TEST_MODE_LABELS } from "@/domain/practice/types";
import { formatDateTime } from "@/lib/dates";
import { getProfile } from "@/server/profile";
import { countDueQuestions, listAttempts } from "@/server/repositories/practice";
import { listQuestionTypes } from "@/server/repositories/questions";
import { loadLibraryOptions } from "@/server/library-options";
import { listAssessments } from "@/server/repositories/academic";

export const metadata: Metadata = { title: "Tests" };

const fmt = (n: number | string | null) => (n === null ? "–" : String(Math.round(Number(n) * 10) / 10).replace(".", ","));
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function TestsPage({ searchParams }: PageProps<"/tests">) {
  const params = await searchParams;
  const [library, assessments, questionTypes, attempts, due, profile] = await Promise.all([
    loadLibraryOptions(),
    listAssessments(),
    listQuestionTypes(),
    listAttempts(),
    countDueQuestions(new Date()),
    getProfile(),
  ]);
  const subjectId = library.subjects.find((s) => s.id === one(params.asignatura))?.id;
  const assessmentId = assessments.find((a) => a.id === one(params.parcial) && a.subjectId === subjectId)?.id;
  const topicId = library.topics.find((t) => t.id === one(params.tema) && t.subjectId === subjectId)?.id;
  const subjectLabel = new Map(library.subjects.map((s) => [s.id, s.label.split(" · ")[0]]));

  return (
    <>
      <PageHeader
        title="Tests"
        subtitle={due > 0 ? `${due} ${due === 1 ? "pregunta toca" : "preguntas tocan"} repasar hoy.` : "Practica y repasa con corrección al momento."}
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
        <div className="flex flex-col gap-6">
          <QuickModes subjects={library.subjects} defaultSubjectId={subjectId} />

          <Disclosure summary="Test personalizado, por tema o por parcial" defaultOpen={Boolean(assessmentId || topicId)}>
            <TestBuilder
              options={{
                subjects: library.subjects,
                topics: library.topics,
                assessments: assessments.map((a) => ({ id: a.id, subjectId: a.subjectId, name: a.name })),
                questionTypes,
              }}
              defaults={{ subjectId, assessmentId, topicId }}
            />
          </Disclosure>

          <section aria-labelledby="historial">
            <h2 id="historial" className="mb-3 text-lg font-semibold">
              Historial
            </h2>
            {attempts.length === 0 ? (
              <p className="text-sm text-muted">Aún no has hecho ningún test.</p>
            ) : (
              <ul className={`${cardClass} divide-y divide-border`} aria-label="Tests hechos">
                {attempts.map((a) => (
                  <li key={a.id}>
                    <Link href={`/tests/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-primary-soft/50">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {TEST_MODE_LABELS[a.mode]}
                          {a.subject_id && ` · ${subjectLabel.get(a.subject_id) ?? ""}`}
                        </p>
                        <p className="text-sm text-muted">{formatDateTime(a.started_at, profile.timezone)}</p>
                      </div>
                      {a.status === "finished" ? (
                        <span className="text-lg font-bold">{fmt(a.grade)}</span>
                      ) : (
                        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">Continuar</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
