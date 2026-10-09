/** Rutas accesibles sin sesión. */
const PUBLIC_PATHS = ["/login", "/auth", "/estado"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Valida el destino tras el login para evitar redirecciones abiertas:
 * solo rutas internas absolutas.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/hoy"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
