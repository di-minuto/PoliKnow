import { describe, expect, it } from "vitest";
import { makeDocx, makePdf, makePptx } from "../../tests/fixtures/documents";
import { chunkPages } from "./chunking";
import { extractText } from "./extract";
import { joinTextItems } from "./extract/pdf";
import { detectFormat, normalizedMimeType, titleFromFilename } from "./format";
import { decodeXmlEntities, normalizeText } from "./normalize";

describe("formato", () => {
  it("la extensión manda sobre un tipo MIME vacío o genérico", () => {
    expect(detectFormat("Tema 1.PDF", "")).toBe("pdf");
    expect(detectFormat("apuntes.docx", "application/octet-stream")).toBe("docx");
    expect(detectFormat("foto.jpg", null)).toBe("image");
    expect(detectFormat("x.zip", "application/zip")).toBe("unsupported");
    expect(normalizedMimeType("notas.md", "")).toBe("text/markdown");
    expect(normalizedMimeType("foto.jpg", "")).toBe("image/jpeg");
  });

  it("propone un título a partir del nombre del archivo", () => {
    expect(titleFromFilename("Tema_3_OpenMP.pdf")).toBe("Tema 3 OpenMP");
  });
});

describe("normalización", () => {
  it("une palabras partidas y saltos simples, conserva párrafos", () => {
    expect(normalizeText("parale-\nlismo de\ndatos\n\n\n\nOtro  párrafo")).toBe("paralelismo de\ndatos\n\nOtro párrafo");
    expect(decodeXmlEntities("a &lt; b &amp;&amp; c &#233;")).toBe("a < b && c é");
  });

  it("separa párrafos en PDF por el hueco vertical", () => {
    const text = joinTextItems([
      { str: "Línea uno", transform: [1, 0, 0, 12, 50, 700], height: 12, hasEOL: true },
      { str: "línea dos", transform: [1, 0, 0, 12, 50, 686], height: 12 },
      { str: "Párrafo nuevo", transform: [1, 0, 0, 12, 50, 640], height: 12 },
    ]);
    expect(text).toBe("Línea uno\nlínea dos\n\nPárrafo nuevo");
  });
});

describe("troceado", () => {
  it("agrupa párrafos hasta ~1500 caracteres y anota las páginas", () => {
    const paragraph = "La memoria compartida permite que los hilos se comuniquen. ".repeat(8).trim();
    const pages = Array.from({ length: 6 }, (_, i) => ({ page: i + 1, text: `${paragraph}\n\n${paragraph}` }));
    const chunks = chunkPages(pages);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.content.length <= 2200)).toBe(true);
    expect(chunks[0].pageFrom).toBe(1);
    expect(chunks.at(-1)?.pageTo).toBe(6);
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
  });

  it("parte párrafos enormes sin perder texto", () => {
    const huge = "palabra ".repeat(2000).trim();
    const chunks = chunkPages([{ page: 1, text: huge }]);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.map((c) => c.content).join(" ").split(" ")).toHaveLength(2000);
  });

  it("ignora páginas vacías y no crea fragmentos vacíos", () => {
    expect(chunkPages([{ page: 1, text: "   " }, { page: 2, text: "" }])).toEqual([]);
  });

  it("un encabezado nuevo abre fragmento si el actual ya tiene cuerpo", () => {
    const body = "Texto de la sección con bastante contenido. ".repeat(14);
    const chunks = chunkPages([
      { page: 1, heading: "Introducción", text: body },
      { page: 2, heading: "Sincronización", text: body },
    ]);
    expect(chunks.map((c) => c.heading)).toEqual(["Introducción", "Sincronización"]);
  });
});

describe("extracción", () => {
  it("lee un PDF página a página", async () => {
    const pdf = await makePdf([
      ["Tema 2: OpenMP", "", "La directiva parallel crea un equipo de hilos."],
      ["La clausula reduction combina resultados."],
    ]);
    const doc = await extractText("tema2.pdf", "application/pdf", pdf);
    expect(doc?.pageCount).toBe(2);
    expect(doc?.pages[0].text).toContain("La directiva parallel crea un equipo de hilos.");
    expect(doc?.pages[0].text).toMatch(/OpenMP\n\nLa directiva/);
    expect(doc?.pages[1].page).toBe(2);
  });

  it("rechaza un PDF dañado con un mensaje claro", async () => {
    await expect(extractText("roto.pdf", "application/pdf", new TextEncoder().encode("no es un pdf"))).rejects.toThrow(
      /No se ha podido abrir el PDF/,
    );
  });

  it("lee un DOCX y usa los títulos como secciones", async () => {
    const docx = await makeDocx([
      { text: "Introducción", heading: true },
      { text: "Los semáforos <binarios> & contadores." },
      { text: "Monitores", heading: true },
      { text: "Un monitor encapsula datos y procedimientos." },
    ]);
    const doc = await extractText("apuntes.docx", "", docx);
    expect(doc?.pages.map((p) => p.heading)).toEqual(["Introducción", "Monitores"]);
    expect(doc?.pages[0].text).toContain("Los semáforos <binarios> & contadores.");
  });

  it("lee un PPTX en orden, con títulos y notas", async () => {
    const pptx = await makePptx([
      { title: "Diapositiva uno", bullets: ["Punto A"] },
      { title: "Diapositiva dos", bullets: ["Punto B", "Punto C"], notes: "Recordar el ejemplo" },
      { title: "Diapositiva tres", bullets: [] },
    ]);
    const doc = await extractText("clase.pptx", null, pptx);
    expect(doc?.pageCount).toBe(3);
    expect(doc?.pages.map((p) => p.heading)).toEqual(["Diapositiva uno", "Diapositiva dos", "Diapositiva tres"]);
    expect(doc?.pages[1].text).toBe("Diapositiva dos\n\nPunto B\n\nPunto C\n\nNotas: Recordar el ejemplo");
  });

  it("lee Markdown con secciones y deja las imágenes para el OCR", async () => {
    const md = new TextEncoder().encode("﻿# Resumen\nTexto inicial\n## Detalle\nMás texto");
    const doc = await extractText("resumen.md", "text/markdown", md);
    expect(doc?.pages.map((p) => p.heading)).toEqual(["Resumen", "Detalle"]);
    expect(await extractText("foto.png", "image/png", new Uint8Array([1, 2]))).toBeNull();
  });

  it("rechaza un DOCX que no es un zip", async () => {
    await expect(extractText("x.docx", null, new Uint8Array([1, 2, 3]))).rejects.toThrow(/dañado/);
  });
});
