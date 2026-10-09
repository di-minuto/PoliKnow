"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Field } from "@/components/ui/field";
import { LevelSelect } from "@/components/ui/level-select";
import { buttonClass, inputClass } from "@/components/ui/styles";
import { bodyKind, optionLetter } from "@/domain/questions/body";
import { MANUAL_SOURCE_TYPES } from "@/domain/questions/schemas";
import { SOURCE_TYPE_LABELS, type Question, type SourceType } from "@/domain/questions/types";
import type { QuestionOptions } from "./options";

type Values = Partial<Question>;
type Option = { key: number; text: string; correct: boolean };

const textareaClass = `${inputClass} font-normal leading-relaxed`;
const codeClass = `${inputClass} font-mono text-sm leading-relaxed`;

function initialOptions(values: Values): Option[] {
  const content = values.content as { options?: string[] } | undefined;
  const answer = values.answer as { correct?: number[] } | undefined;
  const options = content?.options?.length ? content.options : ["", "", "", ""];
  return options.map((text, i) => ({ key: i, text, correct: answer?.correct?.includes(i) ?? false }));
}

/** Opciones de tipo test: añadir, quitar y marcar la(s) correcta(s). */
function ChoiceFields({ values }: { values: Values }) {
  const [options, setOptions] = useState<Option[]>(() => initialOptions(values));
  const [multiple, setMultiple] = useState(Boolean((values.content as { multiple?: boolean } | undefined)?.multiple));
  const [nextKey, setNextKey] = useState(options.length);

  const update = (key: number, patch: Partial<Option>) =>
    setOptions((list) =>
      list.map((o) =>
        o.key === key ? { ...o, ...patch } : patch.correct && !multiple ? { ...o, correct: false } : o,
      ),
    );

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Opciones (marca la correcta)</legend>
      {options.map((o, i) => (
        <div key={o.key} className="flex items-center gap-2">
          <input
            type={multiple ? "checkbox" : "radio"}
            name="correct"
            value={i}
            checked={o.correct}
            onChange={(e) => update(o.key, { correct: e.target.checked })}
            aria-label={`Opción ${optionLetter(i)} correcta`}
            className="size-5 shrink-0"
          />
          <span className="w-5 shrink-0 text-sm font-semibold text-muted">{optionLetter(i)}</span>
          <input
            name="option"
            value={o.text}
            onChange={(e) => update(o.key, { text: e.target.value })}
            aria-label={`Opción ${optionLetter(i)}`}
            maxLength={1000}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setOptions((list) => list.filter((x) => x.key !== o.key))}
            disabled={options.length <= 2}
            className={buttonClass.icon}
            aria-label={`Quitar opción ${optionLetter(i)}`}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => {
            setOptions((list) => [...list, { key: nextKey, text: "", correct: false }]);
            setNextKey((k) => k + 1);
          }}
          disabled={options.length >= 10}
          className={buttonClass.secondary}
        >
          <Plus className="size-4" aria-hidden />
          Añadir opción
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="multiple"
            checked={multiple}
            onChange={(e) => {
              setMultiple(e.target.checked);
              if (!e.target.checked) {
                const first = options.findIndex((o) => o.correct);
                setOptions((list) => list.map((o, i) => ({ ...o, correct: i === first })));
              }
            }}
            className="size-4"
          />
          Varias correctas
        </label>
      </div>
    </fieldset>
  );
}

function BodyFields({ questionType, values }: { questionType: string; values: Values }) {
  const kind = bodyKind(questionType);
  const content = (values.questionType === questionType ? values.content : undefined) as Record<string, unknown> | undefined;
  const answer = (values.questionType === questionType ? values.answer : undefined) as Record<string, unknown> | undefined;
  const v = { ...values, content, answer };

  switch (kind) {
    case "choice":
      return <ChoiceFields values={v} />;
    case "true_false":
      return (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Respuesta correcta</legend>
          <div className="flex gap-6">
            {[
              ["true", "Verdadero"],
              ["false", "Falso"],
            ].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tfValue"
                  value={value}
                  defaultChecked={answer?.value === (value === "true")}
                  className="size-5"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      );
    case "short_answer":
      return (
        <Field label="Respuestas aceptadas" hint="Una por línea. Se comparan sin tildes ni mayúsculas.">
          <textarea
            name="accepted"
            rows={3}
            defaultValue={((answer?.accepted as string[]) ?? []).join("\n")}
            className={textareaClass}
          />
        </Field>
      );
    case "numeric":
      return (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Resultado">
            <input
              name="numericValue"
              inputMode="decimal"
              defaultValue={answer?.value !== undefined ? String(answer.value).replace(".", ",") : ""}
              className={inputClass}
            />
          </Field>
          <Field label="Margen ±">
            <input
              name="tolerance"
              inputMode="decimal"
              defaultValue={content?.tolerance ? String(content.tolerance).replace(".", ",") : ""}
              placeholder="0"
              className={inputClass}
            />
          </Field>
          <Field label="Unidad">
            <input name="unit" maxLength={30} defaultValue={(content?.unit as string) ?? ""} placeholder="s, MB…" className={inputClass} />
          </Field>
        </div>
      );
    case "code":
      return (
        <>
          <Field label="Lenguaje">
            <input
              name="language"
              maxLength={40}
              defaultValue={(content?.language as string) ?? ""}
              placeholder="c, java, python…"
              className={inputClass}
            />
          </Field>
          <Field
            label={questionType === "find_errors" ? "Código con errores" : questionType === "code_completion" ? "Código con huecos (___)" : "Código de partida (opcional)"}
          >
            <textarea name="code" rows={8} spellCheck={false} defaultValue={(content?.code as string) ?? ""} className={codeClass} />
          </Field>
          <Field label={questionType === "find_errors" ? "Errores y corrección" : "Solución"}>
            <textarea name="model" rows={8} spellCheck={false} defaultValue={(answer?.model as string) ?? ""} className={codeClass} />
          </Field>
        </>
      );
    default:
      return (
        <Field label="Respuesta modelo" hint="Lo que esperas que respondas; servirá para autoevaluarte.">
          <textarea name="model" rows={6} defaultValue={(answer?.model as string) ?? ""} className={textareaClass} />
        </Field>
      );
  }
}

/**
 * Editor de una pregunta: datos comunes, procedencia y el cuerpo según el
 * tipo. Al cambiar de asignatura se filtran temas, exámenes y documentos.
 */
export function QuestionEditor({ options, values = {} }: { options: QuestionOptions; values?: Values }) {
  const [subjectId, setSubjectId] = useState(values.subjectId ?? options.subjects[0]?.id ?? "");
  const [questionType, setQuestionType] = useState<string>(values.questionType ?? "multiple_choice");
  const [sourceType, setSourceType] = useState<SourceType>(values.sourceType ?? "manual");
  const isAi = values.sourceType === "ai_generated";

  const topics = options.topics.filter((t) => t.subjectId === subjectId);
  const exams = options.exams.filter((e) => e.subjectId === subjectId);
  const documents = options.documents.filter((d) => d.subjectId === subjectId);
  const same = values.subjectId === subjectId;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Asignatura">
          <select name="subjectId" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={inputClass}>
            {options.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo de pregunta">
          <select name="questionType" value={questionType} onChange={(e) => setQuestionType(e.target.value)} className={inputClass}>
            {options.questionTypes.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div key={subjectId} className="grid gap-4 sm:grid-cols-2">
        <Field label="Procedencia">
          {isAi ? (
            <>
              <input type="hidden" name="sourceType" value="ai_generated" />
              <p className="py-2.5 text-sm">
                {SOURCE_TYPE_LABELS.ai_generated} ({values.aiModel})
              </p>
            </>
          ) : (
            <select
              name="sourceType"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as SourceType)}
              className={inputClass}
            >
              {MANUAL_SOURCE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_TYPE_LABELS[s]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Tema">
          <select name="topicId" defaultValue={same ? (values.topicId ?? "") : ""} className={inputClass}>
            <option value="">Sin tema</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {"  ".repeat(t.depth)}
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {sourceType === "official_exam" && !isAi && (
        <div key={`exam-${subjectId}`} className="grid gap-4 rounded-xl bg-amber-50 p-3 sm:grid-cols-[1fr_6rem_6rem] dark:bg-amber-950/40">
          <Field label="Examen oficial">
            <select name="officialExamId" defaultValue={same ? (values.officialExamId ?? "") : ""} className={inputClass} required>
              <option value="" disabled>
                {exams.length ? "Elige el examen" : "Crea antes el examen en Exámenes"}
              </option>
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nº">
            <input
              name="officialPosition"
              type="number"
              min={1}
              max={500}
              defaultValue={values.officialPosition ?? ""}
              placeholder="auto"
              className={inputClass}
            />
          </Field>
          <Field label="Puntos">
            <input name="points" inputMode="decimal" defaultValue={values.points ?? ""} className={inputClass} />
          </Field>
        </div>
      )}

      <Field label="Enunciado" hint="Puedes poner código entre ``` (bloque) o entre ` (en línea).">
        <textarea name="stem" required rows={5} maxLength={20000} defaultValue={values.stem} className={textareaClass} />
      </Field>

      <BodyFields key={questionType} questionType={questionType} values={values} />

      <Field label="Explicación (opcional)">
        <textarea name="explanation" rows={3} defaultValue={values.explanation ?? ""} className={textareaClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Dificultad">
          <LevelSelect name="difficulty" defaultValue={values.difficulty} />
        </Field>
        <Field label="Subtema">
          <input name="subtopic" maxLength={200} defaultValue={values.subtopic ?? ""} className={inputClass} />
        </Field>
        <Field label="Etiquetas" hint="Separadas por comas.">
          <input name="tags" defaultValue={values.tags?.join(", ") ?? ""} className={inputClass} />
        </Field>
      </div>

      <div key={`doc-${subjectId}`} className="grid gap-4 sm:grid-cols-2">
        <Field label="Documento de origen">
          <select name="documentId" defaultValue={same ? (values.documentId ?? "") : ""} className={inputClass}>
            <option value="">Ninguno</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dónde está" hint="P. ej. «pág. 12, ejercicio 3».">
          <input name="sourceRef" maxLength={200} defaultValue={values.sourceRef ?? ""} className={inputClass} />
        </Field>
      </div>

      {sourceType === "official_exam" && (
        <Field label="Texto literal del examen (opcional)">
          <textarea name="originalText" rows={3} defaultValue={values.originalText ?? ""} className={textareaClass} />
        </Field>
      )}

      {values.variantOf && <input type="hidden" name="variantOf" value={values.variantOf} />}
    </>
  );
}
