import { expect, test, type Page } from "@playwright/test";
import { makeDocx, makePdf, makePptx } from "../fixtures/documents";

/*
 * Fase 3 en un móvil: subir PDF, DOCX, PPTX e imagen a la biblioteca, leer su
 * texto, detectar duplicados, filtrar, editar, buscar sin tildes y borrar.
 */

const email = `e2e-docs-${Date.now()}@example.com`;
const password = "contraseña-segura-123";
const shots = process.env.E2E_SCREENSHOTS;

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

// PNG de 1×1 píxel.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("biblioteca: subir, leer, buscar y borrar documentos", async ({ page }) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const pdf = Buffer.from(
    await makePdf([
      ["Tema 2: OpenMP", "", "La directiva parallel crea un equipo de hilos."],
      ["La clausula reduction combina los resultados parciales de cada hilo."],
    ]),
  );
  const docx = Buffer.from(
    await makeDocx([
      { text: "Semáforos", heading: true },
      { text: "Un semáforo protege la sección crítica." },
    ]),
  );
  const pptx = Buffer.from(
    await makePptx([
      { title: "Monitores", bullets: ["Exclusión mutua implícita"] },
      { title: "Variables condición", bullets: ["wait y signal"], notes: "Ejemplo del buffer acotado" },
    ]),
  );

  // Cuenta, curso, asignatura y un tema
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

  // Biblioteca vacía → subir desde la asignatura
  await page.getByRole("link", { name: "Subir" }).click();
  await expect(page.getByRole("heading", { name: "Subir documentos" })).toBeVisible();

  // PDF con título propio y tema
  await page.getByLabel("Archivos").setInputFiles({ name: "tema2-openmp.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.getByLabel("Título")).toHaveValue("tema2-openmp");
  await page.getByLabel("Título").fill("Apuntes OpenMP");
  await page.getByRole("checkbox", { name: "Tema 2: OpenMP" }).check();
  await page.getByRole("button", { name: "Subir" }).click();
  const progress = page.getByRole("region", { name: "Progreso de la subida" });
  await expect(progress.getByText(/Listo · 2 fragmentos|Listo · 1 fragmento/)).toBeVisible();
  await shot(page, "10-subida-pdf");

  // Varios a la vez: DOCX, PPTX e imagen (tipo «Apuntes»)
  await page.getByLabel("Archivos").setInputFiles([
    { name: "semaforos.docx", mimeType: "", buffer: docx },
    { name: "monitores.pptx", mimeType: "", buffer: pptx },
    { name: "pizarra.png", mimeType: "image/png", buffer: PNG },
  ]);
  await expect(page.getByText("Se subirán 3 archivos")).toBeVisible();
  // Los datos se mantienen entre subidas: estos no son del tema 2.
  await page.getByRole("checkbox", { name: "Tema 2: OpenMP" }).uncheck();
  await page.getByRole("combobox", { name: "Tipo" }).selectOption({ label: "Apuntes" });
  await page.getByRole("button", { name: "Subir" }).click();
  await expect(progress.getByText(/^Listo/)).toHaveCount(3);
  await expect(progress.getByText("Imagen guardada", { exact: false })).toBeVisible();

  // El mismo PDF otra vez → duplicado
  await page.getByLabel("Archivos").setInputFiles({ name: "copia.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: "Subir" }).click();
  await expect(progress.getByText(/Ya estaba · Ya tienes este archivo: «Apuntes OpenMP»/)).toBeVisible();

  // Lista y filtros
  await page.goto("/biblioteca");
  const list = page.getByRole("list", { name: "Documentos" });
  await expect(list.getByRole("link")).toHaveCount(4);
  await shot(page, "11-biblioteca");
  await page.getByRole("combobox", { name: "Tipo de documento" }).selectOption({ label: "Apuntes" });
  await expect(page).toHaveURL(/tipo=notes/);
  await expect(list.getByRole("link")).toHaveCount(3);
  const subjects = page.getByRole("navigation", { name: "Filtrar por asignatura" });
  await subjects.getByRole("link", { name: "CPA" }).click();
  await expect(page).toHaveURL(/asignatura=/);
  await page.getByRole("combobox", { name: "Tema" }).selectOption({ label: "Tema 2: OpenMP" });
  await expect(page).toHaveURL(/tema=/);
  await expect(page.getByText("No hay documentos con estos filtros.")).toBeVisible();
  await page.getByRole("combobox", { name: "Tipo de documento" }).selectOption({ label: "Todos los tipos" });
  await expect(list.getByRole("link")).toHaveCount(1);

  // Ficha del PDF: texto por páginas, abrir el archivo, editar
  await list.getByRole("link", { name: /Apuntes OpenMP/ }).click();
  await expect(page.getByRole("heading", { name: "Apuntes OpenMP" })).toBeVisible();
  await expect(page.getByText("Texto listo")).toBeVisible();
  await expect(page.getByText("La directiva parallel crea un equipo de hilos.", { exact: false })).toBeVisible();
  await expect(page.getByText(/Pág\. 1/)).toBeVisible();
  const openHref = await page.getByRole("link", { name: "Abrir" }).getAttribute("href");
  const file = await page.request.get(openHref!);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("application/pdf");
  await page.getByText("Editar datos").click();
  await page.getByLabel("Título").fill("OpenMP: directivas");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenMP: directivas" })).toBeVisible();
  await page.getByRole("button", { name: "Volver a leer el texto" }).click();
  await expect(page.getByText("Texto actualizado.")).toBeVisible();
  await shot(page, "12-ficha");

  // Búsqueda sin tildes con resaltado; abre el fragmento
  await page.goto("/buscar");
  await page.getByRole("searchbox", { name: "Qué buscas" }).fill("clausula reduction");
  await page.getByRole("button", { name: "Buscar" }).click();
  const hit = page.getByRole("link", { name: /OpenMP: directivas/ }).first();
  await expect(hit.locator("mark").first()).toHaveText(/clausula/i);
  await shot(page, "13-buscar");
  await hit.click();
  await expect(page).toHaveURL(/fragmento=\d+/);
  await expect(page.locator("li.ring-2")).toContainText("reduction");

  // Diapositivas y notas también se buscan
  await page.goto("/buscar?q=buffer%20acotado");
  await expect(page.getByText(/Diap\. 1–2/)).toBeVisible();
  await page.goto("/buscar?q=semaforo");
  await expect(page.getByRole("link", { name: /semaforos/ }).first()).toBeVisible();

  // Borrar la imagen
  await page.goto("/biblioteca");
  await page.getByRole("link", { name: /pizarra/ }).click();
  await expect(page.getByText("Sin texto (imagen)").first()).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Borrar documento" }).click();
  await expect(page).toHaveURL(/\/biblioteca$/);
  await expect(page.getByRole("list", { name: "Documentos" }).getByRole("link")).toHaveCount(3);

  // La asignatura cuenta sus documentos
  await subjects.getByRole("link", { name: "CPA" }).click();
  await page.getByRole("link", { name: /OpenMP: directivas/ }).click();
  await page.getByRole("link", { name: "CPA · Computación Paralela" }).click();
  await expect(page.getByRole("link", { name: "3 documentos" })).toBeVisible();

  expect(consoleErrors.filter((e) => /hydrat|Warning/i.test(e))).toEqual([]);
});
