import type { Metadata } from "next";
import Link from "next/link";
import { Check, GraduationCap, RefreshCw, SkipForward } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PlanNotices } from "@/components/plan/plan-notices";
import { minutesLabel, taskLabel } from "@/components/plan/plan-format";
import { SubmitButton } from "@/components/ui/action-form";
import { buttonClass, cardClass } from "@/components/ui/styles";
import { addDays, weekdayOf } from "@/domain/scheduler/plan";
import { formatDayHeading, toLocalDayKey } from "@/lib/dates";
import { replanAction, skipTaskAction } from "@/server/actions/planning";
import { replan } from "@/server/planner";
import { listTasks } from "@/server/repositories/planning";

export const metadata: Metadata = { title: "Plan de estudio" };

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const { dias } = await searchParams;
  const span = dias === "todo" ? 120 : 14;
  const ctx = await replan();
  const { today } = ctx;
  const until = addDays(today, span - 1);
  const tasks = (await listTasks(today, until)).filter((t) => t.status !== "rescheduled");
  const subjectById = new Map(ctx.subjects.map((s) => [s.id, s]));
  const topicName = new Map(ctx.topics.map((t) => [t.id, t.name]));
  const subjectLabel = (id: string) => subjectById.get(id)?.code ?? subjectById.get(id)?.name ?? "";
  const examsByDay = new Map<string, { subjectId: string; name: string }[]>();
  for (const a of ctx.assessments) {
    if (a.status !== "upcoming" || !a.examAt) continue;
    const day = toLocalDayKey(new Date(a.examAt), ctx.timezone);
    examsByDay.set(day, [...(examsByDay.get(day) ?? []), { subjectId: a.subjectId, name: a.name }]);
  }
  const lastExam = ctx.input.assessments.reduce((max, a) => (a.examDay > max ? a.examDay : max), today);
  const lastShown = until < lastExam ? until : lastExam;
  const days: string[] = [];
  for (let d = today; d <= lastShown; d = addDays(d, 1)) days.push(d);

  // Resumen por evaluación: temario cubierto (ponderado) y trabajo planificado.
  const summaries = ctx.input.assessments.map((a) => {
    const total = a.topics.reduce((s, t) => s + t.weight, 0) || 1;
    const covered = a.topics.reduce((s, t) => {
      const p = ctx.input.progress.get(t.topicId);
      return s + (t.weight * Math.max(p?.coverage ?? 0, 0.8 * (p?.mastery ?? 0))) / total;
    }, 0);
    const assessment = ctx.assessments.find((x) => x.id === a.id)!;
    return { a, assessment, covered, daysLeft: Math.round((Date.parse(a.examDay) - Date.parse(today)) / 86_400_000) };
  });

  return (
    <>
      <PageHeader
        title="Plan de estudio"
        subtitle="Se recalcula solo cada día y al cerrar cada sesión: lo que no hagas se reparte en los días siguientes."
        actions={
          <form action={replanAction}>
            <SubmitButton className={buttonClass.secondary}>
              <RefreshCw className="size-4" aria-hidden />
              Recalcular
            </SubmitButton>
          </form>
        }
      />

      <div className="flex flex-col gap-6">
        <PlanNotices
          warnings={ctx.result.warnings}
          notices={ctx.notices}
          assessments={ctx.assessments}
          subjects={ctx.subjects}
          availabilityTotal={ctx.availabilityTotal}
        />

        {summaries.length > 0 && (
          <section aria-label="Exámenes planificados" className="grid gap-2 sm:grid-cols-2">
            {summaries.map(({ a, assessment, covered, daysLeft }) => (
              <div key={a.id} className={`${cardClass} p-4`}>
                <p className="flex items-center gap-2 font-semibold">
                  <span className="size-3 rounded-full" style={{ backgroundColor: subjectById.get(a.subjectId)?.color }} aria-hidden />
                  {subjectLabel(a.subjectId)} · {assessment.name}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {daysLeft === 1 ? "Mañana" : `En ${daysLeft} días`} · temario visto {Math.round(covered * 100)}%
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
                  <div className="h-full bg-primary" style={{ width: `${Math.round(covered * 100)}%` }} />
                </div>
              </div>
            ))}
          </section>
        )}

        {days.length === 0 || (tasks.length === 0 && examsByDay.size === 0) ? (
          <p className={`${cardClass} p-5 text-muted`}>
            No hay nada que planificar. Añade fechas y temas a tus exámenes y tus horas disponibles en{" "}
            <Link href="/ajustes" className="text-primary underline">
              Ajustes
            </Link>
            .
          </p>
        ) : (
          <ol className="flex flex-col gap-3" aria-label="Días">
            {days.map((day) => {
              const own = tasks.filter((t) => t.day === day);
              const exams = examsByDay.get(day) ?? [];
              const planned = own.filter((t) => t.status !== "skipped").reduce((s, t) => s + t.minutes, 0);
              const capacity = ctx.input.blockedDays.has(day) ? 0 : (ctx.input.availability[weekdayOf(day)] ?? 0);
              const heading = day === today ? "Hoy" : day === addDays(today, 1) ? "Mañana" : formatDayHeading(new Date(`${day}T12:00:00Z`), "UTC");
              return (
                <li key={day} className={`${cardClass} p-4`} aria-label={heading}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-semibold first-letter:uppercase">{heading}</h2>
                    <span className="text-sm text-muted">
                      {ctx.input.blockedDays.has(day)
                        ? "Sin estudio"
                        : capacity === 0 && own.length === 0
                          ? "Libre"
                          : `${minutesLabel(planned)}${capacity ? ` de ${minutesLabel(capacity)}` : ""}`}
                    </span>
                  </div>
                  {exams.map((e) => (
                    <p key={e.name} className="mt-2 flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-1.5 text-sm font-semibold text-danger">
                      <GraduationCap className="size-4" aria-hidden />
                      Examen: {subjectLabel(e.subjectId)} · {e.name}
                    </p>
                  ))}
                  {own.length > 0 && (
                    <ul className="mt-2 flex flex-col text-sm">
                      {own.map((t) => (
                        <li key={t.id} className="flex items-center gap-2">
                          <Link
                            href={`/sesion/${t.id}`}
                            className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 hover:bg-primary-soft/60 ${t.status === "skipped" ? "text-muted line-through" : ""}`}
                          >
                            {t.status === "done" ? (
                              <Check className="size-4 shrink-0 text-success" aria-label="Hecha" />
                            ) : (
                              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: subjectById.get(t.subjectId)?.color }} aria-hidden />
                            )}
                            <span className="min-w-0 truncate">
                              <span className="font-medium">{subjectLabel(t.subjectId)}</span>{" "}
                              {t.topicId ? topicName.get(t.topicId) : ctx.assessments.find((a) => a.id === t.assessmentId)?.name} · {taskLabel(t)}
                            </span>
                          </Link>
                          {t.status === "pending" && (
                            <form action={skipTaskAction}>
                              <input type="hidden" name="id" value={t.id} />
                              <input type="hidden" name="back" value="/plan" />
                              <button type="submit" className={buttonClass.icon} title="Saltar" aria-label={`Saltar ${taskLabel(t)}`}>
                                <SkipForward className="size-4" aria-hidden />
                              </button>
                            </form>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {span < 120 && lastExam > until && (
          <Link href="/plan?dias=todo" className="text-center text-sm text-primary underline">
            Ver hasta el último examen
          </Link>
        )}
      </div>
    </>
  );
}
