import { Field } from "@/components/ui/field";
import { inputClass } from "@/components/ui/styles";
import type { TopicNode } from "@/domain/academic/logic";
import { TOPIC_KINDS, TOPIC_KIND_LABELS } from "@/domain/academic/schemas";
import type { Topic } from "@/domain/academic/types";

/**
 * Campos de crear/editar tema. `parentOptions` ya viene sin el propio tema
 * ni sus descendientes, para que no se pueda crear un ciclo.
 */
export function TopicFormFields({
  subjectId,
  parentOptions,
  topic,
}: {
  subjectId: string;
  parentOptions: TopicNode[];
  topic?: Topic;
}) {
  return (
    <>
      <input type="hidden" name="subjectId" value={subjectId} />
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field label="Nombre">
          <input name="name" required maxLength={150} defaultValue={topic?.name} className={inputClass} placeholder="Tema 2: OpenMP" />
        </Field>
        <Field label="Tipo">
          <select name="kind" defaultValue={topic?.kind ?? "theory"} className={inputClass}>
            {TOPIC_KINDS.map((k) => (
              <option key={k} value={k}>
                {TOPIC_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field label="Dentro de" hint="Déjalo vacío para un tema principal; elige uno para crear un subtema.">
          <select name="parentId" defaultValue={topic?.parentId ?? ""} className={inputClass}>
            <option value="">— Tema principal —</option>
            {parentOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {"  ".repeat(t.depth)}
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Horas estimadas">
          <input
            name="estimatedHours"
            type="number"
            min={0}
            max={500}
            step={0.5}
            defaultValue={topic?.estimatedHours ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Descripción (opcional)">
        <textarea name="description" rows={2} maxLength={2000} defaultValue={topic?.description ?? ""} className={inputClass} />
      </Field>
    </>
  );
}
