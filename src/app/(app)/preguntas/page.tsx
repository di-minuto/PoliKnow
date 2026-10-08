import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Banco de preguntas" };

export default function Page() {
  return (
    <ComingSoon
      title="Banco de preguntas"
      phase={4}
      description="Todas tus preguntas con su procedencia (examen oficial, material, IA o manual), dificultad y estadísticas."
    />
  );
}
