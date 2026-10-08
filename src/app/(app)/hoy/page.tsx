import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { formatDayHeading } from "@/lib/dates";
import { getProfile } from "@/server/profile";

export const metadata: Metadata = { title: "Hoy" };

export default async function TodayPage() {
  const profile = await getProfile();
  const heading = formatDayHeading(new Date(), profile.timezone);

  return (
    <>
      <PageHeader
        title="Hoy"
        subtitle={<span className="first-letter:uppercase">{heading}</span>}
      />

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold">Todavía no hay plan de estudio</h2>
        <p className="mt-2 text-sm text-muted">
          Cuando añadas tus asignaturas, temas y fechas de examen, aquí aparecerán las tareas de cada día con su
          tiempo estimado y los repasos pendientes.
        </p>
        <Link
          href="/asignaturas"
          className="mt-4 inline-block rounded-lg bg-primary-soft px-4 py-2 text-sm font-semibold text-primary"
        >
          Configurar asignaturas
        </Link>
      </section>

      <button
        type="button"
        disabled
        className="mt-6 w-full rounded-xl bg-primary px-4 py-4 text-lg font-bold text-primary-foreground disabled:opacity-50"
      >
        EMPEZAR SESIÓN
      </button>
    </>
  );
}
