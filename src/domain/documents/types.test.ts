import { describe, expect, it } from "vitest";
import { buildStoragePath } from "./types";

describe("ruta de almacenamiento", () => {
  it("empieza por el id del usuario (lo exige la política del bucket)", () => {
    expect(buildStoragePath("u1", "d1", "Tema 2.pdf")).toBe("u1/d1/Tema_2.pdf");
  });

  it("sanea acentos y caracteres raros", () => {
    expect(buildStoragePath("u1", "d1", "Examen ¿Enero? 2025 – CPA.pdf")).toBe("u1/d1/Examen_Enero_2025_CPA.pdf");
  });

  it("no permite escapar de la carpeta", () => {
    expect(buildStoragePath("u1", "d1", "../../otro/x.pdf")).toBe("u1/d1/.._.._otro_x.pdf");
  });
});
