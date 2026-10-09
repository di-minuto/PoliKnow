/** Esqueleto mientras carga una página: en el móvil, la navegación responde al instante. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando" className="flex animate-pulse flex-col gap-4">
      <div className="h-8 w-48 rounded-lg bg-border/70" />
      <div className="h-4 w-72 max-w-full rounded bg-border/50" />
      <div className="mt-2 h-28 rounded-2xl bg-border/50" />
      <div className="h-20 rounded-2xl bg-border/40" />
      <div className="h-20 rounded-2xl bg-border/30" />
    </div>
  );
}
