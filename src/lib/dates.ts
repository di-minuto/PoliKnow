export const DEFAULT_TIMEZONE = "Europe/Madrid";

/** "jueves, 8 de octubre" en la zona horaria del usuario. */
export function formatDayHeading(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(date);
}

/** Fecha local (YYYY-MM-DD) en la zona del usuario: clave de día del planificador. */
export function toLocalDayKey(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Días naturales entre dos claves YYYY-MM-DD (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

function wallClockParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

/** Diferencia (ms) entre la hora local de `timeZone` y UTC en ese instante. */
function offsetMs(date: Date, timeZone: string): number {
  const p = wallClockParts(date, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Convierte la hora de un <input type="datetime-local"> ("2026-11-05T09:00"),
 * entendida en la zona del usuario, a un instante ISO en UTC.
 */
export function zonedLocalToUtc(local: string, timeZone: string = DEFAULT_TIMEZONE): string {
  const match = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) throw new RangeError(`Fecha no válida: ${local}`);
  const [, y, m, d, h, min] = match.map(Number);
  const asUtc = Date.UTC(y, m - 1, d, h, min);
  let result = asUtc - offsetMs(new Date(asUtc), timeZone);
  // Segunda pasada por si el cambio de hora cae entre medias.
  result = asUtc - offsetMs(new Date(result), timeZone);
  return new Date(result).toISOString();
}

/** Inverso de zonedLocalToUtc: valor para rellenar un <input type="datetime-local">. */
export function utcToZonedLocal(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  const p = wallClockParts(new Date(iso), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
}

/** "jue, 5 nov 2026, 09:00" */
export function formatDateTime(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/** "5 nov 2026" para claves YYYY-MM-DD. */
export function formatDayKey(day: string): string {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/** Días naturales que faltan hasta un instante, contados en la zona del usuario. */
export function daysUntil(iso: string, now: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): number {
  return daysBetween(toLocalDayKey(now, timeZone), toLocalDayKey(new Date(iso), timeZone));
}

/** "Hoy", "Mañana", "Faltan 12 días", "Hace 3 días" */
export function countdownLabel(days: number): string {
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days > 1) return `Faltan ${days} días`;
  if (days === -1) return "Ayer";
  return `Hace ${-days} días`;
}
