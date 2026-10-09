import "server-only";
import type { QuestionOptions } from "@/components/questions/options";
import { listDocuments } from "@/server/repositories/documents";
import { listOfficialExams, listQuestionTypes } from "@/server/repositories/questions";
import { loadLibraryOptions } from "./library-options";

export async function loadQuestionOptions(): Promise<QuestionOptions> {
  const [library, questionTypes, exams, documents] = await Promise.all([
    loadLibraryOptions(),
    listQuestionTypes(),
    listOfficialExams(),
    listDocuments(),
  ]);
  return {
    subjects: library.subjects,
    topics: library.topics,
    questionTypes,
    exams: exams.map((e) => ({
      id: e.id,
      subjectId: e.subjectId,
      title: [e.title, e.examSession, e.year].filter(Boolean).join(" · "),
    })),
    documents: documents.map((d) => ({ id: d.id, subjectId: d.subjectId, title: d.title })),
  };
}
