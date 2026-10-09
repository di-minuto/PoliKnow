import type { Metadata } from "next";
import Link from "next/link";
import { AIDisabled } from "@/components/ai/ai-disabled";
import { AssistantForm, SUGGESTIONS } from "@/components/ai/assistant-form";
import { PageHeader } from "@/components/layout/page-header";
import { cardClass } from "@/components/ui/styles";
import { formatDateTime } from "@/lib/dates";
import { aiInfo } from "@/server/ai";
import { getProfile } from "@/server/profile";
import { listSubjects } from "@/server/repositories/academic";
import { listConversations } from "@/server/repositories/assistant";

export const metadata: Metadata = { title: "Asistente" };

export default async function AssistantPage() {
  const ai = aiInfo();
  const [conversations, subjects, profile] = await Promise.all([listConversations(), listSubjects(), getProfile()]);
  return (
    <>
      <PageHeader title="Asistente" subtitle="Pregunta sobre tus apuntes y exámenes. Responde con tus documentos y cita de dónde sale cada cosa." />
      <div className="flex flex-col gap-8">
        {ai.enabled ? (
          <AssistantForm
            subjects={subjects.filter((s) => !s.archived).map((s) => ({ id: s.id, label: s.code ?? s.name }))}
            suggestions={SUGGESTIONS}
          />
        ) : (
          <AIDisabled feature="El asistente" reason={ai.reason} />
        )}

        {conversations.length > 0 && (
          <section aria-labelledby="conversaciones">
            <h2 id="conversaciones" className="mb-3 text-lg font-semibold">
              Conversaciones
            </h2>
            <ul className={`${cardClass} divide-y divide-border`}>
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link href={`/asistente/${c.id}`} className="block px-4 py-3 hover:bg-primary-soft/50">
                    <p className="line-clamp-2">{c.title}</p>
                    <p className="text-xs text-muted">{formatDateTime(c.updatedAt, profile.timezone)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
