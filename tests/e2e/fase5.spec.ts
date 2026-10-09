import { expect, test, type Page } from "@playwright/test";

/*
 * Fase 5 en un móvil: test rápido con corrección al momento (test, V/F y teoría
 * autoevaluada), resultados con nota por tema, repaso de fallos, test de un
 * parcial e historial.
 */

const email = `e2e-tests-${Date.now()}@example.com`;
const password = "contraseña-segura-123";
const shots = process.env.E2E_SCREENSHOTS;

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

const MC = "¿Qué cláusula combina los resultados parciales de cada hilo?";
const TF = "OpenMP usa memoria compartida.";
const THEORY = "Explica qué es una condición de carrera.";

/** Responde la pregunta visible: `right` decide si acertar o fallar la de tipo test. */
async function answerCurrent(page: Page, n: number, mcRight: boolean) {
  const card = page.getByRole("region", { name: `Pregunta ${n}`, exact: true });
  const text = await card.innerText();
  if (text.includes(MC)) {
    await card.getByRole("radio", { name: mcRight ? /reduction/ : /private/ }).click();
    await card.getByRole("button", { name: "Comprobar" }).click();
    await expect(card.getByText(mcRight ? "¡Correcto!" : "Incorrecto", { exact: true })).toBeVisible();
    await expect(card.getByText("reduction crea una copia privada por hilo")).toBeVisible();
  } else if (text.includes(TF)) {
    await card.getByRole("radio", { name: "Verdadero" }).click();
    await card.getByRole("button", { name: "Comprobar" }).click();
    await expect(card.getByText("¡Correcto!", { exact: true })).toBeVisible();
  } else {
    expect(text).toContain(THEORY);
    await card.getByRole("textbox").fill("Dos hilos acceden a la vez a un dato y el resultado depende del orden.");
    await card.getByRole("button", { name: "Ver solución" }).click();
    await expect(card.getByText("¿Cómo te ha salido comparado con la solución?")).toBeVisible();
    await card.getByRole("button", { name: "Bien", exact: true }).click();
    await expect(card.getByText("¡Correcto!", { exact: true })).toBeVisible();
  }
}

test("tests, resultados y repaso", async ({ page }) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("dialog", (d) => d.accept());

  // Cuenta, asignatura y temas
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
  const subjectUrl = page.url();
  for (const name of ["Tema 1: Introducción", "Tema 2: OpenMP"]) {
    await page.getByRole("textbox", { name: "Nombre", exact: true }).fill(name);
    await page.getByRole("button", { name: "Añadir" }).click();
    await expect(page.locator("summary").getByText(name, { exact: true })).toBeVisible();
  }

  // Preguntas importadas
  await page.goto("/preguntas/importar");
  await page.getByLabel("…o pega el JSON aquí").fill(
    JSON.stringify({
      questions: [
        {
          type: "test",
          topic: "Tema 2",
          stem: MC,
          options: ["private", "reduction", "shared", "nowait"],
          answer: "B",
          explanation: "reduction crea una copia privada por hilo y las combina al final.",
        },
        { type: "vf", topic: "Tema 1", stem: TF, answer: "V" },
        { type: "teoria", topic: "Tema 1", stem: THEORY, answer: "Acceso concurrente sin sincronizar a un dato compartido." },
      ],
    }),
  );
  await page.getByRole("button", { name: "Comprobar" }).click();
  const result = page.getByRole("region", { name: "Resultado de la comprobación" });
  await result.getByRole("button", { name: "Importar 3 preguntas" }).click();
  await expect(result.getByText("3 preguntas importadas.")).toBeVisible();

  // Desde la asignatura: «Hacer test» → test rápido
  await page.goto(subjectUrl);
  await page.getByRole("link", { name: "Hacer test" }).click();
  await expect(page.getByRole("heading", { name: "Tests", exact: true })).toBeVisible();
  await expect(page.getByText("Aún no has hecho ningún test.")).toBeVisible();
  await shot(page, "30-tests");
  await page.getByRole("button", { name: /Test rápido/ }).click();
  await expect(page.getByRole("heading", { name: "Test rápido · CPA" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Ir a la pregunta" }).getByRole("button")).toHaveCount(3);

  for (const n of [1, 2, 3]) {
    await answerCurrent(page, n, false);
    if (n === 1) await shot(page, "31-corregida");
    if (n < 3) await page.getByRole("button", { name: "Siguiente" }).click();
  }
  await page.getByRole("button", { name: "Terminar test" }).click();

  // Resultados: 2 de 3 → 6,7
  await expect(page.getByRole("heading", { name: "Resultados · Test rápido · CPA" })).toBeVisible();
  const summary = page.getByRole("region", { name: "Resumen" });
  await expect(summary.getByLabel("Nota 6,7 sobre 10")).toBeVisible();
  await expect(summary).toContainText("Correctas2");
  const byTopic = page.locator("section", { has: page.getByRole("heading", { name: "Nota por tema" }) });
  await expect(byTopic.getByRole("listitem").filter({ hasText: "Tema 2: OpenMP" })).toContainText("0");
  await expect(byTopic.getByRole("listitem").filter({ hasText: "Tema 1: Introducción" })).toContainText("10");
  await expect(page.getByRole("link", { name: "Tema 2: OpenMP" })).toBeVisible();
  const failedCard = page.getByRole("listitem", { name: /Pregunta \d/ }).filter({ hasText: MC });
  await expect(failedCard.getByText("Incorrecta", { exact: true })).toBeVisible();
  await expect(failedCard.getByText("Tu respuesta: A")).toBeVisible();
  await shot(page, "32-resultados");

  // Repaso de fallos: solo la de tipo test
  await page.getByRole("button", { name: "Repasar fallos" }).click();
  await expect(page.getByRole("heading", { name: "Repaso de fallos · CPA" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Ir a la pregunta" }).getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Pregunta 1", exact: true })).toContainText(MC);
  await answerCurrent(page, 1, true);
  await page.getByRole("button", { name: "Terminar test" }).click();
  await expect(page.getByRole("region", { name: "Resumen" }).getByLabel("Nota 10 sobre 10")).toBeVisible();

  // Parcial con los dos temas → test del parcial (se deja a medias y se retoma)
  await page.goto(subjectUrl);
  await page.getByText("Nueva evaluación").click();
  await page.getByPlaceholder("Parcial 1").fill("Parcial 1");
  await page.getByRole("button", { name: "Crear evaluación" }).click();
  await expect(page.getByRole("heading", { name: "Parcial 1", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Tema 1: Introducción" }).check();
  await page.getByRole("checkbox", { name: "Tema 2: OpenMP" }).check();
  await page.getByRole("button", { name: "Guardar temas" }).click();
  await expect(page.getByText("Temas guardados.")).toBeVisible();
  await page.getByRole("link", { name: "Hacer test de este parcial" }).click();
  await expect(page.getByRole("combobox", { name: "Parcial" })).toHaveValue(/.+/);
  await shot(page, "33-generador");
  await page.getByRole("button", { name: "Crear test" }).click();
  await expect(page.getByRole("heading", { name: "Test por parcial · CPA" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Ir a la pregunta" }).getByRole("button")).toHaveCount(3);
  await answerCurrent(page, 1, true);
  const attemptUrl = page.url();

  await page.goto("/tests");
  const history = page.getByRole("list", { name: "Tests hechos" });
  await expect(history.getByRole("listitem")).toHaveCount(3);
  await expect(history.getByRole("listitem").filter({ hasText: "Test por parcial" })).toContainText("Continuar");
  await expect(page.getByText(/preguntas? tocan? repasar hoy|Practica y repasa/)).toBeVisible();
  await page.goto(attemptUrl);
  await expect(page.getByRole("region", { name: "Pregunta 2", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Terminar ahora" }).click();
  await expect(page.getByRole("heading", { name: "Resultados · Test por parcial · CPA" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Resumen" })).toContainText("Sin responder");

  // Borrar un test del historial
  await page.getByRole("button", { name: "Borrar test" }).click();
  await expect(page.getByRole("list", { name: "Tests hechos" }).getByRole("listitem")).toHaveCount(2);

  expect(consoleErrors.filter((e) => !e.includes("favicon"))).toEqual([]);
});
