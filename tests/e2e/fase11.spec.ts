import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

/*
 * Fase 11: copia de seguridad. Se exporta todo (JSON y ZIP con archivos) desde
 * una cuenta y se importa en otra nueva: asignaturas, temas, preguntas,
 * documentos con su texto y horario vuelven a aparecer.
 */

const stamp = Date.now();
const password = "contraseña-segura-123";
const shots = process.env.E2E_SCREENSHOTS;

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

async function signUp(page: Page, email: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Crea tu cuenta/ }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Hoy", exact: true })).toBeVisible();
}

test("exportar todos los datos e importarlos en otra cuenta", async ({ page }) => {
  test.setTimeout(240_000);
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("dialog", (d) => d.accept());

  // Cuenta A con asignatura, tema, documento, preguntas y horario
  await signUp(page, `e2e-copia-a-${stamp}@example.com`);
  await page.goto("/asignaturas");
  await page.getByLabel("Nombre del curso").fill("3º Informática");
  await page.getByRole("button", { name: "Crear curso" }).click();
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill("Computación Paralela");
  await page.getByLabel("Siglas").fill("CPA");
  await page.getByRole("button", { name: "Crear asignatura" }).click();
  await expect(page.getByRole("heading", { name: "CPA · Computación Paralela" })).toBeVisible();
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill("Tema 1: Introducción");
  await page.getByRole("button", { name: "Añadir" }).click();
  await expect(page.locator("summary").getByText("Tema 1: Introducción", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Subir" }).click();
  await page.getByLabel("Archivos").setInputFiles({
    name: "ley-amdahl.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Ley de Amdahl\n\nLa parte secuencial limita la aceleración máxima."),
  });
  await page.getByRole("button", { name: "Subir" }).click();
  await expect(page.getByRole("region", { name: "Progreso de la subida" }).getByText(/^Listo/)).toBeVisible();

  await page.goto("/preguntas/importar");
  await page.getByLabel("…o pega el JSON aquí").fill(
    JSON.stringify({ questions: ["A", "B"].map((x) => ({ type: "vf", topic: "Tema 1", stem: `Afirmación ${x}.`, answer: "V" })) }),
  );
  await page.getByRole("button", { name: "Comprobar" }).click();
  const check = page.getByRole("region", { name: "Resultado de la comprobación" });
  await check.getByRole("button", { name: "Importar 2 preguntas" }).click();
  await expect(check.getByText("2 preguntas importadas.")).toBeVisible();

  await page.goto("/ajustes");
  await page.getByLabel("Horas el lunes").fill("3");
  await page.getByRole("button", { name: "Guardar horario" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await page.getByRole("link", { name: "Copia de seguridad" }).click();

  // Exportar: resumen de lo que hay y dos descargas
  await expect(page.getByRole("heading", { name: "Copia de seguridad" })).toBeVisible();
  const mine = page.getByRole("definition").filter({ hasText: /^\d/ });
  await expect(mine).toHaveCount(6);
  let download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar datos (JSON)" }).click();
  const json = await download;
  expect(json.suggestedFilename()).toMatch(/^estudio-copia-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile((await json.path())!, "utf8"));
  expect(data).toMatchObject({ format: "estudio-backup", version: 1 });
  expect(data.tables.questions).toHaveLength(2);
  expect(data.tables.questions[0]).not.toHaveProperty("user_id");
  expect(data.tables.availability_rules.some((r: { weekday: number; minutes: number }) => r.weekday === 1 && r.minutes === 180)).toBe(true);
  await expect(page.getByText(/Copia descargada .*1 asignatura,.*2 preguntas/)).toBeVisible();

  download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Datos y archivos (ZIP)" }).click();
  const zip = await download;
  expect(zip.suggestedFilename()).toMatch(/\.zip$/);
  const zipFile = { name: "copia.zip", mimeType: "application/zip", buffer: await readFile((await zip.path())!) };
  await shot(page, "90-exportar");

  // Cuenta B, vacía: importar el ZIP
  await page.goto("/ajustes");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  await signUp(page, `e2e-copia-b-${stamp}@example.com`);
  await page.goto("/datos");
  await page.getByLabel("Archivo de copia (.json o .zip)").setInputFiles(zipFile);
  const preview = page.getByLabel("Contenido de la copia");
  await expect(preview).toContainText(`(e2e-copia-a-${stamp}@example.com)`);
  await expect(preview).toContainText("1 asignatura,");
  await expect(preview).toContainText("2 preguntas");
  await shot(page, "91-importar");
  await preview.getByRole("button", { name: "Importar copia" }).click();
  await expect(page.getByText(/^Importado: .*1 documento,.*2 preguntas/)).toBeVisible();

  // Todo está en la cuenta nueva
  await page.goto("/asignaturas");
  await expect(page.getByRole("link", { name: /CPA/ }).first()).toBeVisible();
  await page.goto("/preguntas");
  const list = page.getByRole("list", { name: "Lista de preguntas" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByText("Tema 1: Introducción").first()).toBeVisible();
  await page.goto("/biblioteca");
  await page.getByRole("link", { name: /ley-amdahl/ }).first().click();
  await expect(page.getByText("La parte secuencial limita la aceleración máxima.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Descargar" })).toBeVisible();
  await page.goto("/ajustes");
  await expect(page.getByLabel("Horas el lunes")).toHaveValue("3");

  // Importar otra vez: no duplica el documento (misma huella)
  await page.goto("/datos");
  await page.getByLabel("Archivo de copia (.json o .zip)").setInputFiles(zipFile);
  await page.getByLabel("Contenido de la copia").getByRole("button", { name: "Importar copia" }).click();
  await expect(page.getByText(/1 documento ya lo tenías y no se han duplicado/)).toBeVisible();

  // Un archivo que no es una copia se rechaza sin tocar nada
  await page.getByLabel("Archivo de copia (.json o .zip)").setInputFiles({
    name: "otra.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ questions: [] })),
  });
  await expect(page.getByText("No es una copia de seguridad de esta app.")).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
