import type { Metadata } from "next";
import { signOut } from "@/app/(auth)/login/actions";
import { PageHeader } from "@/components/layout/page-header";
import { getAIProvider } from "@/ai";
import { getCurrentUser } from "@/server/auth";
import { getProfile } from "@/server/profile";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()]);
  const ai = getAIProvider();

  return (
    <>
      <PageHeader title="Ajustes" />
      <dl className="divide-y divide-border rounded-2xl border border-border bg-surface">
        <Row label="Cuenta" value={user.email ?? "—"} />
        <Row label="Zona horaria" value={profile.timezone} />
        <Row label="Asistente IA" value={ai.enabled ? `Activado (${ai.name})` : "Desactivado"} />
      </dl>
      <p className="mt-3 text-sm text-muted">
        Disponibilidad semanal, días sin estudio y exportación de datos llegarán en las fases 7 y 11.
      </p>
      <form action={signOut} className="mt-8">
        <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm font-medium">
          Cerrar sesión
        </button>
      </form>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="truncate text-sm font-medium">{value}</dd>
    </div>
  );
}
