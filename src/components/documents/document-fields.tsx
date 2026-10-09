"use client";

import { useState } from "react";
import { Field } from "@/components/ui/field";
import { inputClass } from "@/components/ui/styles";
import type { LibraryOptions } from "./options";

export type DocumentFieldValues = {
  subjectId?: string;
  documentType?: string;
  title?: string;
  year?: number | null;
  examSession?: string | null;
  notes?: string | null;
  topicIds?: string[];
  assessmentIds?: string[];
};

const checkboxRow = "flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-primary-soft";

/**
 * Campos de un documento: asignatura, tipo, título, año/convocatoria (si es un
 * examen), temas y evaluaciones. Al cambiar de asignatura se muestran sus temas.
 */
export function DocumentFields({
  options,
  values = {},
  showTitle = true,
  showNotes = false,
}: {
  options: LibraryOptions;
  values?: DocumentFieldValues;
  showTitle?: boolean;
  showNotes?: boolean;
}) {
  const [subjectId, setSubjectId] = useState(values.subjectId ?? options.subjects[0]?.id ?? "");
  const [documentType, setDocumentType] = useState(values.documentType ?? options.types[0]?.code ?? "");
  const isExam = options.types.find((t) => t.code === documentType)?.isExam ?? false;
  const topics = options.topics.filter((t) => t.subjectId === subjectId);
  const assessments = options.assessments.filter((a) => a.subjectId === subjectId);
  const selectedTopics = new Set(values.subjectId === subjectId ? values.topicIds : []);
  const selectedAssessments = new Set(values.subjectId === subjectId ? values.assessmentIds : []);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Asignatura">
          <select
            name="subjectId"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className={inputClass}
            required
          >
            {options.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo">
          <select
            name="documentType"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className={inputClass}
          >
            {options.types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {showTitle && (
        <Field label="Título">
          <input name="title" required maxLength={200} defaultValue={values.title} className={inputClass} />
        </Field>
      )}

      {isExam && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Año">
            <input
              name="year"
              type="number"
              inputMode="numeric"
              min={1990}
              max={2100}
              defaultValue={values.year ?? ""}
              className={inputClass}
              placeholder="2025"
            />
          </Field>
          <Field label="Convocatoria">
            <input
              name="examSession"
              maxLength={40}
              defaultValue={values.examSession ?? ""}
              className={inputClass}
              placeholder="enero, junio, recuperación…"
            />
          </Field>
        </div>
      )}

      {showNotes && (
        <Field label="Notas">
          <textarea name="notes" maxLength={2000} rows={3} defaultValue={values.notes ?? ""} className={inputClass} />
        </Field>
      )}

      {/* key: al cambiar de asignatura se desmontan las casillas de la anterior. */}
      <div key={subjectId} className="grid gap-4 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">Temas</legend>
          {topics.length === 0 && <p className="text-sm text-muted">Esta asignatura aún no tiene temas.</p>}
          {topics.map((t) => (
            <label key={t.id} className={checkboxRow} style={{ paddingLeft: `${0.5 + t.depth * 1.25}rem` }}>
              <input type="checkbox" name="topic" value={t.id} defaultChecked={selectedTopics.has(t.id)} className="size-4" />
              {t.name}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">Evaluaciones</legend>
          {assessments.length === 0 && <p className="text-sm text-muted">Sin evaluaciones.</p>}
          {assessments.map((a) => (
            <label key={a.id} className={checkboxRow}>
              <input
                type="checkbox"
                name="assessment"
                value={a.id}
                defaultChecked={selectedAssessments.has(a.id)}
                className="size-4"
              />
              {a.name}
            </label>
          ))}
        </fieldset>
      </div>
    </>
  );
}
