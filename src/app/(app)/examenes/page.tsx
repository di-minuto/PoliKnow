import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Exámenes" };

export default function Page() {
  return (
    <ComingSoon
      title="Exámenes"
      phase={6}
      description="Simulacros configurables y exámenes oficiales tal como fueron, con temporizador y corrección."
    />
  );
}
