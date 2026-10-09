/*
 * Service worker de la PWA (escrito a mano, sin dependencias).
 * - Estáticos con hash (/_next/static, pdf.js, OCR, iconos): primero caché.
 * - Páginas: primero red; si no hay conexión, la última copia guardada de esa
 *   página o, si nunca se abrió, /offline.
 * - Nada que no sea GET ni de otro dominio (Supabase) pasa por la caché.
 * Al cerrar sesión la app pide borrar las páginas guardadas.
 */
const VERSION = "v1";
const STATIC = `estudio-static-${VERSION}`;
const PAGES = `estudio-pages-${VERSION}`;
const OFFLINE_URL = "/offline";
const MAX_PAGES = 80;
const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
const NO_CACHE_PAGES = ["/login", "/auth", "/estado", OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("estudio-") && k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "clear-pages") event.waitUntil(caches.delete(PAGES));
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/pdfjs/") ||
  url.pathname.startsWith("/ocr/") ||
  url.pathname.startsWith("/icons/");

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC);
    cache.put(request, response.clone());
  }
  return response;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(key);
}

async function page(request, url) {
  try {
    const response = await fetch(request);
    const cacheable =
      response.ok && response.type === "basic" && !response.redirected && !NO_CACHE_PAGES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));
    if (cacheable) {
      const cache = await caches.open(PAGES);
      // La más reciente al final: trim() borra las más antiguas.
      await cache.delete(request);
      await cache.put(request, response.clone());
      trim(cache);
    }
    return response;
  } catch {
    const cached = (await caches.match(request, { cacheName: PAGES })) ?? (await caches.match(url.pathname, { cacheName: PAGES }));
    return cached ?? (await caches.match(OFFLINE_URL)) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isStatic(url)) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(page(request, url));
  }
  // El resto (datos de navegación de Next, acciones…) va directo a la red:
  // si falla sin conexión, Next recarga la página y la sirve la caché.
});
