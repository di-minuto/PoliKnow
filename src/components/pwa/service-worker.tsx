"use client";

import { useEffect } from "react";

export type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
export type InstallWindow = Window & { __installPrompt?: InstallPromptEvent };

/** Registra el service worker (solo en producción, o en local con NEXT_PUBLIC_ENABLE_SW=1). */
export function ServiceWorker() {
  useEffect(() => {
    const enabled = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "1";
    // Android/escritorio: se guarda la invitación a instalar para el botón «Instalar».
    const keep = (event: Event) => {
      event.preventDefault();
      (window as InstallWindow).__installPrompt = event as InstallPromptEvent;
      window.dispatchEvent(new Event("install-available"));
    };
    window.addEventListener("beforeinstallprompt", keep);
    if (!enabled || !("serviceWorker" in navigator)) return () => window.removeEventListener("beforeinstallprompt", keep);
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => console.warn("Service worker:", error));
    return () => window.removeEventListener("beforeinstallprompt", keep);
  }, []);
  return null;
}

/** Borra las páginas guardadas para que no queden datos tras cerrar sesión. */
export async function clearOfflinePages() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "clear-pages" });
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("estudio-pages-")).map((k) => caches.delete(k)));
  } catch {
    // sin caché o sin service worker: no hay nada que borrar
  }
}
