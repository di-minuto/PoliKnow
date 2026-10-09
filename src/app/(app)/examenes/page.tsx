import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ExamFields } from "@/components/questions/exam-fields";
import { ActionForm } from "@/components/ui/action-form";
import { Disclosure } from "@/components/ui/disclosure";
import { cardClass } from "@/components/ui/styles";
import { createOfficialExamAction } from "@/server/actions/questions";
import { loadExamOptions } from "@/server/exam-options";
import { countExamQuestions, listOfficialExams } from "@/server/repositories/questions";

export const metadata: Metadata = { title: "Exámenes" };

export default async function ExamsPage() {
  const [exams, options] = await Promise.all([listOfficialExams(), loadExamOptions()]);
  const counts = await countExamQuestions(exams.map((e) => e.id));
  const subjectById = new Map(options.subjects.map((s) => [s.id, s]));

  return (
    <>
      <PageHeader
        title="Exámenes"
        subtitle="Exámenes oficiales de otros años con sus preguntas. Entra en uno para hacerlo como examen real."
      />

      <div className="flex flex-col gap-6">
        {exams.length === 0 ? (
          <p className={`${cardClass} p-5 text-muted`}>
            Aún no hay exámenes oficiales. Créalo aquí y añade sus preguntas, o importa un JSON desde Preguntas.
          </p>
        ) : (
          <ul className={`${cardClass} divide-y divide-border`} aria-label="Exámenes oficiales">
            {exams.map((e) => {
              const subject = subjectById.get(e.subjectId);
              const n = counts.get(e.id) ?? 0;
              return (
                <li key={e.id}>
                  <Link href={`/examenes/${e.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-primary-soft/50">
                    <ClipboardCheck className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{e.title}</p>
                      <p className="text-sm text-muted">
                        {[subject?.label.split(" · ")[0], [e.examSession, e.year].filter(Boolean).join(" "), `${n} ${n === 1 ? "pregunta" : "preguntas"}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {options.subjects.length > 0 && (
          <Disclosure summary="Nuevo examen oficial" defaultOpen={exams.length === 0}>
            <ActionForm action={createOfficialExamAction} submitLabel="Crear examen">
              <ExamFields options={options} />
            </ActionForm>
          </Disclosure>
        )}
      </div>
    </>
  );
}
