import { Field } from "@/components/ui/field";
import { LevelSelect } from "@/components/ui/level-select";
import { inputClass } from "@/components/ui/styles";
import { ASSESSMENT_STATUSES, ASSESSMENT_STATUS_LABELS } from "@/domain/academic/schemas";
import type { Assessment, CatalogEntry } from "@/domain/academic/types";
import { utcToZonedLocal } from "@/lib/dates";

export function AssessmentFormFields({
  subjectId,
  types,
  timezone,
  assessment,
}: {
  subjectId: string;
  types: CatalogEntry[];
  timezone: string;
  assessment?: Assessment;
}) {
  return (
    <>
      <input type="hidden" name="subjectId" value={subjectId} />
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <Field label="Nombre">
          <input name="name" required maxLength={100} defaultValue={assessment?.name} className={inputClass} placeholder="Parcial 1" />
        </Field>
        <Field label="Tipo">
          <select name="assessmentType" defaultValue={assessment?.assessmentType ?? "partial"} className={inputClass}>
            {types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha y hora del examen">
          <input
            name="examAtLocal"
            type="datetime-local"
            defaultValue={assessment?.examAt ? utcToZonedLocal(assessment.examAt, timezone) : ""}
            className={inputClass}
          />
        </Field>
        <Field label="Duración (minutos)">
          <input
            name="durationMinutes"
            type="number"
            min={1}
            max={600}
            defaultValue={assessment?.durationMinutes ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Importancia">
          <LevelSelect name="importance" defaultValue={assessment?.importance} />
        </Field>
        <Field label="Dificultad que le ves">
          <LevelSelect name="perceivedDifficulty" defaultValue={assessment?.perceivedDifficulty} allowEmpty />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Peso en la nota final (%)">
          <input
            name="gradeWeight"
            type="number"
            min={0}
            max={100}
            step={0.5}
            defaultValue={assessment?.gradeWeight ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Estado">
          <select name="status" defaultValue={assessment?.status ?? "upcoming"} className={inputClass}>
            {ASSESSMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ASSESSMENT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </>
  );
}
