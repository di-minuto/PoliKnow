import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/*
 * Fase 10 en un móvil, contra el build de producción (3200, vía proxy 3201) porque el
 * service worker solo se registra ahí: manifest, páginas ya abiertas sin
 * conexión, página «Sin conexión», simulacro sin red que se sincroniza al
 * volver y ninguna página más ancha que la pantalla.
 */

// A través de un proxy que puede «cortar la red» (tests/e2e/toggle-proxy.mjs).
test.use({ baseURL: "http://localhost:3201" });

/** Sin conexión de verdad: se corta el servidor y el navegador se entera (navigator.onLine). */
async function setOffline(context: BrowserContext, offline: boolean) {
  await fetch(`http://127.0.0.1:3202/${offline ? "down" : "up"}`);
  await context.setOffline(offline);
}

const email = `e2e-pwa-${Date.now()}@example.com`;
const password = "contraseña-segura-123";
const shots = process.env.E2E_SCREENSHOTS;

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

test("PWA: instalable, sin conexión y móvil", async ({ page, context, request }) => {
  test.setTimeout(240_000);
  page.on("dialog", (d) => d.accept());

  // Manifest y service worker publicados
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/hoy", lang: "es" });
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  expect(manifest.shortcuts.map((s: { url: string }) => s.url)).toContain("/tests");
  expect((await request.get("/sw.js")).ok()).toBe(true);
  expect((await request.get("/offline")).ok()).toBe(true);

  await page.goto("/login");
  await page.getByRole("button", { name: /Crea tu cuenta/ }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Hoy", exact: true })).toBeVisible();

  // El service worker toma el control
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  // Asignatura y dos preguntas para un simulacro
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
  await page.goto("/preguntas/importar");
  await page.getByLabel("…o pega el JSON aquí").fill(
    JSON.stringify({ questions: ["A", "B"].map((x) => ({ type: "vf", topic: "Tema 1", stem: `Afirmación ${x}.`, answer: "V" })) }),
  );
  await page.getByRole("button", { name: "Comprobar" }).click();
  const result = page.getByRole("region", { name: "Resultado de la comprobación" });
  await result.getByRole("button", { name: "Importar 2 preguntas" }).click();
  await expect(result.getByText("2 preguntas importadas.")).toBeVisible();

  // Ninguna página principal se sale de la pantalla del móvil
  for (const path of ["/hoy", "/plan", "/tests", "/simulacro", "/estadisticas", "/asistente", "/biblioteca", "/preguntas", "/buscar", "/ajustes", "/mas", "/asignaturas"]) {
    await page.goto(path);
    await expect(page.locator("main h1").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} es más ancha que la pantalla`).toBeLessThanOrEqual(0);
  }

  // Sin conexión: lo ya abierto se ve; lo nuevo muestra «Sin conexión»
  await page.goto("/plan");
  await page.goto("/hoy");
  await setOffline(context, true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hoy", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Sin conexión" })).toBeVisible();
  await shot(page, "80-sin-conexion");
  await page.getByRole("navigation", { name: "Principal" }).last().getByRole("link", { name: "Plan" }).click();
  await expect(page.getByRole("heading", { name: "Plan de estudio" })).toBeVisible();
  await page.goto("/preguntas/nueva").catch(() => undefined);
  await expect(page.getByRole("heading", { name: "Sin conexión" })).toBeVisible();
  await setOffline(context, false);

  // Simulacro: sin red las respuestas se quedan en el móvil y se envían al volver
  await page.goto("/simulacro");
  const builder = page.getByRole("region", { name: "Configurar simulacro" });
  await builder.getByRole("checkbox", { name: "Tema 1: Introducción" }).check();
  await builder.getByLabel("Preguntas").fill("2");
  await builder.getByLabel("Duración (min)").fill("30");
  await builder.getByRole("button", { name: "Empezar simulacro" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await setOffline(context, true);
  const card = (n: number) => page.getByRole("region", { name: `Pregunta ${n}`, exact: true });
  await card(1).getByRole("radio", { name: "Verdadero" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText("1 respuesta guardada en el dispositivo")).toBeVisible();
  await card(2).getByRole("radio", { name: "Verdadero" }).click();
  await page.getByRole("button", { name: "Entregar" }).click();
  await expect(page.getByText(/Sin conexión: tus respuestas están guardadas en el móvil/)).toBeVisible();
  await expect(page.getByText("2 respuestas guardadas en el dispositivo")).toBeVisible();
  await shot(page, "81-examen-sin-red");
  await setOffline(context, false);
  await expect(page.getByText(/respuestas? guardadas? en el dispositivo/)).toHaveCount(0);
  await page.getByRole("button", { name: "Entregar" }).click();
  await expect(page.getByRole("heading", { name: /^Resultados/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Resumen" }).getByLabel("Nota 10 sobre 10")).toBeVisible();

  // Instalar: tarjeta con instrucciones; al cerrar sesión se borran las páginas guardadas
  await page.goto("/mas");
  await expect(page.getByRole("region", { name: "Instalar la app" })).toBeVisible();
  await page.goto("/ajustes");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const pages = names.filter((n) => n.startsWith("estudio-pages-"));
    return (await Promise.all(pages.map(async (n) => (await (await caches.open(n)).keys()).length))).reduce((a, b) => a + b, 0);
  });
  expect(cached).toBe(0);
});
