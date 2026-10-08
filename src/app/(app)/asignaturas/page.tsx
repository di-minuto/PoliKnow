import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Asignaturas" };

export default function Page() {
  return (
    <ComingSoon
      title="Asignaturas"
      phase={2}
      description="Cursos, asignaturas, parciales y temas, con fechas de examen y pesos por tema."
    />
  );
}
