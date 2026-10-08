import { PageHeader } from "./page-header";

/** Marcador para secciones que se construyen en fases posteriores. */
export function ComingSoon({ title, phase, description }: { title: string; phase: number; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <section className="rounded-2xl border border-dashed border-border bg-surface p-6">
        <p className="text-sm font-semibold text-primary">Fase {phase}</p>
        <p className="mt-2 text-muted">{description}</p>
      </section>
    </>
  );
}
