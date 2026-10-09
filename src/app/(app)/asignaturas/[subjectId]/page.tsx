import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { AssessmentFormFields } from "@/components/academic/assessment-form-fields";
import { CountdownBadge } from "@/components/academic/countdown-badge";
import { SubjectFormFields } from "@/components/academic/subject-form-fields";
import { TopicFormFields } from "@/components/academic/topic-form-fields";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Disclosure } from "@/components/ui/disclosure";
import { buttonClass, cardClass } from "@/components/ui/styles";
import { buildTopicTree, descendantIds, flattenTree, type TopicNode } from "@/domain/academic/logic";
import { TOPIC_KIND_LABELS } from "@/domain/academic/schemas";
import { daysUntil, formatDateTime } from "@/lib/dates";
import {
  createAssessmentAction,
  createTopicAction,
  deleteSubjectAction,
  deleteTopicAction,
  moveTopicAction,
  updateSubjectAction,
  updateTopicAction,
} from "@/server/actions/academic";
import { getProfile } from "@/server/profile";
import {
  getSubject,
  listAssessmentTopics,
  listAssessmentTypes,
  listAssessments,
  listCourses,
  listTopics,
} from "@/server/repositories/academic";

type Props = { params: Promise<{ subjectId: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(subjectId: string) {
  if (!UUID.test(subjectId)) notFound();
  const subject = await getSubject(subjectId);
  if (!subject) notFound();
  return subject;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const subject = await load((await params).subjectId);
  return { title: subject.code ?? subject.name };
}

export default async function SubjectPage({ params }: Props) {
  const { subjectId } = await params;
  const subject = await load(subjectId);
  const [topics, assessments, types, courses, profile] = await Promise.all([
    listTopics(subjectId),
    listAssessments(subjectId),
    listAssessmentTypes(),
    listCourses(),
    getProfile(),
  ]);
  const links = await listAssessmentTopics(assessments.map((a) => a.id));

  const tree = buildTopicTree(topics);
  const flat = flattenTree(tree);
  const typeLabel = new Map(types.map((t) => [t.code, t.label]));
  const now = new Date();

  return (
    <>
      <header className="mb-6">
        <Link href="/asignaturas" className="text-sm text-muted hover:underline">
          ← Asignaturas
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <span className="size-4 shrink-0 rounded-full" style={{ backgroundColor: subject.color }} aria-hidden />
          <h1 className="text-2xl font-bold tracking-tight">{subject.code ? `${subject.code} · ${subject.name}` : subject.name}</h1>
        </div>
      </header>

      <div className="flex flex-col gap-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Evaluaciones</h2>
          {assessments.length === 0 ? (
            <p className="mb-3 text-sm text-muted">Añade los parciales, el final o los exámenes de prácticas con su fecha.</p>
          ) : (
            <ul className="mb-3 flex flex-col gap-2">
              {assessments.map((a) => {
                const topicCount = links.filter((l) => l.assessmentId === a.id).length;
                return (
                  <li key={a.id}>
                    <Link
                      href={`/asignaturas/${subjectId}/evaluaciones/${a.id}`}
                      className={`${cardClass} flex items-center gap-3 p-4 hover:border-primary`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{a.name}</span>
                        <span className="block text-sm text-muted">
                          {typeLabel.get(a.assessmentType) ?? a.assessmentType}
                          {a.examAt ? ` · ${formatDateTime(a.examAt, profile.timezone)}` : " · sin fecha"}
                          {` · ${topicCount} ${topicCount === 1 ? "tema" : "temas"}`}
                        </span>
                      </span>
                      {a.examAt && a.status === "upcoming" && (
                        <CountdownBadge days={daysUntil(a.examAt, now, profile.timezone)} />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Disclosure summary="Nueva evaluación">
            <ActionForm action={createAssessmentAction} submitLabel="Crear evaluación">
              <AssessmentFormFields subjectId={subjectId} types={types} timezone={profile.timezone} />
            </ActionForm>
          </Disclosure>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Temas y prácticas</h2>
          {flat.length === 0 ? (
            <p className="mb-3 text-sm text-muted">Todavía no hay temas.</p>
          ) : (
            <ul className={`${cardClass} mb-3 divide-y divide-border`}>
              {flat.map((t) => (
                <TopicRow key={t.id} topic={t} siblings={flat.filter((s) => s.parentId === t.parentId)} parentOptions={flat.filter((o) => !descendantIds(topics, t.id).has(o.id))} />
              ))}
            </ul>
          )}
          <Disclosure summary="Nuevo tema o práctica" defaultOpen={flat.length === 0}>
            <ActionForm action={createTopicAction} submitLabel="Añadir" resetOnSuccess>
              <TopicFormFields subjectId={subjectId} parentOptions={flat} />
            </ActionForm>
          </Disclosure>
        </section>

        <section className="flex flex-col gap-3">
          <Disclosure summary="Editar asignatura">
            <ActionForm action={updateSubjectAction} submitLabel="Guardar cambios" successMessage="Guardado.">
              <input type="hidden" name="id" value={subject.id} />
              <SubjectFormFields courses={courses} subject={subject} />
            </ActionForm>
            <form action={deleteSubjectAction} className="mt-6 border-t border-border pt-4">
              <input type="hidden" name="id" value={subject.id} />
              <ConfirmButton message={`¿Borrar ${subject.name} con todos sus temas, evaluaciones, documentos y preguntas? No se puede deshacer.`}>
                Borrar asignatura
              </ConfirmButton>
            </form>
          </Disclosure>
        </section>
      </div>
    </>
  );
}

function TopicRow({ topic, siblings, parentOptions }: { topic: TopicNode; siblings: TopicNode[]; parentOptions: TopicNode[] }) {
  const ordered = siblings.slice().sort((a, b) => a.position - b.position);
  const isFirst = ordered[0]?.id === topic.id;
  const isLast = ordered[ordered.length - 1]?.id === topic.id;

  return (
    <li className="flex items-start gap-1 py-2 pr-2" style={{ paddingLeft: `${0.75 + topic.depth * 1.25}rem` }}>
      <details className="group min-w-0 flex-1">
        <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className={`block truncate ${topic.depth === 0 ? "font-medium" : ""}`}>{topic.name}</span>
            <span className="block text-xs text-muted">
              {TOPIC_KIND_LABELS[topic.kind]}
              {topic.estimatedHours ? ` · ${topic.estimatedHours} h` : ""}
            </span>
          </span>
          <span className={buttonClass.icon} title="Editar">
            <Pencil className="size-4" aria-hidden />
            <span className="sr-only">Editar {topic.name}</span>
          </span>
        </summary>
        <div className="mt-3 flex flex-col gap-4 pb-2">
          <ActionForm action={updateTopicAction} submitLabel="Guardar tema" successMessage="Guardado.">
            <input type="hidden" name="id" value={topic.id} />
            <TopicFormFields subjectId={topic.subjectId} parentOptions={parentOptions} topic={topic} />
          </ActionForm>
          <form action={deleteTopicAction}>
            <input type="hidden" name="id" value={topic.id} />
            <ConfirmButton
              message={`¿Borrar "${topic.name}"${topic.children.length ? " y sus subtemas" : ""}? Las preguntas y documentos asociados se quedarán sin tema.`}
            >
              <Trash2 className="size-4" /> Borrar tema
            </ConfirmButton>
          </form>
        </div>
      </details>
      <form action={moveTopicAction}>
        <input type="hidden" name="id" value={topic.id} />
        <input type="hidden" name="direction" value="up" />
        <button type="submit" disabled={isFirst} className={buttonClass.icon} title="Subir" aria-label={`Subir ${topic.name}`}>
          <ArrowUp className="size-4" />
        </button>
      </form>
      <form action={moveTopicAction}>
        <input type="hidden" name="id" value={topic.id} />
        <input type="hidden" name="direction" value="down" />
        <button type="submit" disabled={isLast} className={buttonClass.icon} title="Bajar" aria-label={`Bajar ${topic.name}`}>
          <ArrowDown className="size-4" />
        </button>
      </form>
    </li>
  );
}
