import type { SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import {
  BACKUP_FORMAT,
  BACKUP_TABLES,
  BACKUP_VERSION,
  CATALOG_TABLES,
  backupSchema,
  countRows,
  stripRow,
  zipFilePath,
  type Backup,
  type Row,
} from "@/domain/backup/format";
import { planRestore, type RestorePlan } from "@/domain/backup/restore";
import { downloadFile, uploadFile } from "@/lib/documents/browser";

/*
 * Exportar e importar se hace en el navegador, con tu sesión: los datos y los
 * archivos no pasan por el servidor de la app (ni por sus límites de tamaño).
 */

const PAGE = 1000;
const INSERT_BATCH = 200;
const BUCKET = "documents";

export type BackupProgress = { step: string; done: number; total: number };
type OnProgress = (p: BackupProgress) => void;

async function currentUser(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Tu sesión ha caducado. Vuelve a entrar.");
  return data.user;
}

/** Todas las filas de la tabla, por páginas y en un orden estable. ownOnly: en los catálogos, solo las tuyas. */
async function readAll(supabase: SupabaseClient, table: string, order: readonly string[], ownOnly = false): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = supabase.from(table).select("*");
    let query = ownOnly ? base.not("user_id", "is", null) : base;
    for (const col of order) query = query.order(col, { ascending: true });
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(`No se ha podido leer ${table}: ${error.message}`);
    rows.push(...(data as Row[]).map(stripRow));
    if (data.length < PAGE) return rows;
  }
}

const fileNameOf = (doc: Row) => (doc.original_filename as string | null) ?? String(doc.storage_path).split("/").pop() ?? "archivo";

export type ExportResult = { blob: Blob; filename: string; counts: Record<string, number>; missingFiles: number };

/** Copia completa: JSON con tus datos o, con archivos, un ZIP con el JSON y la biblioteca. */
export async function exportBackup(supabase: SupabaseClient, options: { files: boolean }, onProgress?: OnProgress): Promise<ExportResult> {
  const user = await currentUser(supabase);
  const total = BACKUP_TABLES.length + 2;
  let done = 0;
  const step = (name: string) => onProgress?.({ step: name, done: done++, total });

  step("Perfil");
  const profile = await supabase.from("profiles").select("display_name, timezone, settings").eq("id", user.id).maybeSingle();
  if (profile.error) throw new Error(profile.error.message);

  step("Tipos propios");
  const catalogs: Record<string, Row[]> = {};
  for (const table of CATALOG_TABLES) {
    const rows = await readAll(supabase, table, ["code"], true);
    if (rows.length) catalogs[table] = rows;
  }

  const tables: Record<string, Row[]> = {};
  for (const { name, order } of BACKUP_TABLES) {
    step(name);
    tables[name] = await readAll(supabase, name, order);
  }

  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    account: user.email ?? null,
    profile: profile.data,
    catalogs,
    tables,
  };
  const stamp = backup.exportedAt.slice(0, 10);
  const json = JSON.stringify(backup, null, 2);
  const counts = countRows(tables);

  if (!options.files) {
    return { blob: new Blob([json], { type: "application/json" }), filename: `estudio-copia-${stamp}.json`, counts, missingFiles: 0 };
  }

  const zip = new JSZip();
  zip.file("backup.json", json);
  const documents = tables.documents ?? [];
  let missingFiles = 0;
  for (const [i, doc] of documents.entries()) {
    onProgress?.({ step: `Archivo ${i + 1} de ${documents.length}`, done: i, total: documents.length });
    try {
      zip.file(zipFilePath(doc.id as string, fileNameOf(doc)), await downloadFile(supabase, doc.storage_path as string));
    } catch {
      missingFiles++;
    }
  }
  onProgress?.({ step: "Comprimiendo", done: documents.length, total: documents.length });
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { blob, filename: `estudio-copia-${stamp}.zip`, counts, missingFiles };
}

export type LoadedBackup = { backup: Backup; zip: JSZip | null; files: Map<string, JSZip.JSZipObject> };

/** Lee y valida un archivo de copia (JSON o ZIP). */
export async function readBackupFile(file: File): Promise<LoadedBackup> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // "PK"
  let text: string;
  let zip: JSZip | null = null;
  const files = new Map<string, JSZip.JSZipObject>();
  if (isZip) {
    zip = await JSZip.loadAsync(file).catch(() => {
      throw new Error("El ZIP está dañado o no se puede abrir.");
    });
    const entry = zip.file("backup.json");
    if (!entry) throw new Error("El ZIP no contiene backup.json: no es una copia de esta app.");
    text = await entry.async("string");
    zip.forEach((path, obj) => {
      const match = /^files\/([^/]+)\/[^/]+$/.exec(path);
      if (match && !obj.dir) files.set(match[1], obj);
    });
  } else {
    text = await file.text();
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("El archivo no es un JSON válido.");
  }
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "El archivo no tiene el formato de una copia.");
  return { backup: parsed.data, zip, files };
}

export type ImportResult = { counts: Record<string, number>; uploaded: number; skipped: RestorePlan["skipped"] };

async function inChunks<T>(items: T[], size: number, fn: (chunk: T[]) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

/**
 * Añade la copia a tu cuenta. Todo entra con ids nuevos, así que no borra ni
 * pisa nada; si algo falla a medias, se deshace lo que se había añadido.
 */
export async function importBackup(supabase: SupabaseClient, loaded: LoadedBackup, onProgress?: OnProgress): Promise<ImportResult> {
  const user = await currentUser(supabase);
  const existing = await supabase.from("documents").select("id, sha256");
  if (existing.error) throw new Error(existing.error.message);

  const plan = planRestore(loaded.backup, {
    userId: user.id,
    existingDocuments: new Map(existing.data.filter((d) => d.sha256).map((d) => [d.sha256 as string, d.id as string])),
    filesAvailable: new Set(loaded.files.keys()),
    newId: () => crypto.randomUUID(),
  });

  const uploaded: string[] = [];
  const inserted: { table: string; ids: string[] }[] = [];
  const total = plan.uploads.length + plan.inserts.length + 2;
  let done = 0;
  const step = (name: string) => onProgress?.({ step: name, done: done++, total });

  // Tus tipos (de pregunta, documento...) antes que las filas que los usan. Si el código ya existe, se deja.
  for (const { table, rows } of plan.catalogs) {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: "code", ignoreDuplicates: true });
    if (error) throw new Error(`No se han podido guardar tus tipos (${table}): ${error.message}`);
  }

  try {
    for (const [i, up] of plan.uploads.entries()) {
      step(`Archivo ${i + 1} de ${plan.uploads.length}`);
      const data = await loaded.files.get(up.from)!.async("arraybuffer");
      await uploadFile(supabase, up.storagePath, data, up.mimeType ?? "application/octet-stream");
      uploaded.push(up.storagePath);
    }

    for (const { table, rows, onConflict } of plan.inserts) {
      step(table);
      const ids: string[] = [];
      inserted.push({ table, ids });
      await inChunks(rows, INSERT_BATCH, async (batch) => {
        const { error } = onConflict
          ? await supabase.from(table).upsert(batch, { onConflict, ignoreDuplicates: true })
          : await supabase.from(table).insert(batch);
        if (error) throw new Error(`No se ha podido guardar ${table}: ${error.message}`);
        for (const r of batch) if (typeof r.id === "string") ids.push(r.id);
      });
    }

    step("Enlaces");
    for (const u of plan.updates) {
      const { error } = await supabase.from(u.table).update(u.patch).eq("id", u.id);
      if (error) throw new Error(`No se ha podido enlazar ${u.table}: ${error.message}`);
    }
  } catch (error) {
    await undo(supabase, inserted, uploaded);
    throw error;
  }

  // Perfil: si falla no se pierde nada importante.
  step("Perfil");
  if (plan.profile && Object.keys(plan.profile).length) await supabase.from("profiles").update(plan.profile).eq("id", user.id);

  return {
    counts: Object.fromEntries(plan.inserts.map((i) => [i.table, i.rows.length])),
    uploaded: uploaded.length,
    skipped: plan.skipped,
  };
}

/** Borra lo añadido, de lo último a lo primero (lo que cuelga de cada fila se va con ella). */
async function undo(supabase: SupabaseClient, inserted: { table: string; ids: string[] }[], uploaded: string[]) {
  for (const { table, ids } of [...inserted].reverse()) {
    await inChunks(ids, INSERT_BATCH, async (batch) => {
      await supabase.from(table).delete().in("id", batch);
    }).catch(() => {});
  }
  if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded).catch(() => {});
}
