import { expect, test, type Page } from "@playwright/test";

/*
 * Fase 6 en un móvil: simulacro con temas ponderados, cronómetro, penalización
 * y sin soluciones; autoevaluación al final; examen oficial sin volver atrás;
 * entrega automática al acabarse el tiempo.
 */

const email = `e2e-simulacro-${Date.now()}@example.com`;
const password = "contraseña-segura-123";
const shots = process.env.E2E_SCREENSHOTS;

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

const MC = "¿Qué cláusula combina los resultados parciales de cada hilo?";
const TF = "OpenMP usa memoria compartida.";
const NUM = "Speedup con 4 hilos si T1 = 12 s y T4 = 4 s.";
const THEORY = "Explica qué es una condición de carrera.";

const card = (page: Page, n: number) => page.getByRole("region", { name: `Pregunta ${n}`, exact: true });

test("simulacro y examen oficial", async ({ page }) => {
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
  for (const name of ["Tema 1: Introducción", "Tema 2: OpenMP"]) {
    await page.getByRole("textbox", { name: "Nombre", exact: true }).fill(name);
    await page.getByRole("button", { name: "Añadir" }).click();
    await expect(page.locator("summary").getByText(name, { exact: true })).toBeVisible();
  }

  // Preguntas propias y un examen oficial
  async function importJson(json: unknown, count: number) {
    await page.goto("/preguntas/importar");
    await page.getByLabel("…o pega el JSON aquí").fill(JSON.stringify(json));
    await page.getByRole("button", { name: "Comprobar" }).click();
    const result = page.getByRole("region", { name: "Resultado de la comprobación" });
    await result.getByRole("button", { name: `Importar ${count} preguntas` }).click();
    await expect(result.getByText(`${count} preguntas importadas.`)).toBeVisible();
  }
  await importJson(
    {
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
        { type: "numerico", topic: "Tema 2", stem: NUM, answer: 3 },
        { type: "teoria", topic: "Tema 1", stem: THEORY, answer: "Acceso concurrente sin sincronizar a un dato compartido." },
      ],
    },
    4,
  );
  // Simulacro desde Tests
  await page.goto("/tests");
  await page.getByRole("link", { name: /Simulacro de examen/ }).click();
  await expect(page.getByRole("heading", { name: "Simulacro de examen" })).toBeVisible();
  const builder = page.getByRole("region", { name: "Configurar simulacro" });
  await builder.getByRole("checkbox", { name: "Tema 1: Introducción" }).check();
  await builder.getByRole("checkbox", { name: "Tema 2: OpenMP" }).check();
  await builder.getByLabel("Peso de Tema 2: OpenMP").fill("2");
  await builder.getByLabel("Preguntas").fill("4");
  await builder.getByLabel("Duración (min)").fill("30");
  await builder.getByLabel("Penalización por fallo").selectOption({ label: "Resta 1/2" });
  await shot(page, "40-simulacro");
  await builder.getByRole("button", { name: "Empezar simulacro" }).click();

  await expect(page.getByRole("heading", { name: "Simulacro de examen · CPA" })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveAccessibleName(/Tiempo restante (30:00|29:5\d)/);
  await expect(page.getByText("Cada fallo resta 0,5 de lo que vale la pregunta.", { exact: false })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Ir a la pregunta" });
  await expect(nav.getByRole("button")).toHaveCount(4);

  // Responder sin ver soluciones: test mal, V/F bien, numérica en blanco, teoría escrita
  for (const n of [1, 2, 3, 4]) {
    const c = card(page, n);
    const text = await c.innerText();
    if (text.includes(MC)) {
      await c.getByRole("radio", { name: /private/ }).click();
      await c.getByRole("button", { name: "Marcar" }).click();
    } else if (text.includes(TF)) {
      await c.getByRole("radio", { name: "Verdadero" }).click();
    } else if (text.includes(THEORY)) {
      await c.getByRole("textbox").fill("Dos hilos acceden a la vez a un dato y el resultado depende del orden.");
    }
    await expect(c.getByText(/Correcto|Incorrecto|Solución|Explicación/)).toHaveCount(0);
    if (n === 1) await shot(page, "41-examen");
    if (n < 4) await page.getByRole("button", { name: "Siguiente" }).click();
  }
  await page.getByRole("button", { name: "Anterior" }).click();
  await expect(card(page, 3)).toBeVisible();

  // Las respuestas sobreviven a recargar
  await page.reload();
  await expect(nav.getByRole("button", { name: /respondida/ })).toHaveCount(3);
  await expect(nav.getByRole("button", { name: /marcada/ })).toHaveCount(1);

  await page.getByRole("button", { name: "Entregar" }).click();
  await expect(page.getByRole("heading", { name: "Resultados · Simulacro de examen · CPA" })).toBeVisible();
  const summary = page.getByRole("region", { name: "Resumen" });
  // 1 − 0,5 = 0,5 de 4 → 1,25
  await expect(summary.getByLabel("Nota 1,3 sobre 10")).toBeVisible();
  await expect(summary).toContainText("0,5 / 4 puntos");
  await expect(summary).toContainText("Por autoevaluar1");
  await expect(summary).toContainText("has perdido 0,5 puntos por fallos");
  const tips = page.locator("section", { has: page.getByRole("heading", { name: "Recomendaciones de estudio" }) });
  await expect(tips).toContainText("Los fallos te han restado 0,5 puntos");
  await expect(tips).toContainText("Dejaste 1 sin responder");
  await expect(tips).toContainText("Autoevalúa abajo la pregunta de desarrollo");
  await shot(page, "42-resultados-simulacro");

  // Autoevaluar la de teoría sube la nota
  const theory = page.getByRole("listitem", { name: /Pregunta \d/ }).filter({ hasText: THEORY });
  await expect(theory.getByText("Por autoevaluar")).toBeVisible();
  await theory.getByRole("button", { name: "Bien", exact: true }).click();
  await expect(page.getByRole("region", { name: "Resumen" }).getByLabel("Nota 3,8 sobre 10")).toBeVisible();
  await expect(theory.getByText("Correcta", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Resumen" })).not.toContainText("Por autoevaluar");

  // Examen oficial, sin volver atrás
  await importJson(
    {
      exam: { title: "Junio 2024", year: 2024, duration_minutes: 10, wrong_answer_penalty: 0.33 },
      questions: [
        { type: "test", topic: "Tema 2", stem: "¿Qué hace nowait?", options: ["Quita la barrera", "Añade una barrera"], answer: "A", points: 2 },
        { type: "vf", topic: "Tema 1", stem: "Un hilo es un proceso pesado.", answer: "F", points: 1 },
      ],
    },
    2,
  );

  await page.goto("/simulacro");
  await page.getByRole("link", { name: /Junio 2024/ }).click();
  const start = page.locator("#hacer");
  await expect(start.getByLabel("Duración (min)")).toHaveValue("10");
  await expect(start.getByLabel("Penalización por fallo")).toHaveValue("0.33");
  await start.getByLabel("Permitir volver atrás").uncheck();
  await start.getByRole("button", { name: "Hacer este examen" }).click();
  await expect(page.getByRole("heading", { name: "Junio 2024", exact: true })).toBeVisible();
  await expect(page.getByText("No se puede volver atrás.", { exact: false })).toBeVisible();
  await expect(card(page, 1)).toContainText("2 ptos.");
  await card(page, 1).getByRole("radio", { name: /Quita la barrera/ }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByRole("button", { name: "Anterior" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: /Pregunta 1/ })).toBeDisabled();
  await card(page, 2).getByRole("radio", { name: "Verdadero" }).click();
  await page.getByRole("button", { name: "Entregar" }).click();
  await expect(page.getByRole("heading", { name: "Resultados · Junio 2024" })).toBeVisible();
  // 2 − 0,33 = 1,67 de 3
  await expect(page.getByRole("region", { name: "Resumen" })).toContainText("1,67 / 3 puntos");

  // Se acaba el tiempo: se entrega solo
  await page.clock.install();
  await page.goto("/simulacro");
  await builder.getByLabel("Preguntas").fill("2");
  await builder.getByLabel("Duración (min)").fill("1");
  await builder.getByRole("button", { name: "Empezar simulacro" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.clock.fastForward("01:05");
  await expect(page.getByRole("heading", { name: "Resultados · Simulacro de examen · CPA" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Resumen" })).toContainText("Sin responder2");

  await page.goto("/tests");
  await expect(page.getByRole("list", { name: "Tests hechos" }).getByRole("listitem")).toHaveCount(3);

  expect(consoleErrors.filter((e) => !e.includes("favicon"))).toEqual([]);
});
