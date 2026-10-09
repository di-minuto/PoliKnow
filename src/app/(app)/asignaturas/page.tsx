import type { Metadata } from "next";
import Link from "next/link";
import { CountdownBadge } from "@/components/academic/countdown-badge";
import { CourseFormFields } from "@/components/academic/course-form-fields";
import { SubjectFormFields } from "@/components/academic/subject-form-fields";
import { PageHeader } from "@/components/layout/page-header";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Disclosure } from "@/components/ui/disclosure";
import { cardClass } from "@/components/ui/styles";
import type { Assessment } from "@/domain/academic/types";
import { daysUntil } from "@/lib/dates";
import {
  createCourseAction,
  createSubjectAction,
  deleteCourseAction,
  updateCourseAction,
} from "@/server/actions/academic";
import { getProfile } from "@/server/profile";
import { listAssessments, listCourses, listSubjects } from "@/server/repositories/academic";

export const metadata: Metadata = { title: "Asignaturas" };

export default async function SubjectsPage() {
  const [courses, subjects, assessments, profile] = await Promise.all([
    listCourses(),
    listSubjects(),
    listAssessments(),
    getProfile(),
  ]);

  if (courses.length === 0) {
    return (
      <>
        <PageHeader title="Asignaturas" subtitle="Empieza creando tu curso; luego añadirás sus asignaturas." />
        <section className={`${cardClass} p-5`}>
          <ActionForm action={createCourseAction} submitLabel="Crear curso">
            <CourseFormFields />
          </ActionForm>
        </section>
      </>
    );
  }

  const now = new Date();
  const nextExam = (subjectId: string): Assessment | undefined =>
    assessments.find(
      (a) => a.subjectId === subjectId && a.status === "upcoming" && a.examAt && daysUntil(a.examAt, now, profile.timezone) >= 0,
    );

  return (
    <>
      <PageHeader title="Asignaturas" />

      <div className="flex flex-col gap-8">
        {courses.map((course) => {
          const courseSubjects = subjects.filter((s) => s.courseId === course.id);
          return (
            <section key={course.id}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                {course.name}
                {course.academicYear && ` · ${course.academicYear}`}
              </h2>
              {courseSubjects.length === 0 ? (
                <p className="text-sm text-muted">Este curso aún no tiene asignaturas.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {courseSubjects.map((s) => {
                    const exam = nextExam(s.id);
                    return (
                      <li key={s.id}>
                        <Link
                          href={`/asignaturas/${s.id}`}
                          className={`${cardClass} flex items-center gap-3 p-4 hover:border-primary`}
                        >
                          <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{s.code ?? s.name}</span>
                            {s.code && <span className="block truncate text-sm text-muted">{s.name}</span>}
                            {exam && <span className="block truncate text-xs text-muted">Próximo: {exam.name}</span>}
                          </span>
                          {exam?.examAt && <CountdownBadge days={daysUntil(exam.examAt, now, profile.timezone)} />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}

        <div className="flex flex-col gap-3">
          <Disclosure summary="Nueva asignatura" defaultOpen={subjects.length === 0}>
            <ActionForm action={createSubjectAction} submitLabel="Crear asignatura">
              <SubjectFormFields courses={courses} />
            </ActionForm>
          </Disclosure>

          <Disclosure summary="Cursos">
            <div className="flex flex-col gap-6">
              {courses.map((course) => (
                <div key={course.id} className="flex flex-col gap-3">
                  <ActionForm action={updateCourseAction} submitLabel="Guardar curso" successMessage="Guardado.">
                    <input type="hidden" name="id" value={course.id} />
                    <CourseFormFields course={course} />
                  </ActionForm>
                  <form action={deleteCourseAction}>
                    <input type="hidden" name="id" value={course.id} />
                    <ConfirmButton message={`¿Borrar "${course.name}" con TODAS sus asignaturas, temas y preguntas? No se puede deshacer.`}>
                      Borrar curso
                    </ConfirmButton>
                  </form>
                </div>
              ))}
              <div className="border-t border-border pt-4">
                <p className="mb-3 text-sm font-medium">Añadir otro curso</p>
                <ActionForm action={createCourseAction} submitLabel="Crear curso" resetOnSuccess>
                  <CourseFormFields />
                </ActionForm>
              </div>
            </div>
          </Disclosure>
        </div>
      </div>
    </>
  );
}
