import type { Metadata } from "next";
import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import { CountdownBadge } from "@/components/academic/countdown-badge";
import { PageHeader } from "@/components/layout/page-header";
import { minutesLabel } from "@/components/plan/plan-format";
import { DailyBars, GradeLine, ProgressBar } from "@/components/stats/charts";
import { Disclosure } from "@/components/ui/disclosure";
import { cardClass } from "@/components/ui/styles";
import { READINESS_LABELS, READINESS_WEIGHTS, pct, type ReadinessComponent } from "@/domain/stats/stats";
import { loadStats } from "@/server/stats";

export const metadata: Metadata = { title: "Estadísticas" };

const grade = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
const hours = (minutes: number) => (minutes < 60 ? `${Math.round(minutes)} min` : `${grade(minutes / 60)} h`);

function Kpi({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  return (
    <div className={`${cardClass} p-4`} aria-label={`${label}: ${value}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function StatsPage() {
  const stats = await loadStats();
  const { attempts } = stats;
  const subjectLabel = (s: { code: string | null; name: string } | undefined) => s?.code ?? s?.name ?? "";
  const subjectById = new Map(stats.subjects.map((r) => [r.subject.id, r.subject]));

  return (
    <>
      <PageHeader title="Estadísticas" subtitle="Cómo vas: horas, notas, temario y preparación de cada examen." />

      <div className="flex flex-col gap-8">
        <section aria-label="Resumen" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi label="Esta semana" value={hours(stats.weekMinutes)} hint="últimos 7 días" />
          <Kpi label="En total" value={hours(stats.totalMinutes)} hint="horas estudiadas" />
          <Kpi label="Tests hechos" value={String(attempts.count)} />
          <Kpi
            label="Nota media"
            value={attempts.average === null ? "—" : grade(attempts.average)}
            hint={
              attempts.trend === null ? undefined : (
                <span className={`inline-flex items-center gap-1 ${attempts.trend >= 0 ? "text-success" : "text-danger"}`}>
                  {attempts.trend >= 0 ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}
                  {attempts.trend >= 0 ? "+" : ""}
                  {grade(attempts.trend)} en los últimos 5
                </span>
              )
            }
          />
          <Kpi
            label="Aciertos"
            value={stats.accuracy === null ? "—" : `${pct(stats.accuracy)}%`}
            hint={stats.answered ? `${stats.answered} respuestas` : undefined}
          />
        </section>

        <Section title="Preparación estimada">
          {stats.assessments.length === 0 ? (
            <p className={`${cardClass} p-5 text-muted`}>
              No hay exámenes pendientes. Añádelos desde{" "}
              <Link href="/asignaturas" className="text-primary underline">
                Asignaturas
              </Link>
              .
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {stats.assessments.map(({ assessment, subject, daysLeft, readiness, examCount }) => {
                  const name = `${subjectLabel(subject)} ${assessment.name}`;
                  const score = readiness ? pct(readiness.score) : null;
                  return (
                    <article key={assessment.id} className={`${cardClass} flex flex-col gap-3 p-4`} aria-label={`Preparación ${name}`}>
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/asignaturas/${assessment.subjectId}/evaluaciones/${assessment.id}`}
                          className="flex items-center gap-2 font-semibold hover:underline"
                        >
                          <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: subject?.color }} aria-hidden />
                          {name}
                        </Link>
                        {daysLeft !== null && <CountdownBadge days={daysLeft} />}
                      </div>
                      {readiness ? (
                        <>
                          <p>
                            <span className="text-3xl font-bold">{score}%</span>{" "}
                            <span className="text-sm text-muted">preparación estimada</span>
                          </p>
                          <div className="flex flex-col gap-2">
                            {(Object.keys(READINESS_WEIGHTS) as ReadinessComponent[]).map((key) => (
                              <ProgressBar
                                key={key}
                                value={readiness.components[key]}
                                label={`${READINESS_LABELS[key]} (${Math.round(READINESS_WEIGHTS[key] * 100)}%)`}
                              />
                            ))}
                          </div>
                          {examCount === 0 && (
                            <p className="text-xs text-muted">
                              Aún sin simulacros de este examen: haz uno para afinar la estimación.
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted">
                          Indica qué temas entran en este examen para estimar tu preparación.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
              <p className="text-xs text-muted">
                La preparación combina tu dominio en los tests, la nota de los últimos simulacros, el temario estudiado y si
                llevas los repasos al día, ponderado por el peso de cada tema. Lo que no tiene datos no cuenta.
              </p>
            </>
          )}
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Horas estudiadas">
            <div className={`${cardClass} p-4`}>
              {stats.daily.some((d) => d.minutes > 0) ? (
                <DailyBars data={stats.daily} />
              ) : (
                <p className="text-sm text-muted">Aún no hay sesiones registradas en las últimas 4 semanas.</p>
              )}
            </div>
          </Section>

          <Section title="Evolución de notas">
            <div className={`${cardClass} p-4`}>
              {attempts.series.length > 0 ? (
                <>
                  <GradeLine points={attempts.series} />
                  <p className="mt-2 text-xs text-muted">{attempts.series.length === 1 ? "Tu primer test." : `Últimos ${attempts.series.length} tests.`} Punto relleno: simulacro o examen.</p>
                </>
              ) : (
                <p className="text-sm text-muted">
                  Haz algún{" "}
                  <Link href="/tests" className="text-primary underline">
                    test
                  </Link>{" "}
                  para ver tu evolución.
                </p>
              )}
            </div>
          </Section>
        </div>

        <Section title="Progreso por asignatura">
          {stats.subjects.length === 0 ? (
            <p className={`${cardClass} p-5 text-muted`}>Aún no tienes asignaturas.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {stats.subjects.map((row) => (
                <Disclosure
                  key={row.subject.id}
                  summary={
                    <span className="inline-flex w-[calc(100%-1.5rem)] flex-col gap-2 align-top">
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <span className="size-3 rounded-full" style={{ backgroundColor: row.subject.color }} aria-hidden />
                          {row.subject.name}
                        </span>
                        <span className="text-xs font-normal text-muted">{minutesLabel(row.minutes)}</span>
                      </span>
                      <span className="grid gap-2 font-normal sm:grid-cols-2">
                        <ProgressBar value={row.coverage} label={`Temario visto · ${subjectLabel(row.subject)}`} />
                        <ProgressBar value={row.mastery} label={`Dominio · ${subjectLabel(row.subject)}`} tone="success" />
                      </span>
                    </span>
                  }
                >
                  {row.topics.length === 0 ? (
                    <p className="text-sm text-muted">
                      Sin temas.{" "}
                      <Link href={`/asignaturas/${row.subject.id}`} className="text-primary underline">
                        Añádelos
                      </Link>
                      .
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {row.topics.map((t) => (
                        <li key={t.topic.id} className="flex flex-col gap-1.5">
                          <p className="text-sm font-medium">
                            {t.topic.name}
                            {t.answered > 0 && (
                              <span className="ml-2 text-xs font-normal text-muted">
                                {t.correct}/{t.answered} aciertos
                              </span>
                            )}
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <ProgressBar value={t.coverage} label={`Temario visto · ${t.topic.name}`} />
                            <ProgressBar value={t.mastery} label={`Dominio · ${t.topic.name}`} tone="success" />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Disclosure>
              ))}
            </div>
          )}
        </Section>

        <div className="grid gap-6 sm:grid-cols-2">
          <Section title="Temas fuertes">
            <TopicList
              items={stats.strong}
              empty="Cuando aciertes al menos el 70% de un tema (con 3 respuestas o más) aparecerá aquí."
              subjectLabel={(id) => subjectLabel(subjectById.get(id))}
            />
          </Section>
          <Section title="Temas débiles">
            <TopicList
              items={stats.weak}
              empty="Ningún tema por debajo del 50% de dominio. ¡Bien!"
              subjectLabel={(id) => subjectLabel(subjectById.get(id))}
              practice
            />
          </Section>
        </div>
      </div>
    </>
  );
}

function TopicList({
  items,
  empty,
  subjectLabel,
  practice = false,
}: {
  items: { topicId: string; mastery: number; answered: number; topic: { id: string; name: string; subjectId: string } }[];
  empty: string;
  subjectLabel: (subjectId: string) => string;
  practice?: boolean;
}) {
  if (items.length === 0) return <p className={`${cardClass} p-4 text-sm text-muted`}>{empty}</p>;
  return (
    <ul className={`${cardClass} divide-y divide-border`}>
      {items.map((s) => (
        <li key={s.topicId} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
          <span className="min-w-0">
            <span className="font-medium">{subjectLabel(s.topic.subjectId)}</span> {s.topic.name}
            <span className="block text-xs text-muted">
              {pct(s.mastery)}% dominio · {s.answered} respuestas
            </span>
          </span>
          {practice && (
            <Link
              href={`/tests?asignatura=${s.topic.subjectId}&tema=${s.topicId}`}
              className="shrink-0 text-primary underline"
              aria-label={`Practicar ${s.topic.name}`}
            >
              Practicar
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
