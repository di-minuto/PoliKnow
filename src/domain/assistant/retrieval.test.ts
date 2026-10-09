import { describe, expect, it } from "vitest";
import { citedSources, keywords, searchQuery, wantsStudyState } from "./retrieval";

describe("palabras clave del asistente", () => {
  it("quita las palabras vacías y deja los términos técnicos", () => {
    expect(keywords("¿Qué diferencia hay entre critical y atomic en OpenMP?")).toEqual(["critical", "atomic", "OpenMP"]);
    expect(keywords("Explícame la cláusula reduction")).toEqual(["cláusula", "reduction"]);
  });

  it("conserva números y años", () => {
    expect(keywords("Ponme un ejercicio parecido al ejercicio 3 del examen de 2025")).toEqual(["3", "examen", "2025"]);
  });

  it("la consulta une los términos con OR", () => {
    expect(searchQuery("critical vs atomic")).toBe("critical or atomic");
    expect(searchQuery("¿qué es?")).toBeNull();
  });
});

describe("citas", () => {
  it("devuelve las fuentes citadas que existen, sin repetir", () => {
    expect(citedSources("Según [2] y [1, 2], y también [7].", 3)).toEqual([2, 1]);
  });
});

describe("intención", () => {
  it("detecta preguntas sobre el estudio", () => {
    expect(wantsStudyState("¿Qué debería estudiar hoy?").plan).toBe(true);
    expect(wantsStudyState("¿Qué temas llevo peor?").weak).toBe(true);
    expect(wantsStudyState("Explícame por qué he fallado esta pregunta").mistakes).toBe(true);
    expect(wantsStudyState("critical vs atomic")).toEqual({ plan: false, weak: false, mistakes: false });
  });
});
