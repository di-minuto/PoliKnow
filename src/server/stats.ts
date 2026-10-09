import "server-only";
import { buildTopicTree, descendantIds } from "@/domain/academic/logic";
import type { Assessment, Subject, Topic } from "@/domain/academic/types";
import { isExamMode } from "@/domain/practice/exam";
import { attemptSummary, dailyMinutes, readiness, strengths, type Readiness, type TopicSnapshot } from "@/domain/stats/stats";
import { daysUntil, toLocalDayKey } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { listAssessmentTopics, listAssessments, listSubjects, listTopics, check } from "@/server/repositories/academic";
import { listSessionsSince, listTopicProgress, type TopicProgressRecord } from "@/server/repositories/planning";
import { listAttempts } from "@/server/repositories/practice";
import { getProfile } from "@/server/profile";

/* Datos del panel de estadísticas. */

export type TopicRow = { topic: Topic; coverage: number; mastery: number; answered: number; correct: number };
export type SubjectRow = {
  subject: Subject;
  coverage: number;
  mastery: number;
  minutes: number;
  topics: TopicRow[];
};
export type AssessmentRow = {
  assessment: Assessment;
  subject: Subject | undefined;
  daysLeft: number | null;
  readiness: Readiness | null;
  examCount: number;
};

async function questionProgressByTopic() {
  const db = await createClient();
  const rows = check<{ times_answered: number; times_correct: number; questions: { topic_id: string | null } | null }[]>(
    "Aciertos por tema",
    (await db.from("question_progress").select("times_answered, times_correct, questions(topic_id)")) as never,
  );
  const byTopic = new Map<string, { answered: number; correct: number }>();
  let answered = 0;
  let correct = 0;
  for (const r of rows) {
    answered += r.times_answered;
    correct += r.times_correct;
    const topicId = r.questions?.topic_id;
    if (!topicId) continue;
    const t = byTopic.get(topicId) ?? { answered: 0, correct: 0 };
    byTopic.set(topicId, { answered: t.answered + r.times_answered, correct: t.correct + r.times_correct });
  }
  return { byTopic, answered, correct };
}

export async function loadStats(now = new Date()) {
  const profile = await getProfile();
  const tz = profile.timezone;
  const today = toLocalDayKey(now, tz);
  const since = new Date(now.getTime() - 365 * 86_400_000).toISOString();
  const [subjectsAll, topics, assessments, progress, sessions, attempts, answers] = await Promise.all([
    listSubjects(),
    listTopics(),
    listAssessments(),
    listTopicProgress(),
    listSessionsSince(since),
    listAttempts(500),
    questionProgressByTopic(),
  ]);
  const subjects = subjectsAll.filter((s) => !s.archived);
  const progressOf = new Map<string, TopicProgressRecord>(progress.map((p) => [p.topicId, p]));

  // Un tema principal resume a sus subtemas (media de los que tienen datos).
  const topicStat = (topic: Topic): TopicRow => {
    const ids = [...descendantIds(topics, topic.id)];
    const rows = ids.map((id) => progressOf.get(id)).filter((p): p is TopicProgressRecord => Boolean(p));
    const mean = (f: (p: TopicProgressRecord) => number) => (rows.length ? rows.reduce((s, p) => s + f(p), 0) / rows.length : 0);
    const own = progressOf.get(topic.id);
    let answered = 0;
    let correct = 0;
    for (const id of ids) {
      answered += answers.byTopic.get(id)?.answered ?? 0;
      correct += answers.byTopic.get(id)?.correct ?? 0;
    }
    return {
      topic,
      coverage: own ? own.coverage : mean((p) => p.coverage),
      mastery: own && own.mastery > 0 ? own.mastery : mean((p) => p.mastery),
      answered,
      correct,
    };
  };

  const minutesBySubject = new Map<string, number>();
  for (const s of sessions) {
    if (s.subject_id) minutesBySubject.set(s.subject_id, (minutesBySubject.get(s.subject_id) ?? 0) + (s.duration_seconds ?? 0) / 60);
  }

  const subjectRows: SubjectRow[] = subjects.map((subject) => {
    const roots = buildTopicTree(topics.filter((t) => t.subjectId === subject.id)).map((n) => topics.find((t) => t.id === n.id)!);
    const rows = roots.map(topicStat);
    const mean = (f: (r: TopicRow) => number) => (rows.length ? rows.reduce((s, r) => s + f(r), 0) / rows.length : 0);
    return {
      subject,
      coverage: mean((r) => r.coverage),
      mastery: mean((r) => r.mastery),
      minutes: Math.round(minutesBySubject.get(subject.id) ?? 0),
      topics: rows,
    };
  });

  // Preparación por evaluación pendiente.
  const active = new Set(subjects.map((s) => s.id));
  const upcoming = assessments
    .filter((a) => a.status === "upcoming" && active.has(a.subjectId))
    .sort((a, b) => (a.examAt ?? "9999").localeCompare(b.examAt ?? "9999"));
  const links = await listAssessmentTopics(upcoming.map((a) => a.id));
  const finished = attempts.filter((a) => a.status === "finished" && a.grade !== null && a.finished_at);
  const toDay = (iso: string | null) => (iso ? toLocalDayKey(new Date(iso), tz) : null);
  const assessmentRows: AssessmentRow[] = upcoming.map((assessment) => {
    const own = links.filter((l) => l.assessmentId === assessment.id);
    const grades = finished
      .filter((a) => a.assessment_id === assessment.id && isExamMode(a.mode))
      .sort((a, b) => a.finished_at!.localeCompare(b.finished_at!))
      .map((a) => Number(a.grade));
    const snapshot = (topicId: string): TopicSnapshot => {
      const topic = topics.find((t) => t.id === topicId);
      const stat = topic ? topicStat(topic) : null;
      const p = progressOf.get(topicId);
      return {
        mastery: stat?.mastery ?? 0,
        coverage: stat?.coverage ?? 0,
        nextReviewDay: toDay(p?.nextReviewAt ?? null),
        studied: Boolean(p?.lastStudiedAt || p?.nextReviewAt || (stat && stat.coverage > 0)),
      };
    };
    return {
      assessment,
      subject: subjects.find((s) => s.id === assessment.subjectId),
      daysLeft: assessment.examAt ? daysUntil(assessment.examAt, now, tz) : null,
      readiness: own.length ? readiness(own.map((l) => ({ weight: l.weight, state: snapshot(l.topicId) })), grades, today) : null,
      examCount: grades.length,
    };
  });

  const sessionDays = sessions.map((s) => ({ day: toLocalDayKey(new Date(s.started_at), tz), seconds: s.duration_seconds ?? 0 }));
  const daily = dailyMinutes(sessionDays, today, 28);
  const totalMinutes = sessionDays.reduce((s, x) => s + x.seconds / 60, 0);
  const weekMinutes = daily.slice(-7).reduce((s, d) => s + d.minutes, 0);

  const allTopicRows = topics.filter((t) => active.has(t.subjectId)).map(topicStat);
  const { strong, weak } = strengths(
    allTopicRows.map((r) => ({ topicId: r.topic.id, mastery: r.mastery, answered: r.answered })),
  );
  const topicById = new Map(topics.map((t) => [t.id, t]));

  return {
    today,
    timezone: tz,
    subjects: subjectRows,
    assessments: assessmentRows,
    daily,
    totalMinutes: Math.round(totalMinutes),
    weekMinutes,
    attempts: attemptSummary(finished.map((a) => ({ finishedAt: a.finished_at!, grade: Number(a.grade), exam: isExamMode(a.mode) }))),
    accuracy: answers.answered > 0 ? answers.correct / answers.answered : null,
    answered: answers.answered,
    strong: strong.map((s) => ({ ...s, topic: topicById.get(s.topicId)! })),
    weak: weak.map((s) => ({ ...s, topic: topicById.get(s.topicId)! })),
  };
}
