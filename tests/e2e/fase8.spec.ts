import { expect, test, type Page } from "@playwright/test";

/*
 * Fase 8 en un móvil: el panel de estadísticas parte vacío, y tras un test
 * muestra horas, nota, aciertos, preparación estimada del parcial (con sus
 * componentes) y el progreso por tema.
 */

const email = `e2e-stats-${Date.now()}@example.com`;
const password = "contraseña-segura-123";
const shots = process.env.E2E_SCREENSHOTS;

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

test("estadísticas y preparación estimada", async ({ page }) => {
  test.setTimeout(180_000);
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

  // Vacío: sin datos, el panel lo explica
  await page.goto("/estadisticas");
  await expect(page.getByRole("heading", { name: "Estadísticas", exact: true })).toBeVisible();
  await expect(page.getByLabel("Tests hechos: 0")).toBeVisible();
  await expect(page.getByText("No hay exámenes pendientes.")).toBeVisible();

  await page.goto("/asignaturas");
  await page.getByLabel("Nombre del curso").fill("3º Informática");
  await page.getByRole("button", { name: "Crear curso" }).click();
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill("Computación Paralela");
  await page.getByLabel("Siglas").fill("CPA");
  await page.getByRole("button", { name: "Crear asignatura" }).click();
  await expect(page.getByRole("heading", { name: "CPA · Computación Paralela" })).toBeVisible();
  const subjectUrl = page.url();
  for (const name of ["Tema 1: Introducción", "Tema 2: OpenMP"]) {
    await page.getByRole("textbox", { name: "Nombre", exact: true }).fill(name);
    await page.getByRole("button", { name: "Añadir" }).click();
    await expect(page.locator("summary").getByText(name, { exact: true })).toBeVisible();
  }
  await page.getByText("Nueva evaluación").click();
  await page.getByPlaceholder("Parcial 1").fill("Parcial 1");
  await page.getByLabel("Fecha y hora del examen").fill(inDays(10));
  await page.getByRole("button", { name: "Crear evaluación" }).click();
  await expect(page.getByRole("heading", { name: "Parcial 1", exact: true })).toBeVisible();

  // Sin temas en el parcial: no se puede estimar
  await page.goto("/estadisticas");
  const card = page.getByRole("article", { name: "Preparación CPA Parcial 1" });
  await expect(card).toContainText("Indica qué temas entran en este examen");

  await page.goto(subjectUrl);
  await page.getByRole("link", { name: /Parcial 1/ }).first().click();
  await page.getByRole("checkbox", { name: "Tema 1: Introducción" }).check();
  await page.getByRole("checkbox", { name: "Tema 2: OpenMP" }).check();
  await page.getByRole("button", { name: "Guardar temas" }).click();
  await expect(page.getByText("Temas guardados.")).toBeVisible();

  await page.goto("/preguntas/importar");
  await page.getByLabel("…o pega el JSON aquí").fill(
    JSON.stringify({
      questions: ["A", "B", "C", "D"].map((x) => ({ type: "vf", topic: "Tema 1", stem: `Afirmación ${x} sobre hilos.`, answer: "V" })),
    }),
  );
  await page.getByRole("button", { name: "Comprobar" }).click();
  const result = page.getByRole("region", { name: "Resultado de la comprobación" });
  await result.getByRole("button", { name: "Importar 4 preguntas" }).click();
  await expect(result.getByText("4 preguntas importadas.")).toBeVisible();

  // Test rápido: 3 aciertos y 1 fallo → 7,5
  await page.goto(subjectUrl);
  await page.getByRole("link", { name: "Hacer test" }).click();
  await page.getByRole("button", { name: /Test rápido/ }).click();
  await expect(page.getByRole("heading", { name: "Test rápido · CPA" })).toBeVisible();
  for (const n of [1, 2, 3, 4]) {
    const q = page.getByRole("region", { name: `Pregunta ${n}`, exact: true });
    await q.getByRole("radio", { name: n === 4 ? "Falso" : "Verdadero" }).click();
    await q.getByRole("button", { name: "Comprobar" }).click();
    await expect(q.getByText(n === 4 ? "Incorrecto" : "¡Correcto!", { exact: true })).toBeVisible();
    if (n < 4) await page.getByRole("button", { name: "Siguiente" }).click();
  }
  await page.getByRole("button", { name: "Terminar test" }).click();
  await expect(page.getByRole("region", { name: "Resumen" }).getByLabel("Nota 7,5 sobre 10")).toBeVisible();

  await page.goto("/estadisticas");
  await expect(page.getByLabel("Tests hechos: 1")).toBeVisible();
  await expect(page.getByLabel("Nota media: 7,5")).toBeVisible();
  await expect(page.getByLabel("Aciertos: 75%")).toBeVisible();
  await expect(card).toContainText("preparación estimada");
  await expect(card.getByRole("meter", { name: /^Dominio en tests/ })).toBeVisible();
  await expect(card.getByRole("meter", { name: /^Simulacros y exámenes/ })).toHaveAttribute("aria-valuenow", "0");
  await expect(card).toContainText("sin datos");
  await expect(page.getByRole("img", { name: /Evolución de notas: 7,5/ })).toBeVisible();
  const evolution = page.getByRole("region", { name: "Evolución de notas" });
  await expect(evolution).toContainText("Tu primer test.");

  // Progreso por tema dentro de la asignatura
  const subjects = page.getByRole("region", { name: "Progreso por asignatura" });
  await subjects.getByText("Computación Paralela").click();
  await expect(subjects.getByText("3/4 aciertos")).toBeVisible();
  await expect(subjects.getByRole("meter", { name: "Dominio · Tema 1: Introducción" })).toBeVisible();
  await shot(page, "60-estadisticas");

  expect(consoleErrors.filter((e) => !e.includes("favicon"))).toEqual([]);
});
