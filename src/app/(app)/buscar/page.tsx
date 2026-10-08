import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Buscar" };

export default function Page() {
  return (
    <ComingSoon
      title="Buscar"
      phase={3}
      description="Búsqueda global en teoría, preguntas, ejercicios, exámenes y documentos."
    />
  );
}
