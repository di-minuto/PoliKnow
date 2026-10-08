# Estudio — sistema personal de preparación de exámenes

PWA (móvil y escritorio) para organizar el material de la universidad, practicar con
tests y exámenes oficiales, y seguir un plan de estudio adaptativo con repaso espaciado.

- **Diseño completo:** [`docs/DISENO.md`](docs/DISENO.md) (arquitectura, esquema de BD, riesgos y fases).
- **Stack:** Next.js 16 (App Router) + TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage) · Vercel.

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Arquitectura, proyecto, base de datos, autenticación | ✅ Hecha |
| 2 | Asignaturas, parciales y temas | Pendiente |
| 3 | Biblioteca y subida de documentos | Pendiente |
| 4 | Banco de preguntas | Pendiente |
| 5 | Tests | Pendiente |
| 6 | Exámenes | Pendiente |
| 7 | Planificador | Pendiente |
| 8 | Dashboard y estadísticas | Pendiente |
| 9 | IA y procesamiento de documentos | Pendiente |
| 10 | PWA y optimización móvil | Pendiente |
| 11 | Backups, importación/exportación | Pendiente |

### Fase 1: qué incluye

- Proyecto Next.js con TypeScript estricto, Tailwind y ESLint.
- **Migraciones** (`supabase/migrations/`) con el esquema completo: jerarquía académica,
  biblioteca, exámenes oficiales, banco de preguntas, progreso y repaso espaciado,
  intentos, planificación, sesiones, caché de IA y asistente. RLS en todas las tablas y
  bucket privado `documents`.
- **Autenticación** con Supabase Auth (email + contraseña), sesión por cookies,
  protección de rutas en `src/proxy.ts` y confirmación de email en `/auth/confirm`.
- **Navegación mobile-first**: barra inferior en móvil, lateral en escritorio; pantalla
  **Hoy** como inicio; secciones de fases futuras marcadas.
- **Capa de IA** independiente del proveedor (`src/ai/`): interfaz `AIProvider`,
  registro de proveedores, modo desactivado por defecto, respuestas JSON validadas con zod
  y claves de caché deterministas.
- **Manifest PWA** e iconos (instalable; el modo offline llega en la Fase 10).
- **Tests** (Vitest): migraciones y políticas RLS sobre Postgres real (PGlite), reglas de
  procedencia de preguntas, utilidades de fechas y capa de IA.

## Puesta en marcha

Requisitos: Node 20+ y una cuenta gratuita de [Supabase](https://supabase.com).

1. **Crear el proyecto de Supabase** (plan gratuito, región UE).
2. **Aplicar las migraciones** con la CLI de Supabase:
   ```bash
   npx supabase login
   npx supabase link --project-ref <tu-project-ref>
   npx supabase db push
   ```
   (Alternativa: pegar los archivos de `supabase/migrations/` en orden en el SQL Editor.)
3. **Variables de entorno**: copia `.env.example` a `.env.local` y rellena la URL y la
   clave publicable (Project Settings → API).
4. **Auth** (Authentication → URL Configuration): añade `http://localhost:3000/auth/confirm`
   y la URL de Vercel a *Redirect URLs*. Tras crear tu cuenta, desactiva los registros nuevos
   (*Allow new users to sign up*), porque la app es personal.
5. Instalar y arrancar:
   ```bash
   npm install
   npm run dev
   ```

### Despliegue en Vercel

Importa el repositorio en Vercel, añade las mismas variables de entorno y despliega.
Las claves de IA (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) solo se configuran en Vercel o en
`.env.local`, nunca en el código.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm run check` | Tipos + lint + tests |
| `npm test` | Tests (Vitest) |
| `npm run db:push` | Aplica las migraciones al proyecto enlazado |
| `npm run db:types` | Regenera `src/types/database.ts` desde Supabase |

## Estructura

```
src/
  app/            rutas (App Router): (auth)/login, auth/confirm, (app)/hoy, ...
  components/     UI reutilizable (layout/)
  domain/         lógica de negocio pura y tipos (academic, documents, questions, ...)
  server/         acceso a datos en servidor (auth, perfil, repositorios)
  ai/             AIProvider, registro de proveedores, JSON validado, caché
  lib/            Supabase (cliente/servidor/sesión), env, rutas, fechas
  proxy.ts        refresco de sesión y protección de rutas
supabase/migrations/   SQL versionado
tests/db/              tests de migraciones y RLS (PGlite)
docs/DISENO.md         documento de diseño
```

Reglas de arquitectura: `domain/` no importa Next, Supabase ni IA; solo `server/` y
`lib/supabase` hablan con la base de datos; las claves solo existen en el servidor.
