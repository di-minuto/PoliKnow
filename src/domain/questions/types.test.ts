import { describe, expect, it } from "vitest";
import { SOURCE_TYPES, SOURCE_TYPE_LABELS, validateProvenance } from "./types";

describe("procedencia de las preguntas", () => {
  it("todas las procedencias tienen etiqueta visible", () => {
    for (const s of SOURCE_TYPES) expect(SOURCE_TYPE_LABELS[s]).toBeTruthy();
  });

  it("acepta combinaciones válidas", () => {
    expect(validateProvenance({ sourceType: "official_exam", officialExamId: "e1", aiModel: null })).toBeNull();
    expect(validateProvenance({ sourceType: "manual", officialExamId: null, aiModel: null })).toBeNull();
    expect(validateProvenance({ sourceType: "ai_generated", officialExamId: null, aiModel: "m" })).toBeNull();
  });

  it("rechaza mezclar preguntas oficiales y no oficiales", () => {
    expect(validateProvenance({ sourceType: "official_exam", officialExamId: null, aiModel: null })).toMatch(
      /examen oficial/,
    );
    expect(validateProvenance({ sourceType: "ai_generated", officialExamId: "e1", aiModel: "m" })).toMatch(
      /Solo las preguntas/,
    );
    expect(validateProvenance({ sourceType: "ai_generated", officialExamId: null, aiModel: null })).toMatch(/modelo/);
  });
});
