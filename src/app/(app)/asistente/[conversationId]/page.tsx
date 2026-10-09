import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { AIDisabled } from "@/components/ai/ai-disabled";
import { AssistantForm } from "@/components/ai/assistant-form";
import { AssistantMessages } from "@/components/ai/assistant-messages";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { deleteConversationAction } from "@/server/actions/assistant";
import { aiInfo } from "@/server/ai";
import { getConversation, listMessages } from "@/server/repositories/assistant";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string) {
  if (!UUID.test(id)) notFound();
  const conversation = await getConversation(id);
  if (!conversation) notFound();
  return conversation;
}

export async function generateMetadata({ params }: PageProps<"/asistente/[conversationId]">): Promise<Metadata> {
  return { title: (await load((await params).conversationId)).title };
}

export default async function ConversationPage({ params }: PageProps<"/asistente/[conversationId]">) {
  const conversation = await load((await params).conversationId);
  const messages = await listMessages(conversation.id);
  const ai = aiInfo();
  const last = messages.at(-1);
  return (
    <>
      <header className="mb-6">
        <Link href="/asistente" className="text-sm text-muted hover:underline">
          ← Asistente
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight break-words">{conversation.title}</h1>
      </header>
      <div className="flex flex-col gap-6">
        <AssistantMessages messages={messages} />
        {last?.role === "user" && (
          <p className="text-sm text-muted">La última pregunta se quedó sin respuesta. Vuelve a enviarla.</p>
        )}
        {ai.enabled ? (
          <AssistantForm key={messages.length} conversationId={conversation.id} />
        ) : (
          <AIDisabled feature="El asistente" reason={ai.reason} />
        )}
        <form action={deleteConversationAction} className="self-start">
          <input type="hidden" name="id" value={conversation.id} />
          <ConfirmButton message="¿Borrar esta conversación?">
            <Trash2 className="size-4" aria-hidden />
            Borrar conversación
          </ConfirmButton>
        </form>
      </div>
    </>
  );
}
