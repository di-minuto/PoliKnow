import "server-only";
import type { ExamFieldOptions } from "@/components/questions/exam-fields";
import { listAssessments } from "@/server/repositories/academic";
import { listDocuments } from "@/server/repositories/documents";
import { loadLibraryOptions } from "./library-options";

export async function loadExamOptions(): Promise<ExamFieldOptions> {
  const [library, assessments, documents] = await Promise.all([loadLibraryOptions(), listAssessments(), listDocuments()]);
  const examTypes = new Set(library.types.filter((t) => t.isExam).map((t) => t.code));
  return {
    subjects: library.subjects,
    assessments: assessments.map((a) => ({ id: a.id, subjectId: a.subjectId, name: a.name })),
    // Primero los documentos de tipo examen.
    documents: [...documents]
      .sort((a, b) => Number(examTypes.has(b.documentType)) - Number(examTypes.has(a.documentType)))
      .map((d) => ({ id: d.id, subjectId: d.subjectId, title: d.title })),
  };
}
