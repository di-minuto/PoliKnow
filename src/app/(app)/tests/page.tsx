import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Tests" };

export default function Page() {
  return (
    <ComingSoon
      title="Tests"
      phase={5}
      description="Test rápido, repaso de fallos, repaso inteligente y tests por tema o por parcial."
    />
  );
}
