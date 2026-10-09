import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Estudio — preparación de exámenes",
    short_name: "Estudio",
    description: "Sistema personal de preparación de exámenes universitarios.",
    lang: "es",
    id: "/hoy",
    start_url: "/hoy",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f8fafc",
    theme_color: "#4f46e5",
    categories: ["education", "productivity"],
    shortcuts: [
      { name: "Hoy", url: "/hoy", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Tests", url: "/tests", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Plan", url: "/plan", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Asistente", url: "/asistente", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
