import { expect, test, type Page } from "@playwright/test";

/*
 * Fase 7 en un móvil: el plan se genera solo a partir de exámenes, temas y
 * horas disponibles; HOY con EMPEZAR SESIÓN; sesión con cronómetro y cierre;
 * el plan se adapta (repaso mañana si no lo has entendido, saltar redistribuye).
 */

const email = `e2e-plan-${Date.now()}@example.com`;
const password = "contraseña-segura-123";
const shots = process.env.E2E_SCREENSHOTS;

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

/** Fecha local dentro de n días, para <input type="datetime-local">. */
function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

test("plan automático, hoy y sesiones", async ({ page }) => {
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

  // Sin temas en el parcial ni horas: el plan lo dice
  await page.goto("/hoy");
  const notices = page.getByRole("list", { name: "Avisos del plan" });
  await expect(notices).toContainText("No has indicado cuántas horas puedes estudiar");
  await expect(notices).toContainText("no tiene temas");

  await page.goto(subjectUrl);
  await page.getByRole("link", { name: /Parcial 1/ }).first().click();
  await page.getByRole("checkbox", { name: "Tema 1: Introducción" }).check();
  await page.getByRole("checkbox", { name: "Tema 2: OpenMP" }).check();
  await page.getByRole("button", { name: "Guardar temas" }).click();
  await expect(page.getByText("Temas guardados.")).toBeVisible();

  await page.goto("/ajustes");
  for (const day of ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]) {
    await page.getByLabel(`Horas el ${day}`).fill("2");
  }
  await page.getByRole("button", { name: "Guardar horario" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();

  // Preguntas del Tema 1 para los repasos
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

  // HOY: 2 h repartidas en bloques de teoría + ejercicios
  await page.goto("/hoy");
  await expect(page.getByRole("list", { name: "Avisos del plan" })).toHaveCount(0);
  const today = page.getByRole("region", { name: "Plan de hoy" });
  await expect(today.getByRole("heading", { name: "CPA" })).toBeVisible();
  await expect(today.getByText("Tema 1: Introducción", { exact: true })).toBeVisible();
  await expect(today.getByText("40 min teoría").first()).toBeVisible();
  await expect(today.getByText("20 min ejercicios").first()).toBeVisible();
  await expect(today.getByLabel("Total 2 h")).toBeVisible();
  await shot(page, "50-hoy");

  // Sesión: cronómetro y cierre «difícil, no lo he entendido»
  await page.getByRole("link", { name: "EMPEZAR SESIÓN" }).click();
  await expect(page.getByRole("heading", { name: "Tema 1: Introducción" })).toBeVisible();
  await expect(page.getByText("Estudia la teoría de Tema 1: Introducción", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Iniciar cronómetro" }).click();
  await expect(page.getByRole("timer")).not.toHaveAccessibleName("Tiempo de estudio 0:00", { timeout: 5000 });
  await page.getByRole("button", { name: "Pausar" }).click();
  await shot(page, "51-sesion");
  const close = page.getByRole("form", { name: "Terminar sesión" });
  await close.getByText("Sí", { exact: true }).click();
  await close.getByText("Difícil", { exact: true }).click();
  await close.getByLabel("No he entendido bien este tema").check();
  await close.getByRole("button", { name: "Guardar y volver a Hoy" }).click();
  await expect(page.getByText("Sesión guardada. El plan se ha ajustado.")).toBeVisible();
  await expect(today.getByLabel("Hecha")).toHaveCount(1);

  // Saltar la siguiente: su trabajo se reparte
  await page.getByRole("link", { name: "EMPEZAR SESIÓN" }).click();
  await page.getByRole("button", { name: "Saltar esta tarea" }).click();
  await expect(page.getByRole("heading", { name: "Hoy", exact: true })).toBeVisible();
  await expect(today.locator(".line-through")).toHaveCount(1);

  // Plan: días, examen y repaso de mañana del tema no entendido
  await page.getByRole("link", { name: "Ver el plan de los próximos días" }).click();
  await expect(page.getByRole("heading", { name: "Plan de estudio" })).toBeVisible();
  await expect(page.getByText("Examen: CPA · Parcial 1")).toBeVisible();
  await expect(page.getByRole("region", { name: "Exámenes planificados" })).toContainText("En 10 días");
  const tomorrow = page.getByRole("listitem", { name: "Mañana" });
  await expect(tomorrow).toContainText("Tema 1: Introducción · 4 preguntas");
  await shot(page, "52-plan");
  await page.getByRole("button", { name: /Recalcular/ }).click();
  await expect(tomorrow).toContainText("Tema 1: Introducción · 4 preguntas");

  // Repaso desde su sesión: lanza un test del tema
  await tomorrow.getByRole("link", { name: /4 preguntas/ }).click();
  await page.getByRole("button", { name: "Hacer el test de repaso" }).click();
  await expect(page.getByRole("heading", { name: "Test por tema · CPA" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Ir a la pregunta" }).getByRole("button")).toHaveCount(4);

  expect(consoleErrors.filter((e) => !e.includes("favicon"))).toEqual([]);
});
