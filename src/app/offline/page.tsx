import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { RetryButton } from "@/components/pwa/retry-button";

export const metadata: Metadata = { title: "Sin conexión" };
export const dynamic = "force-static";

/** La sirve el service worker cuando no hay red y la página no se había abierto antes. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <WifiOff className="size-12 text-muted" aria-hidden />
      <h1 className="text-2xl font-bold">Sin conexión</h1>
      <p className="text-muted">
        Esta página no la habías abierto antes, así que no está guardada en el móvil. Las que ya visitaste (Hoy, el plan, tus
        apuntes…) sí se pueden ver sin red.
      </p>
      <RetryButton />
    </main>
  );
}
