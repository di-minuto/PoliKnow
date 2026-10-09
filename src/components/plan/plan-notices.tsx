import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { Assessment, Subject } from "@/domain/academic/types";
import type { PlanWarning } from "@/domain/scheduler/plan";
import { minutesLabel } from "./plan-format";

/** Por qué el plan no cubre algo y qué hacer. */
export function PlanNotices({
  warnings,
  notices,
  assessments,
  subjects,
  availabilityTotal,
}: {
  warnings: PlanWarning[];
  notices: { assessment: Assessment; reason: "no_date" | "no_topics" }[];
  assessments: Assessment[];
  subjects: Subject[];
  availabilityTotal: number;
}) {
  const name = (a: Assessment) => {
    const s = subjects.find((x) => x.id === a.subjectId);
    return `${s?.code ?? s?.name ?? ""} · ${a.name}`;
  };
  const items: { key: string; text: React.ReactNode }[] = [];
  if (availabilityTotal === 0) {
    items.push({
      key: "availability",
      text: (
        <>
          No has indicado cuántas horas puedes estudiar.{" "}
          <Link href="/ajustes" className="underline">
            Ponlas en Ajustes
          </Link>{" "}
          para que el plan pueda repartir el trabajo.
        </>
      ),
    });
  }
  for (const w of warnings) {
    const a = assessments.find((x) => x.id === w.assessmentId);
    if (!a) continue;
    items.push({
      key: `w-${a.id}`,
      text: (
        <>
          No da tiempo a todo antes de <strong>{name(a)}</strong>: faltan unas {minutesLabel(w.missingMinutes)}. Añade horas en{" "}
          <Link href="/ajustes" className="underline">
            Ajustes
          </Link>{" "}
          o baja las horas estimadas de algún tema.
        </>
      ),
    });
  }
  for (const n of notices) {
    items.push({
      key: `n-${n.assessment.id}`,
      text: (
        <>
          <Link href={`/asignaturas/${n.assessment.subjectId}/evaluaciones/${n.assessment.id}`} className="font-semibold underline">
            {name(n.assessment)}
          </Link>{" "}
          {n.reason === "no_date" ? "no tiene fecha: pónsela para planificarlo." : "no tiene temas: elige qué temas entran."}
        </>
      ),
    });
  }
  if (items.length === 0) return null;
  return (
    <ul aria-label="Avisos del plan" className="flex flex-col gap-2">
      {items.map((i) => (
        <li key={i.key} className="flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{i.text}</span>
        </li>
      ))}
    </ul>
  );
}
