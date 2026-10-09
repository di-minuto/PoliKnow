import { describe, expect, it } from "vitest";
import { buildStoragePath } from "./types";
import { documentMetadataInput, locationLabel, newDocumentInput, splitHighlights } from "./schemas";

const SUBJECT = "11111111-1111-4111-8111-111111111111";

describe("documentos", () => {
  it("valida los metadatos y convierte vacíos en null", () => {
    const parsed = documentMetadataInput.parse({
      subjectId: SUBJECT,
      documentType: "official_exam",
      title: "  Examen enero  ",
      year: "2025",
      examSession: "",
      notes: "",
    });
    expect(parsed).toMatchObject({ title: "Examen enero", year: 2025, examSession: null, topicIds: [] });
  });

  it("rechaza archivos demasiado grandes o sin huella", () => {
    const base = { subjectId: SUBJECT, documentType: "theory", title: "T", originalFilename: "t.pdf", mimeType: "" };
    expect(newDocumentInput.safeParse({ ...base, sizeBytes: 60 * 1024 * 1024, sha256: "a".repeat(64) }).success).toBe(false);
    expect(newDocumentInput.safeParse({ ...base, sizeBytes: 10, sha256: "xyz" }).success).toBe(false);
    expect(newDocumentInput.safeParse({ ...base, sizeBytes: 10, sha256: "a".repeat(64) }).success).toBe(true);
  });

  it("sanea el nombre en la ruta de Storage", () => {
    expect(buildStoragePath("u", "d", "Tema 1: Introducción (v2).pdf")).toBe("u/d/Tema_1_Introduccion_v2_.pdf");
  });

  it("etiqueta páginas y diapositivas", () => {
    expect(locationLabel(3, 3, false)).toBe("Pág. 3");
    expect(locationLabel(3, 5, true)).toBe("Diap. 3–5");
    expect(locationLabel(null, null, false)).toBeNull();
  });

  it("separa los resaltados sin usar HTML", () => {
    expect(splitHighlights("La ⟦cláusula⟧ <b>x</b> ⟦reduction⟧.")).toEqual([
      { text: "La ", mark: false },
      { text: "cláusula", mark: true },
      { text: " <b>x</b> ", mark: false },
      { text: "reduction", mark: true },
      { text: ".", mark: false },
    ]);
  });
});
