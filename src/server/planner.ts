import "server-only";
import { descendantIds } from "@/domain/academic/logic";
import type { Assessment, Subject, Topic } from "@/domain/academic/types";
import { addDays, defaultTopicMinutes, plan, planSignature, type PlanInput, type PlanResult, type TopicState } from "@/domain/scheduler/plan";
import { EMPTY_TOPIC_STATE } from "@/domain/scheduler/session";
import { toLocalDayKey } from "@/lib/dates";
import { listAssessmentTopics, listAssessments, listSubjects, listTopics } from "@/server/repositories/academic";
import * as planning from "@/server/repositories/planning";
import { getProfile } from "@/server/profile";

/*
 * Une los datos del usuario con el planificador puro y guarda el resultado.
 * Se llama al abrir Hoy o el Plan y al cerrar una sesión: si nada ha cambiado,
 * no escribe nada (se compara la firma del plan).
 */

/** Minutos estimados de un tema: sus horas o la suma de las de sus subtemas. */
export function topicMinutes(all: readonly Topic[], topic: Topic): number | null {
  if (topic.estimatedHours) return Math.round(topic.estimatedHours * 60);
  const sum = [...descendantIds(all, topic.id)]
    .filter((id) => id !== topic.id)
    .reduce((s, id) => s + (all.find((t) => t.id === id)?.estimatedHours ?? 0), 0);
  return sum > 0 ? Math.round(sum * 60) : null;
}

export type PlanContext = {
  userId: string;
  today: string;
  timezone: string;
  subjects: Subject[];
  topics: Topic[];
  assessments: Assessment[];
  input: PlanInput;
  /** evaluaciones pendientes que no se pueden planificar y por qué */
  notices: { assessment: Assessment; reason: "no_date" | "no_topics" }[];
  availabilityTotal: number;
};

export async function loadPlanContext(now = new Date()): Promise<PlanContext> {
  const profile = await getProfile();
  const today = toLocalDayKey(now, profile.timezone);
  const [subjects, topics, allAssessments, progress, availability, blocked, questionTopics, todayTasks] = await Promise.all([
    listSubjects(),
    listTopics(),
    listAssessments(),
    planning.listTopicProgress(),
    planning.getWeeklyAvailability(),
    planning.listBlockedDays(today),
    planning.listQuestionTopics(),
    planning.listTasks(today, today),
  ]);
  const active = new Set(subjects.filter((s) => !s.archived).map((s) => s.id));
  const upcoming = allAssessments.filter((a) => a.status === "upcoming" && active.has(a.subjectId));
  const links = await listAssessmentTopics(upcoming.map((a) => a.id));

  const notices: PlanContext["notices"] = [];
  const planned: PlanInput["assessments"][number][] = [];
  for (const a of upcoming) {
    const own = links.filter((l) => l.assessmentId === a.id);
    if (!a.examAt) notices.push({ assessment: a, reason: "no_date" });
    else if (own.length === 0) notices.push({ assessment: a, reason: "no_topics" });
    else {
      const examDay = toLocalDayKey(new Date(a.examAt), profile.timezone);
      if (examDay <= today) continue;
      planned.push({
        id: a.id,
        subjectId: a.subjectId,
        examDay,
        importance: a.importance,
        perceivedDifficulty: a.perceivedDifficulty,
        durationMinutes: a.durationMinutes,
        topics: own.map((l) => ({ topicId: l.topicId, weight: l.weight })),
      });
    }
  }

  // Preguntas por tema enlazado (con sus subtemas) y por evaluación.
  const linked = [...new Set(planned.flatMap((a) => a.topics.map((t) => t.topicId)))];
  const perTopic = new Map<string, number>();
  for (const q of questionTopics) if (q.topicId) perTopic.set(q.topicId, (perTopic.get(q.topicId) ?? 0) + 1);
  const questionCounts = new Map<string, number>();
  for (const id of linked) {
    let n = 0;
    for (const d of descendantIds(topics, id)) n += perTopic.get(d) ?? 0;
    questionCounts.set(id, n);
  }
  const assessmentQuestionCounts = new Map(
    planned.map((a) => [a.id, a.topics.reduce((s, t) => s + (questionCounts.get(t.topicId) ?? 0), 0)]),
  );

  const toDay = (iso: string | null) => (iso ? toLocalDayKey(new Date(iso), profile.timezone) : null);
  const progressMap = new Map<string, TopicState>(
    progress.map((p) => [
      p.topicId,
      {
        mastery: p.mastery,
        coverage: p.coverage,
        lastStudiedDay: toDay(p.lastStudiedAt),
        nextReviewDay: toDay(p.nextReviewAt),
        notUnderstoodCount: p.notUnderstoodCount,
        priorityAdjustment: p.priorityAdjustment,
      },
    ]),
  );

  // Lo empezado hoy cuenta como hecho mientras dura, para no planificarlo otra vez.
  const topicList = topics.filter((t) => linked.includes(t.id));
  for (const t of todayTasks.filter((x) => x.status === "in_progress" && x.topicId)) {
    const state = progressMap.get(t.topicId!) ?? { ...EMPTY_TOPIC_STATE };
    const topic = topicList.find((x) => x.id === t.topicId);
    if (["theory", "exercises", "practice"].includes(t.type) && topic) {
      const total = topicMinutes(topics, topic) ?? defaultTopicMinutes(3);
      state.coverage = Math.min(1, state.coverage + t.minutes / total);
    }
    if (t.type === "review") state.nextReviewDay = addDays(today, 1);
    progressMap.set(t.topicId!, state);
  }

  // Hoy ya ocupado: lo hecho, empezado, saltado o manual.
  const usedToday = todayTasks
    .filter((t) => t.status !== "pending" || t.origin === "manual")
    .reduce((s, t) => s + t.minutes, 0);

  return {
    userId: profile.id,
    today,
    timezone: profile.timezone,
    subjects,
    topics,
    assessments: allAssessments,
    notices,
    availabilityTotal: availability.reduce((s, m) => s + m, 0),
    input: {
      today,
      availability,
      blockedDays: new Set(blocked.map((b) => b.day)),
      usedToday,
      restToday: new Set(todayTasks.filter((t) => t.status === "skipped" && t.topicId).map((t) => t.topicId!)),
      subjects: subjects.map((s) => ({ id: s.id, perceivedDifficulty: s.perceivedDifficulty, importance: s.importance })),
      assessments: planned,
      topics: topics
        .filter((t) => linked.includes(t.id))
        .map((t) => {
          const subject = subjects.find((s) => s.id === t.subjectId);
          return {
            id: t.id,
            subjectId: t.subjectId,
            kind: t.kind,
            estimatedMinutes: topicMinutes(topics, t) ?? defaultTopicMinutes(subject?.perceivedDifficulty ?? 3),
          };
        }),
      progress: progressMap,
      questionCounts,
      assessmentQuestionCounts,
    },
  };
}

/** Recalcula el plan desde hoy. Devuelve el contexto y los avisos del planificador. */
export async function replan(now = new Date()): Promise<PlanContext & { result: PlanResult }> {
  const context = await loadPlanContext(now);
  const { today } = context;
  const result = plan(context.input);
  await planning.markMissedTasks(today);
  const current = (await planning.listTasks(today)).filter((t) => t.status === "pending" && t.origin === "auto");
  if (planSignature(current) !== planSignature(result.tasks)) {
    await planning.replaceAutoTasks(context.userId, today, result.tasks);
  }
  return { ...context, result };
}

/** Minutos totales estimados de un tema (para el avance de la cobertura). */
export async function estimatedTopicMinutes(topicId: string): Promise<number> {
  const [topics, subjects] = await Promise.all([listTopics(), listSubjects()]);
  const topic = topics.find((t) => t.id === topicId);
  if (!topic) return defaultTopicMinutes(3);
  const subject = subjects.find((s) => s.id === topic.subjectId);
  return topicMinutes(topics, topic) ?? defaultTopicMinutes(subject?.perceivedDifficulty ?? 3);
}
