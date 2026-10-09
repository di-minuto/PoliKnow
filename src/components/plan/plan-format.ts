import { TASK_TYPE_LABELS, type TaskType } from "@/domain/scheduler/plan";

/** 45 → "45 min", 120 → "2 h", 135 → "2 h 15 min" */
export function minutesLabel(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

const STUDY: TaskType[] = ["theory", "exercises", "practice"];
export const isStudyTask = (type: TaskType) => STUDY.includes(type);

/** "40 min teoría", "10 preguntas · 15 min", "simulacro · 1 h 30 min" */
export function taskLabel(t: { type: TaskType; minutes: number; questionCount: number | null }): string {
  if (t.type === "review" && t.questionCount) return `${t.questionCount} preguntas · ${minutesLabel(t.minutes)}`;
  if (t.type === "review") return `repaso de apuntes · ${minutesLabel(t.minutes)}`;
  if (t.type === "exam_simulation") return `simulacro · ${minutesLabel(t.minutes)}`;
  return `${minutesLabel(t.minutes)} ${TASK_TYPE_LABELS[t.type]}`;
}

export const STATUS_LABELS = {
  pending: "Pendiente",
  in_progress: "Empezada",
  done: "Hecha",
  partial: "A medias",
  skipped: "Saltada",
  rescheduled: "Reprogramada",
} as const;
