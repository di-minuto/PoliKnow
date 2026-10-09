import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de extremo a extremo contra Supabase local (`npx supabase start`).
 * Arrancan la app con `next dev` apuntando a ese Supabase.
 * PW_CHROMIUM_PATH permite usar un Chromium ya instalado.
 */
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [{ name: "móvil", use: { ...devices["Pixel 7"], launchOptions: executablePath ? { executablePath } : undefined } }],
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.E2E_SUPABASE_KEY ?? "",
      AI_PROVIDER: "none",
    },
  },
});
