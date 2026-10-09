import { expect, test, type Page } from "@playwright/test";

/*
 * Fase 4 en un móvil: preguntas de varios tipos, variantes, exámenes oficiales,
 * importación JSON (oficial y de IA con revisión), filtros, archivo y búsqueda.
 */

const email = `e2e-preguntas-${Date.now()}@example.com`;
const password = "contraseña-segura-123";
const shots = process.env.E2E_SCREENSHOTS;

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

test("banco de preguntas y exámenes oficiales", async ({ page }) => {
  test.setTimeout(150_000);
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // Cuenta, curso, asignatura y temas
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

  // Tipo test
  await page.goto("/preguntas");
  await expect(page.getByText("Aún no hay preguntas.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Nueva" }).click();
  await page.getByRole("combobox", { name: "Tema" }).selectOption({ label: "Tema 2: OpenMP" });
  await page.getByLabel("Enunciado").fill("¿Qué cláusula combina los resultados parciales de cada hilo?");
  for (const [i, text] of ["private", "reduction", "shared", "nowait"].entries()) {
    await page.getByRole("textbox", { name: `Opción ${"ABCD"[i]}`, exact: true }).fill(text);
  }
  await page.getByRole("radio", { name: "Opción B correcta" }).check();
  await page.getByLabel("Etiquetas").fill("openmp, hilos");
  await shot(page, "20-editor-test");
  await page.getByRole("button", { name: "Guardar pregunta" }).click();
  await expect(page.getByText("Pregunta guardada.")).toBeVisible();
  const options = page.getByRole("list", { name: "Opciones" });
  await expect(options.getByRole("listitem").nth(1)).toContainText("reduction");
  await expect(options.getByRole("listitem").nth(1).getByLabel("Correcta")).toBeVisible();
  await expect(page.locator("header").getByText("Creada por mí")).toBeVisible();
  await shot(page, "21-pregunta");
  const mcUrl = page.url();

  // Numérica con coma decimal
  await page.getByRole("link", { name: "Añadir otra" }).click();
  await page.getByRole("combobox", { name: "Tipo de pregunta" }).selectOption({ label: "Ejercicio numérico" });
  await page.getByLabel("Enunciado").fill("Tiempo paralelo con 4 hilos si T1 = 10 s y eficiencia 1.");
  await page.getByLabel("Resultado").fill("2,5");
  await page.getByLabel("Margen ±").fill("0,1");
  await page.getByLabel("Unidad").fill("s");
  await page.getByRole("button", { name: "Guardar pregunta" }).click();
  await expect(page.getByText("2,5 ± 0,1 s")).toBeVisible();
  // Editar
  await page.getByText("Editar pregunta").click();
  await page.getByLabel("Enunciado").fill("Tiempo paralelo con 4 hilos si T1 = 10 s.");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await expect(page.getByText("Tiempo paralelo con 4 hilos si T1 = 10 s.").first()).toBeVisible();

  // Variante de la de tipo test
  await page.goto(mcUrl);
  await page.getByRole("link", { name: "Crear variante" }).click();
  await expect(page.getByRole("heading", { name: "Nueva variante" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Opción B", exact: true })).toHaveValue("reduction");
  await page.getByLabel("Enunciado").fill("¿Qué cláusula da a cada hilo su propia copia de una variable?");
  await page.getByRole("radio", { name: "Opción A correcta" }).check();
  await page.getByRole("button", { name: "Guardar pregunta" }).click();
  await expect(page.getByText("Variante de")).toBeVisible();

  // Examen oficial a mano
  await page.goto("/examenes");
  await page.getByLabel("Título").fill("Parcial enero 2025");
  await page.getByLabel("Año").fill("2025");
  await page.getByLabel("Puntos totales").fill("10");
  await page.getByLabel("Resta por fallo").fill("0,33");
  await page.getByRole("button", { name: "Crear examen" }).click();
  await expect(page.getByRole("heading", { name: "Parcial enero 2025" })).toBeVisible();
  await expect(page.getByText(/resta 0,33 por fallo/)).toBeVisible();
  await page.getByRole("link", { name: "Añadir pregunta" }).click();
  await expect(page.getByRole("combobox", { name: "Procedencia" })).toHaveValue("official_exam");
  await page.getByRole("combobox", { name: "Tipo de pregunta" }).selectOption({ label: "Verdadero / falso" });
  await page.getByLabel("Enunciado").fill("Una sección crítica la puede ejecutar más de un hilo a la vez.");
  await page.getByRole("radio", { name: "Falso" }).check();
  await page.getByLabel("Puntos").fill("0,5");
  await page.getByRole("button", { name: "Guardar pregunta" }).click();
  await expect(page.locator("header").getByText(/Examen oficial · Parcial enero 2025 · 2025 · nº 1/)).toBeVisible();
  await expect(page.locator("main section").first().getByText("Falso", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "← Parcial enero 2025" }).click();
  await expect(page.getByText("Preguntas (1)")).toBeVisible();
  await expect(page.getByText("Los puntos de las preguntas no suman el total del examen.")).toBeVisible();
  await shot(page, "22-examen");

  // Importar un examen oficial (con una pregunta errónea que se salta)
  await page.goto("/preguntas/importar");
  await page.getByLabel("…o pega el JSON aquí").fill(
    JSON.stringify({
      exam: { title: "Junio 2024", year: 2024, session: "junio" },
      questions: [
        { type: "test", topic: "Tema 2", stem: "¿Qué hace nowait?", options: ["Quita la barrera", "Añade una barrera"], answer: "A", points: 1 },
        { type: "theory", stem: "Explica la ley de Amdahl.", answer: "S = 1 / ((1 - p) + p / n)", points: 2 },
        { type: "multiple_choice", stem: "Sin opciones", answer: "A" },
      ],
    }),
  );
  await page.getByRole("button", { name: "Comprobar" }).click();
  const result = page.getByRole("region", { name: "Resultado de la comprobación" });
  await expect(result.getByText("2 preguntas listas para importar como examen oficial «Junio 2024».")).toBeVisible();
  await expect(result.getByText(/Pregunta 3: Pon al menos dos opciones/)).toBeVisible();
  await shot(page, "23-importar");
  await result.getByRole("button", { name: "Importar 2 preguntas" }).click();
  await expect(result.getByText("2 preguntas importadas.")).toBeVisible();
  await result.getByRole("link", { name: "Ver el examen" }).click();
  await expect(page.getByRole("heading", { name: "Junio 2024" })).toBeVisible();
  await expect(page.getByText("Preguntas (2)")).toBeVisible();

  // Importar preguntas de IA: entran «Por revisar»
  await page.goto("/preguntas/importar");
  await page.getByLabel("…o pega el JSON aquí").fill(
    JSON.stringify({
      questions: [{ type: "vf", stem: "OpenMP usa memoria compartida.", answer: "V", source: "ai_generated", ai_model: "modelo-prueba" }],
    }),
  );
  await page.getByRole("button", { name: "Comprobar" }).click();
  await result.getByRole("button", { name: "Importar 1 pregunta" }).click();
  await expect(result.getByText("1 pregunta importada.")).toBeVisible();

  // Lista: revisar, filtros, búsqueda sin tildes y archivo
  await page.goto("/preguntas");
  await expect(page.getByText("7 preguntas")).toBeVisible();
  await page.getByRole("link", { name: "Por revisar", exact: true }).click();
  const list = page.getByRole("list", { name: "Lista de preguntas" });
  await expect(list.getByRole("link")).toHaveCount(1);
  await expect(list.getByText("Generada por IA")).toBeVisible();
  await list.getByRole("link").click();
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByRole("button", { name: "Aprobar" })).toHaveCount(0);

  await page.goto("/preguntas");
  await page.getByRole("combobox", { name: "Procedencia" }).selectOption({ label: "Examen oficial" });
  await expect(page).toHaveURL(/fuente=official_exam/);
  await expect(list.getByRole("link")).toHaveCount(3);
  await page.goto("/preguntas");
  await page.getByRole("searchbox", { name: "Buscar en los enunciados" }).fill("clausula hilo");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(list.getByRole("link")).toHaveCount(2);
  await shot(page, "24-lista");
  await list.getByRole("link", { name: /resultados parciales/ }).click();
  await page.getByRole("button", { name: "Archivar" }).click();
  await expect(page.getByText("Archivada", { exact: true })).toBeVisible();
  await page.goto("/preguntas?q=clausula%20hilo");
  await expect(list.getByRole("link")).toHaveCount(1);
  await page.goto("/preguntas?q=clausula%20hilo&archivadas=1");
  await expect(list.getByRole("link")).toHaveCount(1);

  // Búsqueda global y recuento en la asignatura
  await page.goto("/buscar?q=amdahl");
  await page.getByRole("link", { name: /Amdahl/ }).click();
  await expect(page.locator("header").getByText("Pregunta teórica")).toBeVisible();
  await page.getByRole("link", { name: "CPA · Computación Paralela" }).click();
  await expect(page.getByRole("link", { name: "6 preguntas" })).toBeVisible();

  // Borrar un examen borra sus preguntas
  await page.goto("/examenes");
  await page.getByRole("link", { name: /Junio 2024/ }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Borrar examen y sus preguntas" }).click();
  await expect(page).toHaveURL(/\/examenes$/);
  await expect(page.getByRole("list", { name: "Exámenes oficiales" }).getByRole("link")).toHaveCount(1);
  await page.goto("/preguntas");
  await expect(page.getByText("4 preguntas")).toBeVisible();

  expect(consoleErrors.filter((e) => /hydrat|Warning/i.test(e))).toEqual([]);
});
