import { expect, test, type Page } from "@playwright/test";

/*
 * Recorrido completo de la Fase 2 en un móvil: registro, curso, asignatura,
 * temas y subtemas, evaluación con fecha y temas con pesos, disponibilidad.
 */

const email = `e2e-${Date.now()}@example.com`;
const password = "contraseña-segura-123";
const shots = process.env.E2E_SCREENSHOTS;

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

test("configurar asignatura, temas y parcial", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  // Registro (en local la confirmación por email está desactivada)
  await page.goto("/hoy");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: /Crea tu cuenta/ }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Hoy", exact: true })).toBeVisible();
  await shot(page, "01-hoy-vacio");

  // Curso
  await page.goto("/asignaturas");
  await page.getByLabel("Nombre del curso").fill("3º Informática");
  await page.getByRole("button", { name: "Crear curso" }).click();
  await expect(page.getByText("Nueva asignatura")).toBeVisible();

  // Asignatura
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill("Computación Paralela");
  await page.getByLabel("Siglas").fill("CPA");
  await page.getByRole("button", { name: "Crear asignatura" }).click();
  await expect(page.getByRole("heading", { name: "CPA · Computación Paralela" })).toBeVisible();

  // Temas: Tema 1, Tema 2 y un subtema de Tema 2
  for (const name of ["Tema 1: Introducción", "Tema 2: OpenMP"]) {
    await page.getByRole("textbox", { name: "Nombre", exact: true }).fill(name);
    await page.getByRole("button", { name: "Añadir" }).click();
    await expect(page.locator("summary").getByText(name, { exact: true })).toBeVisible();
  }
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill("Cláusula reduction");
  await page.getByRole("combobox", { name: "Dentro de" }).selectOption({ label: "Tema 2: OpenMP" });
  await page.getByRole("button", { name: "Añadir" }).click();
  await expect(page.locator("summary").getByText("Cláusula reduction", { exact: true })).toBeVisible();

  // Reordenar: subir Tema 2 por encima de Tema 1
  await page.getByRole("button", { name: "Subir Tema 2: OpenMP" }).click();
  await expect(page.locator("li summary").first()).toContainText("Tema 2: OpenMP");
  await page.getByRole("button", { name: "Bajar Tema 2: OpenMP" }).click();
  await expect(page.locator("li summary").first()).toContainText("Tema 1: Introducción");
  await shot(page, "02-asignatura");

  // Evaluación con fecha
  await page.getByText("Nueva evaluación").click();
  await page.getByPlaceholder("Parcial 1").fill("Parcial 1");
  await page.getByLabel("Fecha y hora del examen").fill("2026-11-05T09:00");
  await page.getByLabel("Duración (minutos)").fill("120");
  await page.getByRole("button", { name: "Crear evaluación" }).click();
  await expect(page.getByRole("heading", { name: "Parcial 1", exact: true })).toBeVisible();
  await expect(page.getByText(/jue, 5 nov 2026, 09:00/)).toBeVisible();

  // Temas del parcial con pesos
  await page.getByRole("checkbox", { name: "Tema 1: Introducción" }).check();
  await page.getByRole("checkbox", { name: "Tema 2: OpenMP" }).check();
  await page.getByLabel("Peso de Tema 2: OpenMP").fill("3");
  await page.getByRole("button", { name: "Guardar temas" }).click();
  await expect(page.getByText("Temas guardados.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("75%")).toBeVisible();
  await expect(page.getByText("25%")).toBeVisible();
  await shot(page, "03-parcial");

  // Aparece en Hoy y en la lista de asignaturas
  await page.goto("/hoy");
  await expect(page.getByRole("link", { name: /^CPA · Parcial 1 .*Faltan/ })).toBeVisible();
  await page.goto("/asignaturas");
  await expect(page.getByText("Próximo: Parcial 1")).toBeVisible();
  await shot(page, "04-asignaturas");

  // Disponibilidad y días sin estudio
  await page.goto("/ajustes");
  await page.getByLabel("Horas el lunes").fill("3");
  await page.getByLabel("Horas el sábado").fill("1.5");
  await page.getByRole("button", { name: "Guardar horario" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Total: 4,5 h\/semana/)).toBeVisible();
  await page.getByLabel("Día", { exact: true }).fill("2026-12-24");
  await page.getByLabel("Motivo (opcional)").fill("Nochebuena");
  await page.getByRole("button", { name: "Añadir día" }).click();
  await expect(page.getByText("Nochebuena")).toBeVisible();
  await shot(page, "05-ajustes");

  expect(consoleErrors.filter((e) => /hydrat|Warning/i.test(e))).toEqual([]);
});
