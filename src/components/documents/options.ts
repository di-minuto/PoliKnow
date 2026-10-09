import type { DocumentTypeEntry } from "@/domain/documents/types";

/** Datos que necesitan los formularios de documentos (serializables para el cliente). */
export type LibraryOptions = {
  subjects: { id: string; label: string; color: string }[];
  topics: { id: string; subjectId: string; name: string; depth: number }[];
  assessments: { id: string; subjectId: string; name: string }[];
  types: DocumentTypeEntry[];
};
