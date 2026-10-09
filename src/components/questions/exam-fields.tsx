"use client";

import { useState } from "react";
import { Field } from "@/components/ui/field";
import { inputClass } from "@/components/ui/styles";
import type { OfficialExam } from "@/domain/questions/types";

export type ExamFieldOptions = {
  subjects: { id: string; label: string }[];
  assessments: { id: string; subjectId: string; name: string }[];
  documents: { id: string; subjectId: string; title: string }[];
};

const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

/** Campos de un examen oficial. La asignatura solo se elige al crearlo. */
export function ExamFields({ options, values }: { options: ExamFieldOptions; values?: OfficialExam }) {
  const [subjectId, setSubjectId] = useState(values?.subjectId ?? options.subjects[0]?.id ?? "");
  const assessments = options.assessments.filter((a) => a.subjectId === subjectId);
  const documents = options.documents.filter((d) => d.subjectId === subjectId);

  return (
    <>
      {values ? (
        <input type="hidden" name="subjectId" value={values.subjectId} />
      ) : (
        <Field label="Asignatura">
          <select name="subjectId" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={inputClass}>
            {options.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Título">
        <input name="title" required maxLength={200} defaultValue={values?.title} placeholder="Primer parcial enero 2025" className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Año">
          <input name="year" type="number" inputMode="numeric" min={1990} max={2100} defaultValue={values?.year ?? ""} className={inputClass} />
        </Field>
        <Field label="Convocatoria">
          <input name="examSession" maxLength={40} defaultValue={values?.examSession ?? ""} placeholder="enero" className={inputClass} />
        </Field>
        <Field label="Fecha">
          <input name="examDate" type="date" defaultValue={values?.examDate ?? ""} className={inputClass} />
        </Field>
        <Field label="Duración (min)">
          <input name="durationMinutes" type="number" min={1} max={600} defaultValue={values?.durationMinutes ?? ""} className={inputClass} />
        </Field>
        <Field label="Puntos totales">
          <input name="totalPoints" inputMode="decimal" defaultValue={num(values?.totalPoints)} placeholder="10" className={inputClass} />
        </Field>
        <Field label="Resta por fallo" hint="De 0 a 1 (p. ej. 0,33).">
          <input
            name="wrongAnswerPenalty"
            inputMode="decimal"
            defaultValue={num(values?.rules.wrongAnswerPenalty)}
            className={inputClass}
          />
        </Field>
      </div>
      <div key={subjectId} className="grid gap-4 sm:grid-cols-3">
        <Field label="Evaluación">
          <select name="assessmentId" defaultValue={values?.assessmentId ?? ""} className={inputClass}>
            <option value="">Sin indicar</option>
            {assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="PDF del enunciado">
          <select name="documentId" defaultValue={values?.documentId ?? ""} className={inputClass}>
            <option value="">Ninguno</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="PDF de soluciones">
          <select name="solutionDocumentId" defaultValue={values?.solutionDocumentId ?? ""} className={inputClass}>
            <option value="">Ninguno</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Instrucciones (opcional)">
        <textarea name="instructions" rows={2} maxLength={5000} defaultValue={values?.instructions ?? ""} className={inputClass} />
      </Field>
    </>
  );
}
