"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold">Algo ha fallado al cargar esta pantalla</h1>
        <p className="mt-2 text-sm text-muted">
          Suele deberse a la configuración (base de datos o variables de entorno). La página de diagnóstico te dice qué
          revisar.
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs text-muted">Código: {error.digest}</p>}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Reintentar
          </button>
          <Link href="/estado" className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium">
            Ver diagnóstico
          </Link>
        </div>
      </div>
    </main>
  );
}
