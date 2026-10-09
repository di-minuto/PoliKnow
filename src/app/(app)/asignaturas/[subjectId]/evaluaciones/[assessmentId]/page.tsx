import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssessmentFormFields } from "@/components/academic/assessment-form-fields";
import { CountdownBadge } from "@/components/academic/countdown-badge";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Disclosure } from "@/components/ui/disclosure";
import { buttonClass, cardClass, inputClass } from "@/components/ui/styles";
import { buildTopicTree, flattenTree, topicShares } from "@/domain/academic/logic";
import { daysUntil, formatDateTime } from "@/lib/dates";
import { deleteAssessmentAction, saveAssessmentTopicsAction, updateAssessmentAction } from "@/server/actions/academic";
import { getProfile } from "@/server/profile";
import {
  getAssessment,
  getSubject,
  listAssessmentTopics,
  listAssessmentTypes,
  listTopics,
} from "@/server/repositories/academic";

type Props = { params: Promise<{ subjectId: string; assessmentId: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load({ subjectId, assessmentId }: { subjectId: string; assessmentId: string }) {
  if (!UUID.test(subjectId) || !UUID.test(assessmentId)) notFound();
  const [subject, assessment] = await Promise.all([getSubject(subjectId), getAssessment(assessmentId)]);
  if (!subject || !assessment || assessment.subjectId !== subject.id) notFound();
  return { subject, assessment };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { subject, assessment } = await load(await params);
  return { title: `${assessment.name} · ${subject.code ?? subject.name}` };
}

export default async function AssessmentPage({ params }: Props) {
  const { subject, assessment } = await load(await params);
  const [topics, links, types, profile] = await Promise.all([
    listTopics(subject.id),
    listAssessmentTopics([assessment.id]),
    listAssessmentTypes(),
    getProfile(),
  ]);

  const flat = flattenTree(buildTopicTree(topics));
  const weightOf = new Map(links.map((l) => [l.topicId, l.weight]));
  const shares = topicShares(links);
  const typeLabel = types.find((t) => t.code === assessment.assessmentType)?.label ?? assessment.assessmentType;

  return (
    <>
      <header className="mb-6">
        <Link href={`/asignaturas/${subject.id}`} className="text-sm text-muted hover:underline">
          ← {subject.code ?? subject.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{assessment.name}</h1>
          {assessment.examAt && assessment.status === "upcoming" && (
            <CountdownBadge days={daysUntil(assessment.examAt, new Date(), profile.timezone)} />
          )}
        </div>
        <p className="mt-1 text-muted">
          {typeLabel}
          {assessment.examAt ? ` · ${formatDateTime(assessment.examAt, profile.timezone)}` : " · sin fecha"}
          {assessment.durationMinutes ? ` · ${assessment.durationMinutes} min` : ""}
        </p>
        <Link href={`/tests?asignatura=${subject.id}&parcial=${assessment.id}`} className={`${buttonClass.secondary} mt-3`}>
          Hacer test de este parcial
        </Link>
      </header>

      <div className="flex flex-col gap-8">
        <section>
          <h2 className="mb-1 text-lg font-semibold">Temas que entran</h2>
          <p className="mb-3 text-sm text-muted">
            Marca los temas de esta evaluación. El peso indica cuánto cuenta cada uno (por ejemplo, 2 = el doble que
            uno con 1); el planificador y los simulacros lo usarán.
          </p>
          {flat.length === 0 ? (
            <p className="text-sm text-muted">
              Primero añade temas en{" "}
              <Link href={`/asignaturas/${subject.id}`} className="text-primary underline">
                la asignatura
              </Link>
              .
            </p>
          ) : (
            <ActionForm action={saveAssessmentTopicsAction} submitLabel="Guardar temas" successMessage="Temas guardados.">
              <input type="hidden" name="assessmentId" value={assessment.id} />
              <ul className={`${cardClass} divide-y divide-border`}>
                {flat.map((t) => {
                  const share = shares.get(t.id);
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-2 pr-3" style={{ paddingLeft: `${0.75 + t.depth * 1.25}rem` }}>
                      <label className="flex min-w-0 flex-1 items-center gap-3">
                        <input
                          type="checkbox"
                          name="topic"
                          value={t.id}
                          defaultChecked={weightOf.has(t.id)}
                          className="size-5 accent-[var(--primary)]"
                        />
                        <span className="min-w-0 truncate">{t.name}</span>
                      </label>
                      {share !== undefined && <span className="text-xs text-muted">{Math.round(share * 100)}%</span>}
                      <input
                        name={`weight:${t.id}`}
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        defaultValue={weightOf.get(t.id) ?? 1}
                        aria-label={`Peso de ${t.name}`}
                        className={`${inputClass.replace("w-full", "")} w-20 shrink-0 py-1.5 text-sm`}
                      />
                    </li>
                  );
                })}
              </ul>
            </ActionForm>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <Disclosure summary="Editar evaluación">
            <ActionForm action={updateAssessmentAction} submitLabel="Guardar cambios" successMessage="Guardado.">
              <input type="hidden" name="id" value={assessment.id} />
              <AssessmentFormFields subjectId={subject.id} types={types} timezone={profile.timezone} assessment={assessment} />
            </ActionForm>
            <form action={deleteAssessmentAction} className="mt-6 border-t border-border pt-4">
              <input type="hidden" name="id" value={assessment.id} />
              <ConfirmButton message={`¿Borrar "${assessment.name}"? Los temas no se borran.`}>Borrar evaluación</ConfirmButton>
            </form>
          </Disclosure>
        </section>
      </div>
    </>
  );
}
