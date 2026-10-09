import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Flag, Hourglass, Minus, Trash2, X } from "lucide-react";
import { ExplainButton } from "@/components/ai/explain-button";
import { ExamRunner } from "@/components/practice/exam-runner";
import { describeResponse } from "@/components/practice/response-view";
import { QuickModeButton } from "@/components/practice/test-builder";
import { TestRunner } from "@/components/practice/test-runner";
import type { ExamItem, RunnerItem, RunnerQuestion } from "@/components/practice/types";
import { QuestionBodyView } from "@/components/questions/question-body-view";
import { RichText } from "@/components/questions/rich-text";
import { SourceBadge } from "@/components/questions/source-badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { buttonClass, cardClass } from "@/components/ui/styles";
import { isExamMode, studyRecommendations } from "@/domain/practice/exam";
import { outcomeResult } from "@/domain/practice/scoring";
import { SELF_GRADE_LABELS, TEST_MODE_LABELS, type SelfGrade } from "@/domain/practice/types";
import { bodyKind } from "@/domain/questions/body";
import type { Question } from "@/domain/questions/types";
import { formatDateTime } from "@/lib/dates";
import { selfGradeExamItemAction } from "@/server/actions/exams-practice";
import { deleteAttemptAction } from "@/server/actions/practice";
import { aiInfo } from "@/server/ai";
import { getProfile } from "@/server/profile";
import { loadQuestionOptions } from "@/server/question-options";
import { getAttempt, type ItemRow } from "@/server/repositories/practice";
import { getQuestionsByIds } from "@/server/repositories/questions";

export const metadata: Metadata = { title: "Test" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fmt = (n: number | string | null | undefined, d = 1) =>
  n === null || n === undefined ? "–" : String(Math.round(Number(n) * 10 ** d) / 10 ** d).replace(".", ",");

function duration(seconds: number | null): string {
  if (!seconds) return "–";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  return m > 0 ? `${m} min${s ? ` ${s} s` : ""}` : `${s} s`;
}

/** Contenido que necesita el navegador para responder, sin la solución. */
function runnerContent(q: Question): RunnerQuestion["content"] {
  const c = q.content as Record<string, unknown>;
  switch (bodyKind(q.questionType)) {
    case "choice":
      return { options: (c.options as string[]) ?? [], multiple: Boolean(c.multiple) };
    case "numeric":
      return { unit: (c.unit as string | null) ?? null };
    case "code":
      return { language: (c.language as string | null) ?? null, code: (c.code as string | null) ?? null };
    default:
      return {};
  }
}

type Result = "correct" | "incorrect" | "partial" | "unanswered" | "pending";
function itemResult(item: ItemRow): Result {
  const grade = item.user_answer?.grade;
  if (!item.answered_at || !grade) return "unanswered";
  if (grade === "self_assessed" && !item.user_answer?.selfGrade) return "pending";
  return outcomeResult(grade, item.user_answer?.selfGrade ?? null);
}

const RESULT_VIEW: Record<Result, { label: string; className: string; icon: typeof Check }> = {
  correct: { label: "Correcta", className: "bg-success-soft text-success", icon: Check },
  incorrect: { label: "Incorrecta", className: "bg-danger-soft text-danger", icon: X },
  partial: { label: "Regular", className: "bg-warning-soft text-warning", icon: Minus },
  unanswered: { label: "Sin responder", className: "bg-border/60 text-muted", icon: Minus },
  pending: { label: "Por autoevaluar", className: "bg-primary-soft text-primary", icon: Hourglass },
};

const SELF_GRADES: SelfGrade[] = ["wrong", "partial", "right"];

export default async function AttemptPage({ params }: PageProps<"/tests/[attemptId]">) {
  const { attemptId } = await params;
  if (!UUID.test(attemptId)) notFound();
  const data = await getAttempt(attemptId);
  if (!data) notFound();
  const { attempt, items } = data;

  const [questions, options, profile] = await Promise.all([
    getQuestionsByIds(items.map((i) => i.question_id)),
    loadQuestionOptions(),
    getProfile(),
  ]);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const topicName = new Map(options.topics.map((t) => [t.id, t.name]));
  const typeLabel = new Map(options.questionTypes.map((t) => [t.code, t.label]));
  const examTitle = new Map(options.exams.map((e) => [e.id, e.title]));
  const subject = options.subjects.find((s) => s.id === attempt.subject_id);
  // Las preguntas borradas después de crear el test desaparecen de él.
  const present = items.filter((i) => byId.has(i.question_id));

  const sourceDetail = (q: Question) =>
    q.officialExamId
      ? `${examTitle.get(q.officialExamId) ?? "Examen"}${q.officialPosition ? ` · nº ${q.officialPosition}` : ""}`
      : q.aiModel;

  const exam = isExamMode(attempt.mode);
  const config = attempt.config as { penalty?: number; allowBack?: boolean };
  const penalty = Number(config.penalty ?? 0);
  const officialTitle = attempt.official_exam_id ? examTitle.get(attempt.official_exam_id) : undefined;
  const title = officialTitle
    ? officialTitle
    : `${TEST_MODE_LABELS[attempt.mode]}${subject ? ` · ${subject.label.split(" · ")[0]}` : ""}`;
  const back = (
    <Link href="/tests" className="text-sm text-muted hover:underline">
      ← Tests
    </Link>
  );
  const deleteForm = (
    <form action={deleteAttemptAction}>
      <input type="hidden" name="id" value={attempt.id} />
      <ConfirmButton message="¿Borrar este test? Tu progreso en las preguntas se conserva." className={buttonClass.danger}>
        <Trash2 className="size-4" aria-hidden />
        Borrar test
      </ConfirmButton>
    </form>
  );

  const runnerQuestion = (q: Question): RunnerQuestion => ({
    id: q.id,
    stem: q.stem,
    questionType: q.questionType,
    typeLabel: typeLabel.get(q.questionType) ?? q.questionType,
    content: runnerContent(q),
    sourceType: q.sourceType,
    sourceDetail: sourceDetail(q),
    topicName: q.topicId ? (topicName.get(q.topicId) ?? null) : null,
  });

  if (attempt.status === "in_progress" && exam) {
    const examItems: ExamItem[] = present.map((item) => ({
      itemId: item.id,
      position: item.position,
      flagged: item.flagged,
      points: Number(item.points),
      // En un simulacro no se dice ni el tema ni la solución.
      question: { ...runnerQuestion(byId.get(item.question_id)!), topicName: null },
      response: item.answered_at ? (item.user_answer?.response ?? null) : null,
    }));
    return (
      <>
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            {back}
            <h1 className="mt-2 text-2xl font-bold">{title}</h1>
          </div>
        </header>
        {examItems.length === 0 ? (
          <div className={`${cardClass} flex flex-col items-start gap-3 p-5 text-muted`}>
            Las preguntas de este examen se han borrado.
            {deleteForm}
          </div>
        ) : (
          <ExamRunner
            attemptId={attempt.id}
            items={examItems}
            startedAt={attempt.started_at}
            timeLimitSeconds={attempt.time_limit_seconds}
            allowBack={config.allowBack !== false}
            penalty={penalty}
          />
        )}
      </>
    );
  }

  if (attempt.status === "in_progress") {
    const runnerItems: RunnerItem[] = present.map((item) => {
      const q = byId.get(item.question_id)!;
      const grade = item.user_answer?.grade;
      return {
        itemId: item.id,
        position: item.position,
        flagged: item.flagged,
        question: runnerQuestion(q),
        done:
          item.answered_at && grade
            ? {
                response: item.user_answer?.response ?? null,
                feedback: {
                  grade,
                  selfGrade: item.user_answer?.selfGrade ?? null,
                  answer: q.answer,
                  explanation: q.explanation,
                  needsSelfGrade: false,
                },
              }
            : null,
      };
    });
    return (
      <>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            {back}
            <h1 className="mt-2 text-2xl font-bold">{title}</h1>
          </div>
          {deleteForm}
        </header>
        {runnerItems.length === 0 ? (
          <p className={`${cardClass} p-5 text-muted`}>Las preguntas de este test se han borrado.</p>
        ) : (
          <TestRunner attemptId={attempt.id} items={runnerItems} />
        )}
      </>
    );
  }

  // ------------------------------------------------------------ resultados
  const aiEnabled = aiInfo().enabled;
  const summary = attempt.summary as {
    correct?: number;
    incorrect?: number;
    partial?: number;
    unanswered?: number;
    pending?: number;
    penaltyLost?: number;
    byTopic?: { topicId: string | null; grade: number; count: number }[];
  };
  const grade = Number(attempt.grade ?? 0);
  const byTopic = [...(summary.byTopic ?? [])].sort((a, b) => a.grade - b.grade);
  const weak = byTopic.filter((t) => t.topicId && t.grade < 5);
  const failed = present.filter((i) => ["incorrect", "partial"].includes(itemResult(i))).length;
  const pending = summary.pending ?? 0;
  const tips = exam
    ? studyRecommendations({
        grade,
        total: present.length,
        incorrect: summary.incorrect ?? 0,
        unanswered: summary.unanswered ?? 0,
        pending,
        penaltyLost: summary.penaltyLost ?? 0,
        maxScore: Number(attempt.max_score ?? 0),
        timeUsedSeconds: attempt.time_used_seconds,
        timeLimitSeconds: attempt.time_limit_seconds,
        byTopic: byTopic
          .filter((t) => t.topicId)
          .map((t) => ({ name: topicName.get(t.topicId!) ?? "Tema", grade: t.grade, count: t.count })),
      })
    : [];

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          {back}
          <h1 className="mt-2 text-2xl font-bold">Resultados · {title}</h1>
          <p className="text-sm text-muted">{formatDateTime(attempt.started_at, profile.timezone)}</p>
        </div>
        {deleteForm}
      </header>

      <section aria-label="Resumen" className={`${cardClass} mb-6 grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center`}>
        <div className="text-center sm:pr-6">
          <p className={`text-5xl font-bold ${grade >= 5 ? "text-success" : "text-danger"}`} aria-label={`Nota ${fmt(grade)} sobre 10`}>
            {fmt(grade)}
          </p>
          <p className="text-sm text-muted">sobre 10</p>
          {exam && (
            <p className="mt-1 text-sm">
              {fmt(attempt.score, 2)} / {fmt(attempt.max_score, 2)} puntos
            </p>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          {[
            ["Correctas", summary.correct ?? 0],
            ["Incorrectas", summary.incorrect ?? 0],
            ["Regular", summary.partial ?? 0],
            ["Sin responder", summary.unanswered ?? 0],
            ...(pending > 0 ? [["Por autoevaluar", pending]] : []),
            [
              "Tiempo",
              attempt.time_limit_seconds
                ? `${duration(attempt.time_used_seconds)} de ${duration(attempt.time_limit_seconds)}`
                : duration(attempt.time_used_seconds),
            ],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-background px-3 py-2">
              <dt className="text-muted">{label}</dt>
              <dd className="text-lg font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        {exam && (
          <p className="text-sm text-muted sm:col-span-2">
            {penalty > 0
              ? `Cada fallo restaba ${fmt(penalty, 2)} de la pregunta: has perdido ${fmt(summary.penaltyLost ?? 0, 2)} puntos por fallos.`
              : "Sin penalización por fallos."}
          </p>
        )}
      </section>

      {byTopic.length > 0 && (
        <section aria-labelledby="por-tema" className="mb-6">
          <h2 id="por-tema" className="mb-3 text-lg font-semibold">
            Nota por tema
          </h2>
          <ul className={`${cardClass} divide-y divide-border`}>
            {byTopic.map((t) => (
              <li key={t.topicId ?? "none"} className="flex items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1">{t.topicId ? (topicName.get(t.topicId) ?? "Tema borrado") : "Sin tema"}</span>
                <span className="text-sm text-muted">
                  {t.count} {t.count === 1 ? "pregunta" : "preguntas"}
                </span>
                <span className={`w-10 text-right font-semibold ${t.grade >= 5 ? "text-success" : "text-danger"}`}>{fmt(t.grade)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(weak.length > 0 || failed > 0 || tips.length > 0) && (
        <section aria-labelledby="recomendaciones" className={`${cardClass} mb-6 flex flex-col gap-3 p-5`}>
          <h2 id="recomendaciones" className="text-lg font-semibold">
            {exam ? "Recomendaciones de estudio" : "Qué repasar"}
          </h2>
          {tips.length > 0 && (
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
              {tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          )}
          {weak.length > 0 && !exam && (
            <p className="text-sm">
              Flojea{weak.length > 1 ? "n" : ""}:{" "}
              {weak.map((t, i) => (
                <span key={t.topicId}>
                  {i > 0 && ", "}
                  <Link href={`/tests?asignatura=${attempt.subject_id ?? ""}&tema=${t.topicId}`} className="text-primary underline">
                    {topicName.get(t.topicId!) ?? "Tema"}
                  </Link>
                </span>
              ))}
              . Las preguntas falladas volverán antes en los repasos.
            </p>
          )}
          {failed > 0 && (
            <div className="self-start">
              <QuickModeButton mode="failed_review" subjectId={attempt.subject_id} label="Repasar fallos" />
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="preguntas">
        <h2 id="preguntas" className="mb-3 text-lg font-semibold">
          Preguntas
        </h2>
        <ol className="flex flex-col gap-4">
          {present.map((item, n) => {
            const q = byId.get(item.question_id)!;
            const result = RESULT_VIEW[itemResult(item)];
            const Icon = result.icon;
            const selfGrade = item.user_answer?.selfGrade;
            const isPending = itemResult(item) === "pending";
            return (
              <li
                key={item.id}
                id={`item-${item.id}`}
                className={`${cardClass} flex scroll-mt-4 flex-col gap-3 p-5`}
                aria-label={`Pregunta ${n + 1}`}
              >
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span className="font-semibold text-foreground">{n + 1}.</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${result.className}`}>
                    <Icon className="size-3.5" aria-hidden />
                    {result.label}
                  </span>
                  <SourceBadge source={q.sourceType} detail={sourceDetail(q)} />
                  {q.topicId && <span>{topicName.get(q.topicId)}</span>}
                  {exam && item.score !== null && (
                    <span>
                      · {fmt(item.score, 2)} / {fmt(item.points, 2)} ptos.
                    </span>
                  )}
                  {item.flagged && (
                    <span className="inline-flex items-center gap-1 text-warning">
                      <Flag className="size-3.5" aria-hidden /> Marcada
                    </span>
                  )}
                  <Link href={`/preguntas/${q.id}`} className="ml-auto underline">
                    Ver ficha
                  </Link>
                </div>
                <RichText text={q.stem} />
                <p className="text-sm">
                  <span className="text-muted">Tu respuesta: </span>
                  <span className="whitespace-pre-wrap">{describeResponse(item.user_answer?.response)}</span>
                  {selfGrade && <span className="text-muted"> · te pusiste «{SELF_GRADE_LABELS[selfGrade]}»</span>}
                </p>
                <div>
                  {bodyKind(q.questionType) === "choice" && <p className="mb-2 text-sm font-medium text-muted">Solución</p>}
                  <QuestionBodyView question={{ ...q, content: { ...q.content, code: null } }} />
                </div>
                {q.explanation && (
                  <div className="rounded-lg bg-background p-3 text-sm">
                    <p className="mb-1 font-medium">Explicación</p>
                    <RichText text={q.explanation} />
                  </div>
                )}
                {aiEnabled && (itemResult(item) === "incorrect" || itemResult(item) === "partial") && <ExplainButton itemId={item.id} />}
                {isPending && (
                  <form action={selfGradeExamItemAction} className="flex flex-col gap-2 rounded-lg bg-primary-soft p-3">
                    <input type="hidden" name="itemId" value={item.id} />
                    <p className="text-sm font-medium">¿Cómo te ha salido comparado con la solución?</p>
                    <div className="grid grid-cols-3 gap-2">
                      {SELF_GRADES.map((g) => (
                        <button key={g} type="submit" name="selfGrade" value={g} className={buttonClass.secondary}>
                          {SELF_GRADE_LABELS[g]}
                        </button>
                      ))}
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
