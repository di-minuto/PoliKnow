import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Asistente" };

export default function Page() {
  return (
    <ComingSoon
      title="Asistente"
      phase={9}
      description="Pregunta sobre tus documentos y recibe respuestas con la fuente citada."
    />
  );
}
