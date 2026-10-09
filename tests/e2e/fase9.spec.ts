import { expect, test, type Page } from "@playwright/test";

/*
 * Fase 9 en un móvil, con una IA simulada (tests/e2e/fake-ai.mjs): análisis
 * de un documento, generación de preguntas (siempre «Generada por IA» y por
 * revisar), explicación de un fallo, asistente con citas y OCR en el navegador.
 */

const email = `e2e-ia-${Date.now()}@example.com`;
const password = "contraseña-segura-123";
const shots = process.env.E2E_SCREENSHOTS;

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

const NOTES = [
  "OpenMP: sincronización",
  "",
  "La cláusula reduction crea una copia privada por hilo y combina los resultados al final.",
  "",
  "La directiva critical serializa un bloque de código; atomic protege una sola operación de memoria.",
].join("\n");

test("IA: análisis, generación, explicación, asistente y OCR", async ({ page }) => {
  test.setTimeout(240_000);
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("dialog", (d) => d.accept());

  await page.goto("/login");
  await page.getByRole("button", { name: /Crea tu cuenta/ }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Hoy", exact: true })).toBeVisible();

  await page.goto("/asignaturas");
  await page.getByLabel("Nombre del curso").fill("3º Informática");
  await page.getByRole("button", { name: "Crear curso" }).click();
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill("Computación Paralela");
  await page.getByLabel("Siglas").fill("CPA");
  await page.getByRole("button", { name: "Crear asignatura" }).click();
  await expect(page.getByRole("heading", { name: "CPA · Computación Paralela" })).toBeVisible();
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill("Tema 2: OpenMP");
  await page.getByRole("button", { name: "Añadir" }).click();
  await expect(page.locator("summary").getByText("Tema 2: OpenMP", { exact: true })).toBeVisible();

  // Apuntes en texto (sin tema: el análisis lo propone)
  await page.getByRole("link", { name: "Subir" }).click();
  await page.getByLabel("Archivos").setInputFiles({ name: "openmp.txt", mimeType: "text/plain", buffer: Buffer.from(NOTES) });
  await page.getByRole("button", { name: "Subir" }).click();
  const progress = page.getByRole("region", { name: "Progreso de la subida" });
  await expect(progress.getByText(/^Listo/)).toBeVisible();
  await progress.getByRole("link", { name: "Ver" }).click();

  // Análisis con IA: resumen, conceptos y tema propuesto
  const analysis = page.getByRole("region", { name: "Análisis con IA" });
  await analysis.getByRole("button", { name: "Analizar documento" }).click();
  await expect(analysis.getByText("Resumen simulado")).toBeVisible();
  await expect(analysis.getByRole("list", { name: "Conceptos clave" })).toContainText("reduction");
  await analysis.getByRole("button", { name: "Asignar este tema al documento" }).click();
  await expect(analysis.getByRole("button", { name: /Asignar/ })).toHaveCount(0);
  await expect(page.getByText("Temas", { exact: true }).first()).toBeVisible();
  await shot(page, "70-analisis");

  // Generar preguntas de este documento → por revisar, marcadas como IA
  await page.getByRole("link", { name: "Generar preguntas de este documento" }).click();
  await expect(page.getByRole("heading", { name: "Generar preguntas con IA" })).toBeVisible();
  await page.getByLabel("Número de preguntas").fill("3");
  await page.getByRole("button", { name: "Generar preguntas" }).click();
  await expect(page.getByText("Se han generado 3 preguntas")).toBeVisible();
  const list = page.getByRole("list", { name: "Lista de preguntas" });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(list.getByText("Generada por IA")).toHaveCount(3);
  await expect(list.getByText("Por revisar")).toHaveCount(3);
  await shot(page, "71-generadas");
  // Por revisar no entran en los tests todavía
  await page.getByRole("button", { name: "Aprobar estas 3 preguntas" }).click();
  await expect(page.getByText("No hay preguntas con estos filtros.")).toBeVisible();

  // Test con todo mal → «Explícame el fallo»
  await page.goto("/tests");
  await page.getByRole("button", { name: /Test rápido/ }).click();
  await expect(page.getByRole("heading", { name: "Test rápido", exact: true })).toBeVisible();
  for (const n of [1, 2, 3]) {
    const q = page.getByRole("region", { name: `Pregunta ${n}`, exact: true });
    const text = await q.innerText();
    if (text.includes("serializa")) await q.getByRole("radio", { name: /atomic/ }).click();
    else if (text.includes("reduction")) await q.getByRole("radio", { name: "Falso" }).click();
    else await q.getByRole("radio", { name: "Verdadero" }).click();
    await q.getByRole("button", { name: "Comprobar" }).click();
    await expect(q.getByText("Incorrecto", { exact: true })).toBeVisible();
    if (n < 3) await page.getByRole("button", { name: "Siguiente" }).click();
  }
  await page.getByRole("button", { name: "Terminar test" }).click();
  await expect(page.getByRole("heading", { name: "Resultados · Test rápido" })).toBeVisible();
  const first = page.getByRole("listitem", { name: "Pregunta 1" });
  await first.getByRole("button", { name: "Explícame el fallo" }).click();
  const explanation = first.getByLabel("Explicación de la IA");
  await expect(explanation).toContainText("Has confundido critical con atomic");
  await expect(explanation.getByRole("listitem")).toHaveCount(2);
  await shot(page, "72-explicacion");

  // Asistente: responde con tus documentos y cita la fuente
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("¿Qué diferencia hay entre critical y atomic en OpenMP?");
  await page.getByRole("button", { name: "Enviar" }).click();
  const answer = page.getByRole("listitem", { name: "Respuesta del asistente" });
  await expect(answer).toContainText("Según tus apuntes");
  await expect(answer.getByRole("link", { name: /^Fuente 1: openmp/ })).toBeVisible();
  await expect(answer.getByText("Fuentes de tus documentos")).toBeVisible();
  // Seguimiento en la misma conversación, con el plan de hoy
  await page.getByLabel("Tu pregunta").fill("¿Qué debería estudiar hoy?");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(answer).toHaveCount(2);
  await expect(answer.nth(1)).toContainText("Hoy te toca lo que marca tu plan.");
  await shot(page, "73-asistente");
  await answer.first().getByRole("link", { name: /^Fuente 1/ }).click();
  await expect(page.getByRole("heading", { name: "openmp" })).toBeVisible();

  // El uso de la IA se ve en Ajustes
  await page.goto("/ajustes");
  const usage = page.getByRole("definition").filter({ hasText: "llamadas" }).first();
  await expect(usage).toBeVisible();
  await expect(page.getByText("openai-compatible · modelo-simulado")).toBeVisible();

  // OCR en el navegador: una imagen con texto
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 220;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    ctx.font = "bold 56px sans-serif";
    ctx.fillText("Pizarra de OpenMP", 40, 90);
    ctx.font = "44px sans-serif";
    ctx.fillText("barrera y reduccion", 40, 170);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.goto("/biblioteca/subir");
  await page.getByLabel("Archivos").setInputFiles({ name: "pizarra.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await page.getByRole("button", { name: "Subir" }).click();
  await expect(progress.getByText(/^Listo|Imagen guardada/).first()).toBeVisible();
  await progress.getByRole("link", { name: "Ver" }).click();
  await page.getByRole("button", { name: "Reconocer texto (OCR)" }).click();
  await expect(page.getByText("Texto reconocido.")).toBeVisible({ timeout: 90_000 });
  await expect(page.locator("#fragmento-0")).toContainText(/OpenMP/i);
  await shot(page, "74-ocr");

  expect(consoleErrors.filter((e) => !e.includes("favicon"))).toEqual([]);
});
