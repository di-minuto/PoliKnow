import { z } from "zod";
import type { AICompletionRequest } from "../types";
import { SPANISH, clip } from "./shared";

export const ANALYZE_DOCUMENT_VERSION = "1";

export type AnalyzeDocumentInput = {
  title: string;
  subject: string;
  text: string;
  topics: string[];
};

/** Resumen, conceptos clave y temas de la asignatura a los que pertenece. */
export function analyzeDocumentRequest(input: AnalyzeDocumentInput): AICompletionRequest {
  const user = [
    `Asignatura: ${input.subject}`,
    `Documento: «${input.title}»`,
    input.topics.length ? `Temas de la asignatura:\n${input.topics.map((t) => `- ${t}`).join("\n")}` : "La asignatura aún no tiene temas.",
    `Texto del documento (puede estar recortado):\n${clip(input.text, 14_000)}`,
  ].join("\n\n");
  return {
    task: "analyze_document",
    system: [
      "Analizas apuntes universitarios para organizarlos.",
      SPANISH,
      "Devuelve SOLO este JSON:",
      '{"summary":"resumen en 3-5 frases","concepts":["concepto clave",…],"topics":["nombre exacto de un tema de la lista",…],"difficulty":1-5}',
      "- concepts: entre 5 y 12, cortos (2-6 palabras).",
      "- topics: solo nombres que aparezcan EXACTOS en la lista de temas; vacío si ninguno encaja.",
    ].join("\n"),
    messages: [{ role: "user", content: user }],
    maxTokens: 900,
    temperature: 0.2,
    promptVersion: ANALYZE_DOCUMENT_VERSION,
  };
}

export const documentAnalysisSchema = z.object({
  summary: z.string().min(1),
  concepts: z.array(z.string()).max(20).default([]),
  topics: z.array(z.string()).default([]),
  difficulty: z.coerce.number().min(1).max(5).optional().catch(undefined),
});
export type DocumentAnalysis = z.infer<typeof documentAnalysisSchema>;
