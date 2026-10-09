import type { Metadata } from "next";
import Link from "next/link";
import { CountdownBadge } from "@/components/academic/countdown-badge";
import { PageHeader } from "@/components/layout/page-header";
import { cardClass } from "@/components/ui/styles";
import { daysUntil, formatDateTime, formatDayHeading } from "@/lib/dates";
import { getProfile } from "@/server/profile";
import { listAssessments, listSubjects } from "@/server/repositories/academic";

export const metadata: Metadata = { title: "Hoy" };

export default async function TodayPage() {
  const [profile, subjects, assessments] = await Promise.all([getProfile(), listSubjects(), listAssessments()]);
  const now = new Date();
  const heading = formatDayHeading(now, profile.timezone);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  const upcoming = assessments
    .filter((a) => a.status === "upcoming" && a.examAt && daysUntil(a.examAt, now, profile.timezone) >= 0)
    .slice(0, 5);

  return (
    <>
      <PageHeader title="Hoy" subtitle={<span className="first-letter:uppercase">{heading}</span>} />

      <div className="flex flex-col gap-6">
        <section className={`${cardClass} p-5`}>
          <h2 className="font-semibold">Plan de hoy</h2>
          <p className="mt-2 text-sm text-muted">
            {subjects.length === 0
              ? "Cuando añadas tus asignaturas, temas y fechas de examen, aquí aparecerán las tareas de cada día."
              : "El planificador automático llega en la Fase 7. Mientras tanto, completa tus temas y fechas de examen."}
          </p>
          {subjects.length === 0 && (
            <Link href="/asignaturas" className="mt-4 inline-block rounded-lg bg-primary-soft px-4 py-2 text-sm font-semibold text-primary">
              Configurar asignaturas
            </Link>
          )}
        </section>

        {upcoming.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Próximos exámenes</h2>
            <ul className="flex flex-col gap-2">
              {upcoming.map((a) => {
                const subject = subjectById.get(a.subjectId);
                return (
                  <li key={a.id}>
                    <Link
                      href={`/asignaturas/${a.subjectId}/evaluaciones/${a.id}`}
                      className={`${cardClass} flex items-center gap-3 p-4 hover:border-primary`}
                    >
                      <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: subject?.color }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {subject?.code ?? subject?.name} · {a.name}
                        </span>
                        <span className="block text-sm text-muted">{formatDateTime(a.examAt!, profile.timezone)}</span>
                      </span>
                      <CountdownBadge days={daysUntil(a.examAt!, now, profile.timezone)} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <button
          type="button"
          disabled
          className="w-full rounded-xl bg-primary px-4 py-4 text-lg font-bold text-primary-foreground disabled:opacity-50"
        >
          EMPEZAR SESIÓN
        </button>
      </div>
    </>
  );
}
