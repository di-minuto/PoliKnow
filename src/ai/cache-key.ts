import { createHash } from "node:crypto";

/** JSON con claves ordenadas: el mismo contenido produce siempre la misma cadena. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** Clave de la tabla ai_cache: hash de proveedor + modelo + versión de prompt + entrada. */
export function buildCacheKey(parts: {
  provider: string;
  model: string;
  task: string;
  promptVersion?: string;
  input: unknown;
}): string {
  return createHash("sha256")
    .update(stableStringify({ ...parts, promptVersion: parts.promptVersion ?? "1" }))
    .digest("hex");
}
