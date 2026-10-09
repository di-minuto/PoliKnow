# Estudio — sistema personal de preparación de exámenes

PWA (móvil y escritorio) para organizar el material de la universidad, practicar con
tests y exámenes oficiales, y seguir un plan de estudio adaptativo con repaso espaciado.

- **Diseño completo:** [`docs/DISENO.md`](docs/DISENO.md) (arquitectura, esquema de BD, riesgos y fases).
- **Stack:** Next.js 16 (App Router) + TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage) · Vercel.

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Arquitectura, proyecto, base de datos, autenticación | ✅ Hecha |
| 2 | Asignaturas, parciales y temas | ✅ Hecha |
| 3 | Biblioteca y subida de documentos | ✅ Hecha |
| 4 | Banco de preguntas | ✅ Hecha |
| 5 | Tests y repaso espaciado | ✅ Hecha |
| 6 | Simulador de exámenes | ✅ Hecha |
| 7 | Planificador, pantalla HOY y sesiones | ✅ Hecha |
| 8 | Dashboard y estadísticas | ✅ |
| 9 | IA y procesamiento de documentos | ✅ |
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

### Fase 2: qué incluye

- **Cursos y asignaturas** (`/asignaturas`): siglas, color, dificultad percibida e importancia;
  la lista muestra el próximo examen de cada asignatura con cuenta atrás.
- **Temas y prácticas** (`/asignaturas/[id]`): subtemas ilimitados, horas estimadas,
  reordenar con flechas, editar y borrar.
- **Evaluaciones** (parciales, final, examen de prácticas...): fecha y hora en tu zona horaria,
  duración, importancia, dificultad, peso en la nota y estado.
- **Temas por evaluación** con **pesos** (`/asignaturas/[id]/evaluaciones/[id]`): el porcentaje
  de cada tema se calcula solo; el mismo tema puede entrar en el parcial y en el final.
- **Tiempo disponible** por día de la semana y **días sin estudio** (`/ajustes`), que usará el
  planificador de la Fase 7.
- **Hoy** muestra los próximos exámenes con los días que faltan.
- Lógica pura en `src/domain/academic` (árbol de temas, reordenación, pesos, validación con
  zod), repositorios en `src/server/repositories` y Server Actions en `src/server/actions`.
- Test **e2e en móvil** (Playwright) que recorre todo lo anterior contra una base de datos real.

### Fase 3: qué incluye

- **Biblioteca** (`/biblioteca`): documentos por asignatura con filtros por asignatura, tipo y
  tema; icono por formato, tamaño, páginas y estado de lectura del texto.
- **Subida** (`/biblioteca/subir`): uno o varios archivos (PDF, DOCX, PPTX, TXT, Markdown e
  imágenes, hasta 50 MB) con asignatura, tipo, temas, evaluaciones y, si es un examen, año y
  convocatoria. El archivo va **directo del navegador a Supabase Storage** (bucket privado), sin
  pasar por Vercel. Los duplicados se detectan por la huella SHA-256.
- **Lectura del texto en el dispositivo** (`src/documents/`): pdf.js por páginas, DOCX con sus
  títulos como secciones, PPTX por diapositivas con título y notas del orador, TXT/Markdown.
  El texto se trocea en fragmentos de ~1500 caracteres con su página y se guarda en
  `document_chunks`. Las imágenes quedan para el OCR de la Fase 9. Coste: cero.
- **Ficha del documento** (`/biblioteca/[id]`): abrir o descargar con enlace temporal, ver el
  texto extraído paginado, editar datos, volver a leer el texto y borrar (archivo incluido).
- **Búsqueda global** (`/buscar`): texto completo en español **sin tildes** («clausula» encuentra
  «cláusula») sobre fragmentos, títulos, preguntas y temas, con resaltado y filtro por
  asignatura; cada resultado lleva a la página exacta del documento.
- La página de cada asignatura muestra cuántos documentos tiene y un acceso para subir más.
- Migración `20261009000003_search.sql` (configuración `es_unaccent` y función `search_all`).
  Si ya tenías la base de datos de las fases 1-2, ejecuta `supabase/instalar-fase3.sql` en el
  SQL Editor.

### Fase 4: qué incluye

- **Banco de preguntas** (`/preguntas`): los 9 tipos (tipo test con una o varias correctas,
  verdadero/falso, respuesta corta, numérica con margen y unidad, programación, completar código,
  encontrar errores, teórica y problema), con tema, subtema, dificultad, etiquetas, explicación y
  documento de origen. Enunciados con bloques de código.
- **Procedencia siempre visible** y con color propio: examen oficial, material de la asignatura,
  creada por mí o generada por IA. La BD impide mezclar oficiales con el resto; las de IA guardan
  el modelo y entran «Por revisar» (aprobar o descartar).
- **Lista con filtros** por asignatura, tema (incluye subtemas), tipo, procedencia, pendientes de
  revisar y archivadas, y búsqueda sin tildes en los enunciados.
- **Variantes** («parecida a»), archivar y borrar.
- **Exámenes oficiales** (`/examenes`): título, año, convocatoria, fecha, duración, puntos, resta
  por fallo, evaluación y PDF de enunciado/soluciones de la biblioteca; sus preguntas numeradas y
  aviso si los puntos no suman el total.
- **Importación JSON** (`/preguntas/importar`): se comprueba antes de guardar, informa de errores
  por pregunta, busca los temas por nombre y, si el archivo trae `exam`, crea el examen oficial.
- Corrección automática de los tipos que lo permiten (`src/domain/questions/grading.ts`), lista
  para los tests de la Fase 5. Los números admiten coma decimal.
- Sin migraciones nuevas: usa las tablas de la Fase 1.

### Fase 5: qué incluye

- **Tests** (`/tests`): modos automáticos con un toque (**test rápido** de 10 preguntas
  de lo que estás estudiando, **repaso de fallos** y **repaso inteligente**) y un
  generador para elegir asignatura, temas o un parcial, número de preguntas,
  dificultad, tipos y procedencia. Accesos «Hacer test» desde la asignatura y desde
  cada parcial.
- **Hacer el test**: una pregunta por pantalla, corrección al momento en el servidor
  (la solución no llega al navegador antes de responder), navegación libre, marcar
  preguntas y retomar un test a medias. Teoría, problemas y código se autoevalúan
  (Mal / Regular / Bien) tras ver la respuesta modelo.
- **Resultados**: nota sobre 10, aciertos/fallos/regular/sin responder, tiempo, nota
  por tema, qué repasar y botón «Repasar fallos»; cada pregunta con tu respuesta,
  la solución, la explicación y su procedencia. Historial de tests.
- **Repaso espaciado** (`src/domain/srs`): modelo tipo FSRS por pregunta. Un fallo
  acorta mucho el intervalo; los aciertos seguidos lo alargan (≈1,5 → 3 → 7 → 14 →
  27 días…). El repaso inteligente prioriza lo que está a punto de olvidarse y los
  temas con peor dominio; el test de parcial reparte las preguntas según el peso de
  cada tema. El dominio de cada tema se recalcula al terminar cada test.
- Sin migraciones nuevas: usa las tablas `attempts`, `attempt_items`,
  `question_progress` y `topic_progress` de la Fase 1.

### Fase 6: qué incluye

- **Simulacro de examen** (`/simulacro`, también desde Tests y desde cada parcial):
  asignatura, parcial a simular (copia sus temas, pesos y duración), temas con
  ponderación, número de preguntas, duración, dificultad, tipos de ejercicio,
  procedencia, penalización por fallo y si se permite volver atrás.
- **Examen oficial como examen real**: en la ficha de cada examen, «Hacer este
  examen» con sus preguntas, su orden, sus puntos, su duración y su penalización.
- **Durante el examen**: cronómetro siempre visible (se entrega solo al acabarse el
  tiempo), progreso, marcar preguntas y ninguna solución. Las respuestas se guardan
  al cambiar de pregunta y se pueden cambiar hasta entregar; sobreviven a recargar.
  El servidor rechaza respuestas fuera de tiempo.
- **Al entregar**: nota sobre 10 y en puntos, aciertos, errores, sin responder, puntos
  perdidos por penalización, nota por tema, tiempo usado, recomendaciones de estudio
  y cada pregunta con tu respuesta, la solución y la explicación. Las de desarrollo
  se autoevalúan después (Mal / Regular / Bien) y la nota se recalcula.
- Cada intento se guarda en el historial de Tests y alimenta el repaso espaciado.
- Sin migraciones nuevas.

### Fase 7: qué incluye

- **Planificador automático** (`src/domain/scheduler`, función pura con tests): reparte
  el temario de cada examen pendiente (con fecha y temas) en los días disponibles,
  según tus horas por día y los días sin estudio de Ajustes. Pondera días restantes,
  peso del tema en el parcial, importancia, dificultad, horas estimadas, lo ya
  estudiado, el dominio en tests y lo que no has entendido.
- **Repaso espaciado en el plan**: un tema estudiado se repasa al día siguiente y luego
  con intervalos crecientes (con test si hay preguntas). Simulacro dos días antes de
  cada examen y repaso general la víspera.
- **Plan dinámico**: se recalcula al abrir Hoy o el Plan y al cerrar cada sesión (solo
  escribe si algo cambia). Lo no hecho o saltado se reparte en los días siguientes; si
  mejoras en un tema baja su prioridad; si fallas, sube. Avisa si no da tiempo.
- **HOY** (pantalla principal): tareas del día por asignatura y tema (teoría, ejercicios,
  práctica), repasos y simulacros, total del día y botón **EMPEZAR SESIÓN**.
- **Sesiones** (`/sesion/[id]`): qué hacer, material del tema, cronómetro (se recuerda al
  recargar) y cierre con ¿lo has completado?, dificultad percibida (de muy fácil a muy
  difícil) y «No he entendido bien este tema». Eso ajusta el avance del tema, su
  prioridad y trae un repaso al día siguiente si hace falta.
- **Plan** (`/plan`): los próximos días con lo planificado frente al tiempo disponible,
  días de examen, temario visto por parcial, saltar tareas y recalcular.
- Sin migraciones nuevas: usa `plan_tasks`, `study_sessions` y `topic_progress`.

### Fase 8: qué incluye

- **Estadísticas** (`/estadisticas`): horas de esta semana y en total, tests hechos,
  nota media con su tendencia (últimos 5 frente a los 5 anteriores) y % de aciertos.
- **Preparación estimada** de cada examen pendiente (p. ej. «CPA Parcial 1: 72 %»).
  No depende solo del tiempo: combina dominio en tests (40 %), nota de los últimos
  simulacros o exámenes (25 %), temario estudiado (20 %) y repasos al día (15 %),
  ponderado por el peso de cada tema en el parcial. Si un componente no tiene datos,
  su peso se reparte entre los demás. Se ve el desglose y los días que faltan.
- **Gráficas** en SVG propio (sin librerías, ligeras en el móvil): horas por día de las
  últimas 4 semanas y evolución de las notas (simulacros con punto relleno).
- **Progreso por asignatura y por tema**: temario visto, dominio, horas y aciertos.
- **Temas fuertes y débiles** (≥ 70 % y < 50 % de dominio con al menos 3 respuestas);
  los débiles enlazan a un test de ese tema.
- Cálculos en `src/domain/stats` (funciones puras con tests) y `src/server/stats.ts`.

### Fase 9: qué incluye

- **Proveedores de IA** sin SDK (`src/ai/providers`): Claude (API de Messages) y OpenAI o
  cualquier API compatible (Gemini, Groq, OpenRouter, Ollama…) con `AI_BASE_URL`. Sin IA
  configurada todo sigue funcionando y los botones de IA no aparecen.
- **Ahorro**: cada respuesta se guarda en `ai_cache` por hash (proveedor + modelo + versión
  del prompt + entrada), así repetir algo no cuesta nada; tope diario de tokens
  (`AI_DAILY_TOKEN_LIMIT`, 300 000 por defecto) y consumo de hoy y del mes en Ajustes.
- **Prompts versionados** en `src/ai/prompts` (funciones puras con tests).
- **Generar preguntas** (`/preguntas/generar`) a partir de un documento, un tema o la
  asignatura. La IA responde en el formato de importación JSON y se valida con el mismo
  código. Siempre entran como «Generada por IA» y «Por revisar» (nunca como oficiales) y no
  salen en los tests hasta que las apruebes; se pueden aprobar en bloque.
- **Explícame el fallo** en los resultados de un test: explica el error con tus apuntes.
- **Analizar documento**: resumen, conceptos clave y temas propuestos (se guardan en el
  documento y se pueden asignar con un botón).
- **Asistente** (`/asistente`): busca en tus documentos con la búsqueda de texto de Postgres,
  responde citando la fuente ([1] enlaza al fragmento exacto) y, si preguntas por tu plan, tus
  temas flojos o tus fallos, usa tus datos de estudio. Las preguntas del banco que cita llevan
  su procedencia. Las conversaciones se guardan.
- **OCR gratis** en el navegador (tesseract.js, español) para PDFs escaneados e imágenes:
  «Reconocer texto (OCR)» en la ficha del documento. El motor se sirve desde `public/ocr`
  (lo copia `npm install`), sin CDN.
- Sin migraciones nuevas. Decisión: **sin embeddings** por ahora. Claude no tiene API de
  embeddings y la búsqueda de texto completo (con tildes y raíces en español) funciona bien
  con apuntes. Se puede añadir pgvector más adelante si hace falta.
- Tests e2e con una IA simulada compatible con OpenAI (`tests/e2e/fake-ai.mjs`).

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
`.env.local`, nunca en el código. Opciones (la IA es opcional):

| Proveedor | Variables |
|---|---|
| Claude | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` (modelo por defecto `claude-haiku-5-5`) |
| OpenAI | `AI_PROVIDER=openai`, `OPENAI_API_KEY` (modelo por defecto `gpt-5-mini`) |
| Gemini (tiene capa gratuita) | `AI_PROVIDER=openai`, `OPENAI_API_KEY` = clave de Google AI Studio, `AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`, `AI_MODEL=gemini-2.5-flash` |

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm run check` | Tipos + lint + tests |
| `npm test` | Tests (Vitest) |
| `npm run test:e2e` | Tests de extremo a extremo (Playwright) contra Supabase local |
| `npm run stack:local` | Supabase local mínimo sin Docker Hub (Postgres + PostgREST + auth simulada) |
| `npm run db:push` | Aplica las migraciones al proyecto enlazado |
| `npm run db:types` | Regenera `src/types/database.ts` desde Supabase |

## Estructura

```
src/
  app/            rutas (App Router): (auth)/login, auth/confirm, (app)/hoy, ...
  components/     UI reutilizable (layout/)
  domain/         lógica de negocio pura y tipos (academic, documents, questions, ...)
  documents/      lectura de PDF/DOCX/PPTX/TXT y troceado del texto (sin dependencias de Next)
  server/         acceso a datos en servidor (auth, perfil, repositorios)
  ai/             AIProvider, registro de proveedores, JSON validado, caché
  lib/            Supabase (cliente/servidor/sesión), env, rutas, fechas
  proxy.ts        refresco de sesión y protección de rutas
supabase/migrations/   SQL versionado
tests/db/              tests de migraciones y RLS (PGlite)
tests/e2e/             tests de extremo a extremo (Playwright, móvil)
scripts/local-stack/   Supabase local mínimo para los tests e2e
docs/DISENO.md         documento de diseño
```

Reglas de arquitectura: `domain/` no importa Next, Supabase ni IA; solo `server/` y
`lib/supabase` hablan con la base de datos; las claves solo existen en el servidor.

## Tests de extremo a extremo

Necesitan un Supabase local. Lo normal es `npx supabase start`; si Docker Hub no está
disponible, `npm run stack:local` levanta una imitación mínima (Postgres 16 local,
PostgREST en Docker y una pasarela en Node que imita autenticación y Storage; solo para tests).

```bash
npm run stack:local
E2E_SUPABASE_KEY=cualquiera npm run test:e2e
```
