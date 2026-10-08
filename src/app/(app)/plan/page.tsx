import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Plan de estudio" };

export default function Page() {
  return (
    <ComingSoon
      title="Plan de estudio"
      phase={7}
      description="Planificación automática hasta cada examen, con repaso espaciado y redistribución de lo pendiente."
    />
  );
}
