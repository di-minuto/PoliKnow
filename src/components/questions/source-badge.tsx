import { SOURCE_TYPE_LABELS, type SourceType } from "@/domain/questions/types";

/*
 * La procedencia se ve siempre y con color propio: un examen oficial nunca
 * se confunde con una pregunta generada por IA.
 */
const STYLES: Record<SourceType, string> = {
  official_exam: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  course_material: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  ai_generated: "bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-200",
  manual: "bg-border/60 text-foreground",
};

export function SourceBadge({ source, detail }: { source: SourceType; detail?: string | null }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[source]}`}>
      {SOURCE_TYPE_LABELS[source]}
      {detail ? ` · ${detail}` : ""}
    </span>
  );
}
