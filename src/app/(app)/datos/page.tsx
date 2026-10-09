import type { Metadata } from "next";
import { BackupPanel } from "@/components/backup/backup-panel";
import { PageHeader } from "@/components/layout/page-header";
import { cardClass } from "@/components/ui/styles";
import { createClient } from "@/lib/supabase/server";
import { formatSize } from "@/components/documents/document-meta";

export const metadata: Metadata = { title: "Copia de seguridad" };

const SUMMARY = [
  ["subjects", "Asignaturas"],
  ["topics", "Temas"],
  ["questions", "Preguntas"],
  ["documents", "Documentos"],
  ["attempts", "Tests y simulacros"],
  ["plan_tasks", "Tareas del plan"],
] as const;

export default async function BackupPage() {
  const db = await createClient();
  const [counts, sizes] = await Promise.all([
    Promise.all(SUMMARY.map(([table]) => db.from(table).select("*", { count: "exact", head: true }).then((r) => r.count ?? 0))),
    db.from("documents").select("size_bytes"),
  ]);
  const filesBytes = (sizes.data ?? []).reduce((a, d) => a + (Number(d.size_bytes) || 0), 0);

  return (
    <>
      <PageHeader title="Copia de seguridad" subtitle="Descarga todos tus datos o recupéralos desde una copia." />
      <dl className={`${cardClass} mb-6 grid grid-cols-2 gap-x-4 gap-y-2 p-4 sm:grid-cols-3`} aria-label="Tus datos">
        {SUMMARY.map(([table, label], i) => (
          <div key={table}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-lg font-semibold">{counts[i].toLocaleString("es-ES")}</dd>
          </div>
        ))}
      </dl>
      <BackupPanel filesSize={filesBytes > 0 ? formatSize(filesBytes) : null} />
    </>
  );
}
