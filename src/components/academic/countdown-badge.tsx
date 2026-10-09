import { countdownLabel } from "@/lib/dates";

/** Pastilla con los días que faltan; más llamativa cuanto más cerca. */
export function CountdownBadge({ days }: { days: number }) {
  const tone =
    days < 0
      ? "bg-border/60 text-muted"
      : days <= 7
        ? "bg-danger-soft text-danger"
        : days <= 21
          ? "bg-primary-soft text-primary"
          : "bg-border/60 text-foreground";
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{countdownLabel(days)}</span>;
}
