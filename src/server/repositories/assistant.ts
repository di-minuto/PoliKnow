import "server-only";
import { createClient } from "@/lib/supabase/server";
import { check } from "./academic";

/** Fuente citada en una respuesta del asistente (assistant_messages.citations). */
export type StoredCitation = {
  n: number;
  document_id: string;
  chunk_index: number;
  page: number | null;
  title: string;
  location: string | null;
};

export type Conversation = { id: string; title: string; subjectId: string | null; updatedAt: string };
export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: StoredCitation[];
  model: string | null;
  createdAt: string;
};

type ConversationRow = { id: string; title: string | null; subject_id: string | null; updated_at: string };
const toConversation = (r: ConversationRow): Conversation => ({
  id: r.id,
  title: r.title ?? "Conversación",
  subjectId: r.subject_id,
  updatedAt: r.updated_at,
});

export async function listConversations(limit = 30): Promise<Conversation[]> {
  const db = await createClient();
  const rows = check<ConversationRow[]>(
    "Listar conversaciones",
    await db.from("assistant_conversations").select("id, title, subject_id, updated_at").order("updated_at", { ascending: false }).limit(limit),
  );
  return rows.map(toConversation);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const db = await createClient();
  const rows = check<ConversationRow[]>(
    "Leer conversación",
    await db.from("assistant_conversations").select("id, title, subject_id, updated_at").eq("id", id).limit(1),
  );
  return rows[0] ? toConversation(rows[0]) : null;
}

export async function listMessages(conversationId: string): Promise<AssistantMessage[]> {
  const db = await createClient();
  const rows = check<
    { id: string; role: "user" | "assistant"; content: string; citations: StoredCitation[] | null; model: string | null; created_at: string }[]
  >(
    "Leer mensajes",
    await db
      .from("assistant_messages")
      .select("id, role, content, citations, model, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at")
      .order("role", { ascending: false }),
  );
  return rows.map((r) => ({ id: r.id, role: r.role, content: r.content, citations: r.citations ?? [], model: r.model, createdAt: r.created_at }));
}

export async function createConversation(title: string, subjectId: string | null): Promise<string> {
  const db = await createClient();
  return check<{ id: string }>(
    "Crear conversación",
    await db.from("assistant_conversations").insert({ title, subject_id: subjectId }).select("id").single(),
  ).id;
}

export async function addMessage(
  conversationId: string,
  message: { role: "user" | "assistant"; content: string; citations?: StoredCitation[]; provider?: string; model?: string },
): Promise<void> {
  const db = await createClient();
  check(
    "Guardar mensaje",
    await db.from("assistant_messages").insert({
      conversation_id: conversationId,
      role: message.role,
      content: message.content,
      citations: message.citations ?? [],
      provider: message.provider ?? null,
      model: message.model ?? null,
    }),
  );
  check(
    "Actualizar conversación",
    await db.from("assistant_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId),
  );
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await createClient();
  check("Borrar conversación", await db.from("assistant_conversations").delete().eq("id", id));
}

/** Últimas respuestas falladas, para «explícame por qué he fallado». */
export async function recentMistakes(limit = 5) {
  const db = await createClient();
  return check<{ user_answer: { response?: unknown } | null; question_id: string; answered_at: string }[]>(
    "Últimos fallos",
    await db
      .from("attempt_items")
      .select("user_answer, question_id, answered_at")
      .eq("is_correct", false)
      .not("answered_at", "is", null)
      .order("answered_at", { ascending: false })
      .limit(limit),
  );
}
