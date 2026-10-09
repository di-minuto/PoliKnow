"use client";

import { useEffect, useState } from "react";
import { Download, Share, Smartphone } from "lucide-react";
import { buttonClass, cardClass } from "@/components/ui/styles";
import type { InstallWindow } from "./service-worker";

type Mode = "installed" | "prompt" | "ios" | "manual";

function detect(): Mode {
  if (window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone) return "installed";
  if ((window as InstallWindow).__installPrompt) return "prompt";
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  return "manual";
}

/** Instalar la app en el móvil o el ordenador (o cómo hacerlo en iPhone). */
export function InstallCard() {
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    const update = () => setMode(detect());
    const first = setTimeout(update, 0);
    window.addEventListener("install-available", update);
    window.addEventListener("appinstalled", update);
    return () => {
      clearTimeout(first);
      window.removeEventListener("install-available", update);
      window.removeEventListener("appinstalled", update);
    };
  }, []);

  if (mode === null || mode === "installed") return null;

  async function install() {
    const prompt = (window as InstallWindow).__installPrompt;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    (window as InstallWindow).__installPrompt = undefined;
    setMode(detect());
  }

  return (
    <section aria-label="Instalar la app" className={`${cardClass} mb-4 flex flex-col gap-3 p-4`}>
      <p className="flex items-center gap-2 font-medium">
        <Smartphone className="size-5 text-primary" aria-hidden />
        Instala la app
      </p>
      <p className="text-sm text-muted">Se abre a pantalla completa desde el inicio y lo que ya abriste se ve sin conexión.</p>
      {mode === "prompt" && (
        <button type="button" onClick={install} className={`${buttonClass.primary} self-start`}>
          <Download className="size-4" aria-hidden />
          Instalar
        </button>
      )}
      {mode === "ios" && (
        <p className="text-sm">
          En Safari pulsa <Share className="inline size-4 align-text-bottom" aria-label="Compartir" /> y luego{" "}
          <strong>«Añadir a pantalla de inicio»</strong>.
        </p>
      )}
      {mode === "manual" && (
        <p className="text-sm">
          En Chrome o Edge, abre el menú del navegador y elige <strong>«Instalar aplicación»</strong> (o «Añadir a pantalla de
          inicio» en Android).
        </p>
      )}
    </section>
  );
}
