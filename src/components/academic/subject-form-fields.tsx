import { Field } from "@/components/ui/field";
import { LevelSelect } from "@/components/ui/level-select";
import { inputClass } from "@/components/ui/styles";
import type { Course, Subject } from "@/domain/academic/types";

/** Campos comunes de crear/editar asignatura. */
export function SubjectFormFields({ courses, subject }: { courses: Course[]; subject?: Subject }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="Nombre">
          <input name="name" required maxLength={100} defaultValue={subject?.name} className={inputClass} placeholder="Computación Paralela" />
        </Field>
        <Field label="Siglas">
          <input name="code" maxLength={20} defaultValue={subject?.code ?? ""} className={inputClass} placeholder="CPA" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Curso">
          <select name="courseId" defaultValue={subject?.courseId ?? courses[0]?.id} className={inputClass}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dificultad que le ves">
          <LevelSelect name="perceivedDifficulty" defaultValue={subject?.perceivedDifficulty} />
        </Field>
        <Field label="Importancia">
          <LevelSelect name="importance" defaultValue={subject?.importance} />
        </Field>
      </div>
      <Field label="Color">
        <input type="color" name="color" defaultValue={subject?.color ?? "#6366f1"} className="h-10 w-20 rounded-lg border border-border bg-surface" />
      </Field>
    </>
  );
}
