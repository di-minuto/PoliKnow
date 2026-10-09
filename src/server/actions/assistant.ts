"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assistantRequest } from "@/ai/prompts";
import { taskLabel } from "@/components/plan/plan-format";
import { describeResponse } from "@/components/practice/response-view";
import { citedSources, searchQuery, wantsStudyState } from "@/domain/assistant/retrieval";
import { solutionText } from "@/domain/questions/solution";
import { SOURCE_TYPE_LABELS } from "@/domain/questions/types";
import { pct } from "@/domain/stats/stats";
import { toLocalDayKey } from "@/lib/dates";
import { failure, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { aiErrorMessage, runAI } from "@/server/ai";
import { searchSources } from "@/server/ai-context";
import { getCurrentUser } from "@/server/auth";
import { getProfile } from "@/server/profile";
import { listSubjects, listTopics } from "@/server/repositories/academic";
import * as repo from "@/server/repositories/assistant";
import { listTasks } from "@/server/repositories/planning";
import { getQuestionsByIds, listOfficialExams } from "@/server/repositories/questions";
import { loadStats } from "@/server/stats";

/*
 * Asistente de estudio: busca en tus documentos (texto completo), añade tu
 * estado de estudio si la pregunta lo pide y responde citando las fuentes.
 */

const uuid = z.uuid();

/** Resumen compacto del estado de estudio para el prompt (solo lo que hace falta). */
async function studyState(question: string): Promise<string> {
  const wants = wantsStudyState(question);
  const lines: string[] = [];
  const { timezone } = await getProfile();
  const today = toLocalDayKey(new Date(), timezone);
  lines.push(`Hoy es ${today}.`);
  if (wants.plan || wants.weak) {
    const stats = await loadStats();
    for (const a of stats.assessments.slice(0, 6)) {
      const name = `${a.subject?.code ?? a.subject?.name ?? ""} ${a.assessment.name}`;
      lines.push(
        `Examen ${name}: ${a.daysLeft === null ? "sin fecha" : `faltan ${a.daysLeft} días`}` +
          (a.readiness ? `, preparación estimada ${pct(a.readiness.score)}%.` : "."),
      );
    }
    if (stats.weak.length) lines.push(`Temas débiles: ${stats.weak.map((w) => `${w.topic.name} (${pct(w.mastery)}% dominio)`).join("; ")}.`);
    if (stats.strong.length) lines.push(`Temas fuertes: ${stats.strong.map((w) => w.topic.name).join("; ")}.`);
    const flat = stats.subjects.flatMap((s) => s.topics.map((t) => ({ s: s.subject, t })));
    const notStarted = flat.filter((x) => x.t.coverage === 0).slice(0, 8);
    if (notStarted.length) lines.push(`Temas sin empezar: ${notStarted.map((x) => `${x.s.code ?? x.s.name} ${x.t.topic.name}`).join("; ")}.`);
  }
  if (wants.plan) {
    const [tasks, subjects, topics] = await Promise.all([listTasks(today, today), listSubjects(), listTopics()]);
    const subjectName = new Map(subjects.map((s) => [s.id, s.code ?? s.name]));
    const topicName = new Map(topics.map((t) => [t.id, t.name]));
    lines.push(
      tasks.length
        ? `Plan de hoy: ${tasks
            .map((t) => `${subjectName.get(t.subjectId) ?? ""} ${t.topicId ? (topicName.get(t.topicId) ?? "") : ""} · ${taskLabel(t)} (${t.status})`)
            .join("; ")}.`
        : "Plan de hoy: no hay tareas (revisa fechas de examen y horas disponibles).",
    );
  }
  if (wants.mistakes) {
    const mistakes = await repo.recentMistakes(5);
    const qs = await getQuestionsByIds([...new Set(mistakes.map((m) => m.question_id))]);
    const byId = new Map(qs.map((q) => [q.id, q]));
    for (const m of mistakes) {
      const q = byId.get(m.question_id);
      if (!q) continue;
      lines.push(
        `Fallo reciente: «${q.stem.slice(0, 300)}» · respondió ${describeResponse(m.user_answer?.response)} · correcta: ${solutionText(q).correct.slice(0, 200)}` +
          (q.explanation ? ` · explicación: ${q.explanation.slice(0, 200)}` : ""),
      );
    }
  }
  return lines.join("\n");
}

/** Preguntas del banco relacionadas, marcando siempre su procedencia. */
async function relatedQuestions(question: string, subjectId: string | null): Promise<string[]> {
  const q = searchQuery(question);
  if (!q) return [];
  const db = await createClient();
  const { data } = await db.rpc("search_all", { q, subject: subjectId, max_results: 30 });
  const ids = ((data ?? []) as { kind: string; id: string }[]).filter((h) => h.kind === "question").slice(0, 4).map((h) => h.id);
  if (ids.length === 0) return [];
  const [qs, exams] = await Promise.all([getQuestionsByIds(ids), listOfficialExams()]);
  const examTitle = new Map(exams.map((e) => [e.id, e]));
  return qs.map((q) => {
    const exam = q.officialExamId ? examTitle.get(q.officialExamId) : null;
    const origin = exam
      ? `Examen oficial «${exam.title}»${exam.year ? ` ${exam.year}` : ""}${q.officialPosition ? `, pregunta ${q.officialPosition}` : ""}`
      : SOURCE_TYPE_LABELS[q.sourceType];
    return `- [${origin}] ${q.stem.slice(0, 500)} → solución: ${solutionText(q).correct.slice(0, 300)}`;
  });
}

export async function sendAssistantMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return failure("Escribe una pregunta.");
  if (message.length > 4000) return failure("Máximo 4000 caracteres.");
  const rawConversation = formData.get("conversationId");
  const rawSubject = formData.get("subjectId");
  let conversationId = typeof rawConversation === "string" && uuid.safeParse(rawConversation).success ? rawConversation : null;

  try {
    let subjectId = typeof rawSubject === "string" && uuid.safeParse(rawSubject).success ? rawSubject : null;
    if (conversationId) {
      const conversation = await repo.getConversation(conversationId);
      if (!conversation) return failure("Conversación no encontrada.");
      subjectId = conversation.subjectId;
    } else {
      conversationId = await repo.createConversation(message.length > 70 ? `${message.slice(0, 67)}…` : message, subjectId);
    }
    const previous = await repo.listMessages(conversationId);
    await repo.addMessage(conversationId, { role: "user", content: message });

    // Para preguntas de seguimiento («¿y en MPI?») se busca también con la anterior.
    const lastUser = [...previous].reverse().find((m) => m.role === "user")?.content ?? "";
    let sources = await searchSources(message, { subjectId, limit: 6 });
    if (sources.length < 2 && lastUser) sources = await searchSources(`${message} ${lastUser}`, { subjectId, limit: 6 });
    const [state, questions] = await Promise.all([studyState(message), relatedQuestions(message, subjectId)]);

    const history = [...previous, { role: "user" as const, content: message }].map((m) => ({ role: m.role, content: m.content }));
    const result = await runAI(assistantRequest({ history, sources, studyState: state, questions }), {
      cacheInput: { history, sources: sources.map((s) => [s.documentId, s.chunkIndex]), state, questions },
    });
    const citations: repo.StoredCitation[] = citedSources(result.text, sources.length).map((n) => {
      const s = sources[n - 1];
      return { n, document_id: s.documentId, chunk_index: s.chunkIndex, page: s.page, title: s.title, location: s.location ?? null };
    });
    await repo.addMessage(conversationId, {
      role: "assistant",
      content: result.text,
      citations,
      provider: result.provider,
      model: result.model,
    });
  } catch (error) {
    if (conversationId) revalidatePath(`/asistente/${conversationId}`);
    return failure(aiErrorMessage(error));
  }
  revalidatePath("/asistente", "layout");
  redirect(`/asistente/${conversationId}`);
}

export async function deleteConversationAction(formData: FormData): Promise<void> {
  await getCurrentUser();
  await repo.deleteConversation(uuid.parse(formData.get("id")));
  revalidatePath("/asistente", "layout");
  redirect("/asistente");
}
