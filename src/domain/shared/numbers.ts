/** Lee un número escrito a la española ("3,5") o con punto. */
export function parseLocaleNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/\s/g, "");
  if (!cleaned) return null;
  // "1.234,5" → 1234.5 ; "3,5" → 3.5 ; "1e-3" → 0.001
  const normalized = /,\d*$/.test(cleaned) ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
