import type { Metadata } from "next";
import Link from "next/link";
import { runDiagnostics } from "@/server/diagnostics";

export const metadata: Metadata = { title: "Diagnóstico" };

export default async function StatusPage() {
  const checks = await runDiagnostics();
  const allOk = checks.every((c) => c.ok);

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-bold">Diagnóstico</h1>
      <p className="mt-1 text-muted">{allOk ? "Todo está bien configurado." : "Hay algo que revisar:"}</p>
      <ul className="mt-6 divide-y divide-border rounded-2xl border border-border bg-surface">
        {checks.map((c) => (
          <li key={c.label} className="px-4 py-3">
            <p className="flex items-center gap-2 font-medium">
              <span aria-hidden>{c.ok ? "✅" : "❌"}</span>
              {c.label}
            </p>
            {c.detail && <p className="mt-1 break-all font-mono text-xs text-muted">{c.detail}</p>}
            {c.fix && <p className="mt-1 text-sm text-danger">{c.fix}</p>}
          </li>
        ))}
      </ul>
      <Link href="/hoy" className="mt-6 inline-block text-sm text-primary underline">
        Volver a la app
      </Link>
    </main>
  );
}
