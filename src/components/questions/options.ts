import type { LibraryOptions } from "@/components/documents/options";

/** Datos que necesita el editor de preguntas (serializables para el cliente). */
export type QuestionOptions = Pick<LibraryOptions, "subjects" | "topics"> & {
  questionTypes: { code: string; label: string; autoGradable: boolean }[];
  exams: { id: string; subjectId: string; title: string }[];
  documents: { id: string; subjectId: string; title: string }[];
};
