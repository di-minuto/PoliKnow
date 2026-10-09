import { buildStoragePath } from "@/domain/documents/types";
import { BACKUP_TABLES, CATALOG_TABLES, NULLABLE_REFS, stripRow, type Backup, type Row } from "./format";

/*
 * Plan para restaurar una copia en la cuenta actual. Todo recibe ids nuevos
 * (así no choca con nada y se puede importar en otra cuenta o en otro
 * Supabase); las referencias, también dentro de los JSON, se traducen.
 * Los documentos que ya tienes (mismo archivo, misma huella) no se duplican.
 */

export type RestoreContext = {
  userId: string;
  /** Documentos que ya están en la cuenta: huella → id. */
  existingDocuments: ReadonlyMap<string, string>;
  /** Ids de documento del backup cuyo archivo viene en el ZIP. */
  filesAvailable: ReadonlySet<string>;
  newId: () => string;
};

export type RestorePlan = {
  /** onConflict: tablas con una fila por día; si ya la tienes, se queda la tuya. */
  inserts: { table: string; rows: Row[]; onConflict?: string }[];
  /** Referencias a la misma tabla (variante de, reprogramada de): se ponen después. */
  updates: { table: string; id: string; patch: Row }[];
  /** Archivos a subir: del ZIP (ruta del backup) a Storage (ruta nueva). */
  uploads: { from: string; documentId: string; storagePath: string; mimeType: string | null }[];
  profile: Row | null;
  catalogs: { table: string; rows: Row[] }[];
  skipped: { documentsWithoutFile: number; reusedDocuments: number; orphanRows: number };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JSON_COLUMNS = new Set(["content", "answer", "config", "summary", "user_answer", "metadata", "citations", "rules", "settings"]);

/** Sustituye en un JSON cualquier id conocido por su id nuevo. */
export function remapJson(value: unknown, ids: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") return UUID.test(value) ? (ids.get(value) ?? value) : value;
  if (Array.isArray(value)) return value.map((v) => remapJson(v, ids));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remapJson(v, ids)]));
  }
  return value;
}

/** Los temas padre van antes que sus subtemas. */
function parentsFirst(rows: Row[]): Row[] {
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  const out: Row[] = [];
  const done = new Set<string>();
  const visit = (r: Row, depth = 0) => {
    const id = r.id as string;
    if (done.has(id) || depth > 50) return;
    const parent = r.parent_id ? byId.get(r.parent_id as string) : undefined;
    if (parent) visit(parent, depth + 1);
    done.add(id);
    out.push(r);
  };
  rows.forEach((r) => visit(r));
  return out;
}

const SELF_REFS: Record<string, string> = { questions: "variant_of", plan_tasks: "rescheduled_from" };
/** Nadie apunta a estas filas: se insertan sin id y sin pisar las que ya tengas. */
const KEEP_EXISTING: Record<string, string> = { availability_rules: "user_id,weekday", blocked_days: "user_id,day" };

export function planRestore(backup: Backup, ctx: RestoreContext): RestorePlan {
  const ids = new Map<string, string>();
  const skipped = { documentsWithoutFile: 0, reusedDocuments: 0, orphanRows: 0 };
  const uploads: RestorePlan["uploads"] = [];
  const reused = new Set<string>();
  const rowsOf = (t: string) => (backup.tables[t] ?? []).map(stripRow);

  // 1. Ids nuevos para todo lo que tiene id (los documentos, según su archivo).
  for (const { name } of BACKUP_TABLES) {
    for (const row of rowsOf(name)) {
      const old = row.id;
      if (typeof old !== "string" || name in KEEP_EXISTING) continue;
      if (name === "documents") {
        const existing = typeof row.sha256 === "string" ? ctx.existingDocuments.get(row.sha256) : undefined;
        if (existing) {
          ids.set(old, existing);
          reused.add(old);
          skipped.reusedDocuments++;
          continue;
        }
        if (!ctx.filesAvailable.has(old)) {
          skipped.documentsWithoutFile++;
          continue;
        }
      }
      ids.set(old, ctx.newId());
    }
  }

  // 2. Filas con las referencias traducidas.
  const inserts: RestorePlan["inserts"] = [];
  const updates: RestorePlan["updates"] = [];
  for (const { name, refs } of BACKUP_TABLES) {
    let rows = rowsOf(name);
    if (name === "topics") rows = parentsFirst(rows);
    const out: Row[] = [];
    for (const row of rows) {
      const oldId = typeof row.id === "string" ? row.id : null;
      if (name === "documents" && (!oldId || reused.has(oldId) || !ids.has(oldId))) continue;
      // De un documento que ya tenías no se copian texto ni vínculos: ya los tiene.
      if ((name === "document_chunks" || name === "document_topics" || name === "document_assessments") && reused.has(row.document_id as string)) {
        continue;
      }
      const next: Row = {};
      let orphan = false;
      for (const [col, value] of Object.entries(row)) {
        if (col === "id" && name in KEEP_EXISTING) continue;
        if (col === "id" && oldId) next.id = ids.get(oldId);
        else if (col in refs) {
          const mapped = typeof value === "string" ? ids.get(value) : undefined;
          if (value != null && !mapped) {
            if (!NULLABLE_REFS[name]?.includes(col)) orphan = true;
            next[col] = null;
          } else next[col] = mapped ?? null;
        } else if (JSON_COLUMNS.has(col)) next[col] = remapJson(value, ids);
        else next[col] = value;
      }
      if (orphan || (oldId && !next.id && !(name in KEEP_EXISTING))) {
        skipped.orphanRows++;
        continue;
      }
      const self = SELF_REFS[name];
      if (self && next[self]) {
        updates.push({ table: name, id: next.id as string, patch: { [self]: next[self] } });
        next[self] = null;
      }
      if (name === "documents") {
        const filename = (row.original_filename as string | null) ?? (row.storage_path as string).split("/").pop() ?? "archivo";
        next.storage_path = buildStoragePath(ctx.userId, next.id as string, filename);
        uploads.push({ from: oldId!, documentId: next.id as string, storagePath: next.storage_path as string, mimeType: (row.mime_type as string | null) ?? null });
      }
      out.push(next);
    }
    if (out.length) inserts.push({ table: name, rows: out, ...(name in KEEP_EXISTING && { onConflict: KEEP_EXISTING[name] }) });
  }

  const profile = backup.profile
    ? Object.fromEntries(
        Object.entries(backup.profile)
          .filter(([k]) => ["display_name", "timezone", "settings"].includes(k))
          .map(([k, v]) => [k, remapJson(v, ids)]),
      )
    : null;
  // Los tipos propios llevan dueño explícito (la BD no lo rellena en los catálogos).
  const catalogs = Object.entries(backup.catalogs)
    .filter(([table]) => (CATALOG_TABLES as readonly string[]).includes(table))
    .map(([table, rows]) => ({ table, rows: rows.map((r) => ({ ...stripRow(r), user_id: ctx.userId })) }));

  return { inserts, updates, uploads, profile, catalogs, skipped };
}
