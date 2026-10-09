import "server-only";
import { createClient } from "@/lib/supabase/server";

/* Disponibilidad semanal y días sin estudio (entradas del planificador). */

export type BlockedDay = { id: string; day: string; reason: string | null };

/** Minutos disponibles por día de la semana, índice 0 = domingo. */
export async function getWeeklyAvailability(): Promise<number[]> {
  const db = await createClient();
  const { data, error } = await db.from("availability_rules").select("weekday, minutes");
  if (error) throw new Error(`Cargar disponibilidad: ${error.message}`);
  const minutes = Array<number>(7).fill(0);
  for (const r of data as { weekday: number; minutes: number }[]) minutes[r.weekday] = r.minutes;
  return minutes;
}

export async function saveWeeklyAvailability(userId: string, minutesByWeekday: number[]): Promise<void> {
  const db = await createClient();
  const { error } = await db.from("availability_rules").upsert(
    minutesByWeekday.map((minutes, weekday) => ({ user_id: userId, weekday, minutes })),
    { onConflict: "user_id,weekday" },
  );
  if (error) throw new Error(`Guardar disponibilidad: ${error.message}`);
}

export async function listBlockedDays(fromDay?: string): Promise<BlockedDay[]> {
  const db = await createClient();
  let query = db.from("blocked_days").select("id, day, reason");
  if (fromDay) query = query.gte("day", fromDay);
  const { data, error } = await query.order("day");
  if (error) throw new Error(`Cargar días sin estudio: ${error.message}`);
  return data as BlockedDay[];
}

export async function addBlockedDay(userId: string, day: string, reason: string | null): Promise<void> {
  const db = await createClient();
  const { error } = await db
    .from("blocked_days")
    .upsert({ user_id: userId, day, reason }, { onConflict: "user_id,day" });
  if (error) throw new Error(`Añadir día sin estudio: ${error.message}`);
}

export async function removeBlockedDay(id: string): Promise<void> {
  const db = await createClient();
  const { error } = await db.from("blocked_days").delete().eq("id", id);
  if (error) throw new Error(`Quitar día sin estudio: ${error.message}`);
}
