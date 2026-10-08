import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Estadísticas" };

export default function Page() {
  return (
    <ComingSoon
      title="Estadísticas"
      phase={8}
      description="Progreso por asignatura y tema, evolución de notas, temas fuertes y débiles y preparación estimada."
    />
  );
}
