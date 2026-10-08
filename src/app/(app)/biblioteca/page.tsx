import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Biblioteca" };

export default function Page() {
  return (
    <ComingSoon
      title="Biblioteca"
      phase={3}
      description="Sube PDF, DOCX, PPTX, TXT e imágenes, clasifícalos por asignatura, parcial, tema y tipo, y consúltalos cuando quieras."
    />
  );
}
