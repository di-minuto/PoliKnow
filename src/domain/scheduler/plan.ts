/*
 * Planificador: función pura que reparte el trabajo pendiente hasta cada examen.
 *
 * - Trabajo de cada tema: minutos estimados × (1 − lo que ya sabes). Lo que no
 *   se hizo no se "arrastra": como la cobertura no ha subido, vuelve a salir.
 * - Prioridad del tema: peso en el parcial, importancia, dificultad, dominio en
 *   tests (fallar sube la prioridad, mejorar la baja), "no lo he entendido" y
 *   ajustes por la dificultad percibida en las sesiones.
 * - Urgencia: días hasta el examen y carga pendiente frente al tiempo disponible.
 * - Repaso espaciado: un tema estudiado se repasa al día siguiente y luego con
 *   intervalos crecientes; los repasos vencidos van primero.
 * - Antes de cada examen: un simulacro dos días antes y repaso general el día antes.
 */

export const TASK_TYPES = ["theory", "exercises", "review", "test", "practice", "exam_simulation"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  theory: "teoría",
  exercises: "ejercicios",
  review: "repaso",
  test: "test",
  practice: "práctica",
  exam_simulation: "simulacro",
};

export type TopicState = {
  mastery: number;
  coverage: number;
  lastStudiedDay: string | null;
  nextReviewDay: string | null;
  notUnderstoodCount: number;
  priorityAdjustment: number;
};

export type PlanInput = {
  /** Clave YYYY-MM-DD de hoy en la zona del usuario. */
  today: string;
  /** Minutos por día de la semana (0 = domingo). */
  availability: readonly number[];
  blockedDays: ReadonlySet<string>;
  /** Minutos de hoy ya ocupados (tareas hechas, empezadas, saltadas o manuales). */
  usedToday: number;
  /** Temas que hoy no se vuelven a proponer (p. ej. porque se ha saltado su tarea). */
  restToday?: ReadonlySet<string>;
  subjects: readonly { id: string; perceivedDifficulty: number; importance: number }[];
  /** Solo evaluaciones pendientes con fecha. */
  assessments: readonly {
    id: string;
    subjectId: string;
    examDay: string;
    importance: number;
    perceivedDifficulty: number | null;
    durationMinutes: number | null;
    topics: readonly { topicId: string; weight: number }[];
  }[];
  topics: readonly { id: string; subjectId: string; kind: "theory" | "lab" | "other"; estimatedMinutes: number | null }[];
  progress: ReadonlyMap<string, TopicState>;
  /** Preguntas disponibles por tema (con sus subtemas) y por evaluación. */
  questionCounts: ReadonlyMap<string, number>;
  assessmentQuestionCounts: ReadonlyMap<string, number>;
  maxDays?: number;
};

export type PlannedTask = {
  day: string;
  subjectId: string;
  assessmentId: string | null;
  topicId: string | null;
  type: TaskType;
  minutes: number;
  questionCount: number | null;
  priority: number;
  position: number;
};

export type PlanWarning = { assessmentId: string; missingMinutes: number };
export type PlanResult = { tasks: PlannedTask[]; warnings: PlanWarning[] };

const MIN_BLOCK = 10;
const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Minutos estimados de un tema sin dato: 3 h ajustadas por dificultad. */
export const defaultTopicMinutes = (difficulty: number) => round5(180 * (0.6 + 0.2 * difficulty));

/** Días que se reservan antes del examen para repaso y simulacro. */
export const reserveDays = (daysLeft: number) => (daysLeft >= 7 ? 2 : daysLeft >= 3 ? 1 : 0);

/** Primer hueco entre repasos de un tema según su dominio (días). */
export const firstReviewGap = (mastery: number) => Math.max(1, Math.round(1 + 10 * mastery * mastery));

type Unit = {
  topicId: string;
  subjectId: string;
  assessmentId: string;
  /** antes de este día hay que terminar la teoría */
  studyDeadline: string;
  /** último examen que incluye el tema: no se repasa a partir de ese día */
  lastExamDay: string;
  priority: number;
  theory: number;
  exercises: number;
  practice: number;
  nextReview: string | null;
  reviewGap: number;
  reviewMinutes: number;
  reviewQuestions: number | null;
};

export function plan(input: PlanInput): PlanResult {
  const { today } = input;
  const subjects = new Map(input.subjects.map((s) => [s.id, s]));
  const topics = new Map(input.topics.map((t) => [t.id, t]));
  const assessments = input.assessments.filter((a) => a.examDay > today).sort((a, b) => a.examDay.localeCompare(b.examDay));
  if (assessments.length === 0) return { tasks: [], warnings: [] };
  const lastDay = addDays(assessments[assessments.length - 1].examDay, -1);
  const maxDays = input.maxDays ?? 120;

  // Capacidad por día.
  const days: string[] = [];
  for (let d = today; d <= lastDay && days.length < maxDays; d = addDays(d, 1)) days.push(d);
  const capacity = new Map<string, number>();
  for (const d of days) {
    const base = input.blockedDays.has(d) ? 0 : (input.availability[weekdayOf(d)] ?? 0);
    capacity.set(d, Math.max(0, d === today ? base - input.usedToday : base));
  }
  const capacityBetween = (from: string, toExclusive: string) =>
    days.filter((d) => d >= from && d < toExclusive).reduce((s, d) => s + (capacity.get(d) ?? 0), 0);

  // Unidades de trabajo: cada tema, con el primer examen que lo incluye.
  const units = new Map<string, Unit>();
  for (const a of assessments) {
    const subject = subjects.get(a.subjectId);
    const difficulty = a.perceivedDifficulty ?? subject?.perceivedDifficulty ?? 3;
    const avgWeight = a.topics.reduce((s, t) => s + t.weight, 0) / Math.max(1, a.topics.length) || 1;
    for (const link of a.topics) {
      const topic = topics.get(link.topicId);
      if (!topic) continue;
      const existing = units.get(topic.id);
      if (existing) {
        existing.lastExamDay = a.examDay > existing.lastExamDay ? a.examDay : existing.lastExamDay;
        continue;
      }
      const state = input.progress.get(topic.id);
      const mastery = clamp(state?.mastery ?? 0, 0, 1);
      const coverage = clamp(state?.coverage ?? 0, 0, 1);
      const priority =
        (link.weight / avgWeight || 1) *
        (0.6 + 0.2 * a.importance) *
        (0.8 + 0.1 * (subject?.importance ?? 3)) *
        (0.7 + 0.15 * difficulty) *
        (1 + 0.8 * (1 - mastery)) *
        (1 + 0.25 * Math.min(3, state?.notUnderstoodCount ?? 0)) *
        (1 + clamp(state?.priorityAdjustment ?? 0, -0.5, 1));
      const total = topic.estimatedMinutes ?? defaultTopicMinutes(difficulty);
      const known = Math.max(coverage, 0.8 * mastery);
      const remaining = known >= 0.97 ? 0 : Math.round((total * (1 - known)) / 5) * 5;
      const isLab = topic.kind === "lab";
      const theory = isLab ? 0 : Math.round((remaining * 2) / 3 / 5) * 5;
      const daysLeft = daysBetween(today, a.examDay);
      const questions = input.questionCounts.get(topic.id) ?? 0;
      const count = Math.min(10, questions);

      let nextReview: string | null = null;
      if (state?.nextReviewDay) nextReview = state.nextReviewDay < today ? today : state.nextReviewDay;
      else if (state?.lastStudiedDay || coverage > 0) {
        const due = addDays(state?.lastStudiedDay ?? today, firstReviewGap(mastery));
        nextReview = due < today ? today : due;
      }
      units.set(topic.id, {
        topicId: topic.id,
        subjectId: topic.subjectId,
        assessmentId: a.id,
        studyDeadline: addDays(a.examDay, -reserveDays(daysLeft)),
        lastExamDay: a.examDay,
        priority,
        theory,
        exercises: isLab ? 0 : remaining - theory,
        practice: isLab ? remaining : 0,
        nextReview,
        reviewGap: firstReviewGap(mastery) * 2,
        reviewMinutes: count >= 3 ? Math.max(10, round5(count * 1.5)) : 15,
        reviewQuestions: count >= 3 ? count : null,
      });
    }
  }

  const tasks: PlannedTask[] = [];
  const push = (t: Omit<PlannedTask, "position">) => {
    const same = tasks.find((x) => x.day === t.day && x.topicId === t.topicId && x.type === t.type && x.assessmentId === t.assessmentId);
    if (same) same.minutes += t.minutes;
    else tasks.push({ ...t, position: tasks.filter((x) => x.day === t.day).length });
  };

  // Simulacro dos días antes de cada examen (o el primer hueco anterior).
  const simulations = new Map<string, (typeof assessments)[number]>();
  for (const a of assessments) {
    if ((input.assessmentQuestionCounts.get(a.id) ?? 0) === 0) continue;
    for (const offset of [2, 1, 3, 4]) {
      const d = addDays(a.examDay, -offset);
      if (d < today || !capacity.has(d) || (capacity.get(d) ?? 0) < 20 || simulations.has(d)) continue;
      simulations.set(d, a);
      break;
    }
  }

  const remainingOf = (u: Unit) => u.theory + u.exercises + u.practice;

  for (const day of days) {
    let cap = capacity.get(day) ?? 0;
    if (cap < MIN_BLOCK) continue;

    const sim = simulations.get(day);
    if (sim) {
      const minutes = Math.min(sim.durationMinutes ?? 60, cap);
      push({
        day,
        subjectId: sim.subjectId,
        assessmentId: sim.id,
        topicId: null,
        type: "exam_simulation",
        minutes,
        questionCount: Math.min(20, input.assessmentQuestionCounts.get(sim.id) ?? 0),
        priority: 10,
      });
      cap -= minutes;
    }

    // Repasos: los vencidos y, el día antes de un examen, todos sus temas.
    const eve = new Set(assessments.filter((a) => addDays(a.examDay, -1) === day).flatMap((a) => a.topics.map((t) => t.topicId)));
    const studyLeft = [...units.values()].some((u) => remainingOf(u) > 0 && day < u.studyDeadline);
    let reviewBudget = studyLeft ? Math.max(MIN_BLOCK, Math.round(cap * 0.4)) : cap;
    if (eve.size) reviewBudget = cap;
    const resting = (u: Unit) => day === today && (input.restToday?.has(u.topicId) ?? false);
    const dueReviews = [...units.values()]
      .filter((u) => !resting(u) && day < u.lastExamDay && (eve.has(u.topicId) || (u.nextReview !== null && u.nextReview <= day)))
      .sort((a, b) => b.priority - a.priority);
    for (const u of dueReviews) {
      if (u.reviewMinutes > reviewBudget || u.reviewMinutes > cap) break;
      push({
        day,
        subjectId: u.subjectId,
        assessmentId: u.assessmentId,
        topicId: u.topicId,
        type: "review",
        minutes: u.reviewMinutes,
        questionCount: u.reviewQuestions,
        priority: round2(u.priority),
      });
      cap -= u.reviewMinutes;
      reviewBudget -= u.reviewMinutes;
      u.nextReview = addDays(day, u.reviewGap);
      u.reviewGap *= 2;
    }

    // Estudio: bloques de teoría + ejercicios (o práctica) por urgencia y prioridad.
    const used = new Set<string>();
    while (cap >= MIN_BLOCK) {
      const open = [...units.values()].filter((u) => remainingOf(u) > 0 && day < u.studyDeadline && !resting(u));
      if (open.length === 0) break;
      const pool = open.some((u) => !used.has(u.topicId)) ? open.filter((u) => !used.has(u.topicId)) : open;
      const score = (u: Unit) => {
        const group = open.filter((x) => x.studyDeadline === u.studyDeadline);
        const load = group.reduce((s, x) => s + remainingOf(x), 0) / Math.max(1, capacityBetween(day, u.studyDeadline));
        return (u.priority * (1 + 2 * Math.min(3, load))) / Math.sqrt(1 + daysBetween(day, u.studyDeadline));
      };
      const u = pool.reduce((best, x) => (score(x) > score(best) ? x : best));
      used.add(u.topicId);

      const blocks: [TaskType, number][] =
        u.practice > 0
          ? [["practice", Math.min(60, u.practice)]]
          : u.theory > 0
            ? [
                ["theory", Math.min(40, u.theory)],
                ["exercises", Math.min(20, u.exercises)],
              ]
            : [["exercises", Math.min(40, u.exercises)]];
      for (const [type, wanted] of blocks) {
        const minutes = Math.min(wanted, cap);
        // Restos pequeños solo si es lo último que queda de ese bloque.
        if (minutes <= 0 || (minutes < MIN_BLOCK && minutes < wanted)) continue;
        push({ day, subjectId: u.subjectId, assessmentId: u.assessmentId, topicId: u.topicId, type, minutes, questionCount: null, priority: round2(u.priority) });
        cap -= minutes;
        if (type === "practice") u.practice -= minutes;
        else if (type === "theory") u.theory -= minutes;
        else u.exercises -= minutes;
        if (cap < MIN_BLOCK) break;
      }
      // Tema terminado: primer repaso al día siguiente.
      if (remainingOf(u) <= 0) {
        u.theory = u.exercises = u.practice = 0;
        u.nextReview = addDays(day, 1);
        u.reviewGap = 3;
      }
    }
  }

  const missing = new Map<string, number>();
  for (const u of units.values()) {
    const left = remainingOf(u);
    if (left > 0) missing.set(u.assessmentId, (missing.get(u.assessmentId) ?? 0) + left);
  }
  return {
    tasks,
    warnings: [...missing].filter(([, m]) => m >= 15).map(([assessmentId, missingMinutes]) => ({ assessmentId, missingMinutes })),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Clave para comparar planes y no reescribir nada si no ha cambiado. */
export function planSignature(tasks: readonly Pick<PlannedTask, "day" | "topicId" | "assessmentId" | "type" | "minutes" | "questionCount">[]) {
  return tasks
    .map((t) => [t.day, t.assessmentId ?? "", t.topicId ?? "", t.type, t.minutes, t.questionCount ?? ""].join("|"))
    .sort()
    .join("\n");
}
