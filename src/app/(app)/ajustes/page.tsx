import type { Metadata } from "next";
import Link from "next/link";
import { DatabaseBackup, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/field";
import { buttonClass, cardClass, inputClass } from "@/components/ui/styles";
import { AIDisabled } from "@/components/ai/ai-disabled";
import { SignOutButton } from "@/components/pwa/sign-out-button";
import { aiInfo, aiUsage } from "@/server/ai";
import { formatDayKey, toLocalDayKey } from "@/lib/dates";
import { addBlockedDayAction, removeBlockedDayAction, saveAvailabilityAction } from "@/server/actions/planning";
import { getCurrentUser } from "@/server/auth";
import { getProfile } from "@/server/profile";
import { getWeeklyAvailability, listBlockedDays } from "@/server/repositories/planning";

export const metadata: Metadata = { title: "Ajustes" };

/** Orden de lunes a domingo; el valor es el índice de getDay() (0 = domingo). */
const WEEK = [
  [1, "Lunes"],
  [2, "Martes"],
  [3, "Miércoles"],
  [4, "Jueves"],
  [5, "Viernes"],
  [6, "Sábado"],
  [0, "Domingo"],
] as const;

export default async function SettingsPage() {
  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()]);
  const today = toLocalDayKey(new Date(), profile.timezone);
  const [availability, blockedDays] = await Promise.all([getWeeklyAvailability(), listBlockedDays(today)]);
  const ai = aiInfo();
  const usage = ai.enabled ? await aiUsage() : null;
  const weeklyHours = availability.reduce((a, b) => a + b, 0) / 60;

  return (
    <>
      <PageHeader title="Ajustes" />

      <div className="flex flex-col gap-8">
        <section>
          <h2 className="mb-1 text-lg font-semibold">Tiempo disponible</h2>
          <p className="mb-3 text-sm text-muted">
            Horas que puedes estudiar cada día de la semana. Total: {weeklyHours.toLocaleString("es-ES")} h/semana.
          </p>
          <div className={`${cardClass} p-4`}>
            <ActionForm action={saveAvailabilityAction} submitLabel="Guardar horario" successMessage="Guardado.">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {WEEK.map(([weekday, label]) => (
                  <Field key={weekday} label={label}>
                    <input
                      name={`weekday:${weekday}`}
                      type="number"
                      min={0}
                      max={16}
                      step={0.25}
                      defaultValue={availability[weekday] / 60}
                      className={inputClass}
                      aria-label={`Horas el ${label.toLowerCase()}`}
                    />
                  </Field>
                ))}
              </div>
            </ActionForm>
          </div>
        </section>

        <section>
          <h2 className="mb-1 text-lg font-semibold">Días sin estudio</h2>
          <p className="mb-3 text-sm text-muted">Viajes, fiestas, otros compromisos: el plan no asignará tareas esos días.</p>
          {blockedDays.length > 0 && (
            <ul className={`${cardClass} mb-3 divide-y divide-border`}>
              {blockedDays.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="flex-1">
                    <span className="font-medium">{formatDayKey(d.day)}</span>
                    {d.reason && <span className="text-sm text-muted"> · {d.reason}</span>}
                  </span>
                  <form action={removeBlockedDayAction}>
                    <input type="hidden" name="id" value={d.id} />
                    <ConfirmButton message="¿Quitar este día?" className={buttonClass.icon} title="Quitar">
                      <X className="size-4" />
                    </ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <div className={`${cardClass} p-4`}>
            <ActionForm action={addBlockedDayAction} submitLabel="Añadir día" resetOnSuccess>
              <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                <Field label="Día">
                  <input name="day" type="date" required min={today} className={inputClass} />
                </Field>
                <Field label="Motivo (opcional)">
                  <input name="reason" maxLength={200} className={inputClass} />
                </Field>
              </div>
            </ActionForm>
          </div>
        </section>

        <section>
          <h2 className="mb-1 text-lg font-semibold">Inteligencia artificial</h2>
          <p className="mb-3 text-sm text-muted">
            Las respuestas se guardan: repetir la misma petición no gasta nada. Las claves se configuran en Vercel, no aquí.
          </p>
          {ai.enabled && usage ? (
            <dl className={`${cardClass} divide-y divide-border`} aria-label="Uso de la IA">
              <Row label="Proveedor" value={`${ai.provider} · ${ai.model}`} />
              <Row
                label="Hoy"
                value={`${usage.today.tokens.toLocaleString("es-ES")} tokens${ai.dailyLimit ? ` de ${ai.dailyLimit.toLocaleString("es-ES")}` : ""} · ${usage.today.calls} ${usage.today.calls === 1 ? "llamada" : "llamadas"}`}
              />
              <Row label="Este mes" value={`${usage.month.tokens.toLocaleString("es-ES")} tokens · ${usage.month.calls} llamadas`} />
            </dl>
          ) : (
            <AIDisabled feature="El asistente, generar preguntas y explicar fallos" reason={ai.reason} />
          )}
        </section>

        <section>
          <h2 className="mb-1 text-lg font-semibold">Tus datos</h2>
          <p className="mb-3 text-sm text-muted">Descarga una copia de todo (JSON o ZIP con archivos) o recupérala.</p>
          <Link href="/datos" className={buttonClass.secondary}>
            <DatabaseBackup className="size-4" aria-hidden />
            Copia de seguridad
          </Link>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Cuenta</h2>
          <dl className={`${cardClass} divide-y divide-border`}>
            <Row label="Email" value={user.email ?? "—"} />
            <Row label="Zona horaria" value={profile.timezone} />
          </dl>
          <SignOutButton />
        </section>
      </div>
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
