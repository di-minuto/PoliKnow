import { describe, expect, it } from "vitest";
import { solutionText } from "./solution";

describe("solución en texto", () => {
  it("tipo test con letra y texto", () => {
    expect(
      solutionText({ questionType: "multiple_choice", content: { options: ["private", "reduction"] }, answer: { correct: [1] } }),
    ).toEqual({ options: ["private", "reduction"], correct: "B) reduction" });
  });

  it("verdadero/falso, numérica y abierta", () => {
    expect(solutionText({ questionType: "true_false", content: {}, answer: { value: false } }).correct).toBe("Falso");
    expect(solutionText({ questionType: "numeric", content: { unit: "s" }, answer: { value: 3 } }).correct).toBe("3 s");
    expect(solutionText({ questionType: "theory", content: {}, answer: { model: null } }).correct).toBe("(sin solución modelo)");
  });
});
