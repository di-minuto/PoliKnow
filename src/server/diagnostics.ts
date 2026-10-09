import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPublicEnv, readServerEnv } from "@/lib/env";
import { getAIProvider } from "@/ai";
import { DisabledProvider } from "@/ai/providers/disabled";

export type Check = { label: string; ok: boolean; detail?: string; fix?: string };

/** Tablas mínimas que deben existir tras ejecutar las migraciones. */
const REQUIRED_TABLES = ["profiles", "courses", "subjects", "topics", "assessments", "assessment_types"];

/**
 * Comprueba la configuración paso a paso para poder explicar en pantalla
 * qué falla (en producción Next.js oculta los mensajes de error del servidor).
 */
export async function runDiagnostics(): Promise<Check[]> {
  const checks: Check[] = [];

  let url = "";
  try {
    url = getPublicEnv().NEXT_PUBLIC_SUPABASE_URL;
    const ok = /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url) || url.startsWith("http://127.0.0.1");
    checks.push({
      label: "Variables de entorno",
      ok,
      detail: url,
      fix: ok ? undefined : "NEXT_PUBLIC_SUPABASE_URL debe ser solo https://<proyecto>.supabase.co, sin /rest/v1/.",
    });
  } catch (error) {
    checks.push({
      label: "Variables de entorno",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      fix: "Revisa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en Vercel y vuelve a desplegar.",
    });
    return checks;
  }

  const db = await createClient();

  const { data: claims, error: authError } = await db.auth.getClaims();
  checks.push({
    label: "Sesión",
    ok: Boolean(claims?.claims?.sub),
    detail: authError?.message ?? (claims?.claims?.email as string | undefined) ?? "Sin sesión iniciada",
    fix: authError?.message?.includes("API key")
      ? "La clave publicable no es la de este proyecto: cópiala con el botón de copiar en Supabase."
      : claims?.claims?.sub
        ? undefined
        : "Inicia sesión para comprobar el resto.",
  });

  for (const table of REQUIRED_TABLES) {
    // Sin `head`: una petición HEAD a una tabla inexistente no devuelve el error.
    const { error } = await db.from(table).select("*").limit(1);
    if (error) {
      const missing = /does not exist|Could not find the table|PGRST205|42P01/i.test(`${error.code} ${error.message}`);
      checks.push({
        label: `Tabla ${table}`,
        ok: false,
        detail: `${error.code ?? ""} ${error.message}`.trim(),
        fix: missing
          ? "Faltan las tablas: ejecuta supabase/instalar-todo.sql en el SQL Editor de Supabase."
          : error.message.includes("API key")
            ? "La clave publicable no es la de este proyecto."
            : undefined,
      });
    } else {
      checks.push({ label: `Tabla ${table}`, ok: true });
    }
  }

  // IA (opcional): una variable mal escrita la desactiva, pero no rompe nada.
  const ai = getAIProvider();
  const { issues } = readServerEnv();
  checks.push({
    label: "Inteligencia artificial (opcional)",
    ok: issues.length === 0 && (ai.enabled || !(ai instanceof DisabledProvider) || !ai.reason),
    detail: ai.enabled ? `${ai.name} · ${ai.model}` : (!issues.length && ai instanceof DisabledProvider && ai.reason) || "Desactivada",
    fix: issues.length
      ? `${issues.map((i) => i.message).join(" ")} Corrígelo en Vercel (Settings → Environment Variables) y vuelve a desplegar.`
      : ai instanceof DisabledProvider && ai.reason
        ? "Añade la clave que falta en Vercel y vuelve a desplegar."
        : undefined,
  });

  // Fase 3: búsqueda (migración 20261009000003_search.sql).
  const search = await db.rpc("search_all", { q: "prueba", max_results: 1 });
  checks.push({
    label: "Búsqueda (Fase 3)",
    ok: !search.error,
    detail: search.error ? `${search.error.code ?? ""} ${search.error.message}`.trim() : undefined,
    fix: search.error ? "Ejecuta supabase/instalar-fase3.sql en el SQL Editor de Supabase." : undefined,
  });

  if (claims?.claims?.sub) {
    const { data, error } = await db.from("profiles").select("id").eq("id", claims.claims.sub).maybeSingle();
    checks.push({
      label: "Perfil de usuario",
      ok: Boolean(data),
      detail: error?.message,
      fix: data ? undefined : "Se creará al abrir la pantalla Hoy.",
    });
  }

  return checks;
}
