/**
 * Tipos de la jerarquía académica. Reflejan las tablas de
 * supabase/migrations en camelCase; los repositorios hacen la conversión.
 */

export type Course = {
  id: string;
  name: string;
  academicYear: string | null;
  startDate: string | null;
  endDate: string | null;
  archived: boolean;
};

/** 1 = muy baja ... 5 = muy alta */
export type Level = 1 | 2 | 3 | 4 | 5;

export type Subject = {
  id: string;
  courseId: string;
  name: string;
  code: string | null;
  color: string;
  perceivedDifficulty: Level;
  importance: Level;
  position: number;
  archived: boolean;
};

export type TopicKind = "theory" | "lab" | "other";

export type Topic = {
  id: string;
  subjectId: string;
  parentId: string | null;
  name: string;
  description: string | null;
  kind: TopicKind;
  estimatedHours: number | null;
  position: number;
};

/** Código de assessment_types (catálogo ampliable: 'partial', 'final', 'lab_exam'...). */
export type AssessmentTypeCode = string;

export type AssessmentStatus = "upcoming" | "done" | "cancelled";

export type Assessment = {
  id: string;
  subjectId: string;
  assessmentType: AssessmentTypeCode;
  name: string;
  examAt: string | null;
  durationMinutes: number | null;
  importance: Level;
  perceivedDifficulty: Level | null;
  gradeWeight: number | null;
  status: AssessmentStatus;
  position: number;
};

export type AssessmentTopic = {
  assessmentId: string;
  topicId: string;
  weight: number;
};

/** Fila de un catálogo ampliable (tipos de evaluación, documento o pregunta). */
export type CatalogEntry = {
  code: string;
  label: string;
  /** null = del sistema; si no, creado por el usuario. */
  userId: string | null;
  position: number;
};
