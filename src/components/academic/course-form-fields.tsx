import { Field } from "@/components/ui/field";
import { inputClass } from "@/components/ui/styles";
import type { Course } from "@/domain/academic/types";

export function CourseFormFields({ course }: { course?: Course }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
      <Field label="Nombre del curso">
        <input name="name" required maxLength={100} defaultValue={course?.name}
          placeholder="3º Ingeniería Informática" className={inputClass} />
      </Field>
      <Field label="Año académico">
        <input name="academicYear" maxLength={20} defaultValue={course?.academicYear ?? ""}
          placeholder="2026-27" className={inputClass} />
      </Field>
    </div>
  );
}
