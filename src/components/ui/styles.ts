/** Clases compartidas para controles de formulario. */
export const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export const buttonClass = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium disabled:opacity-60",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-danger/40 px-4 py-2.5 text-sm font-medium text-danger disabled:opacity-60",
  icon: "inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-primary-soft hover:text-foreground disabled:opacity-30",
} as const;

export const cardClass = "rounded-2xl border border-border bg-surface";
