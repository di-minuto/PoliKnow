# App de Estudio — Propuesta de diseño

> Documento de diseño previo a la Fase 1. Fecha: 8 de octubre de 2026.
> Estado: Fase 1 implementada sobre este diseño (ver `README.md`).

## 1. Análisis de las especificaciones

Lo que pides no es una app de tests sino un **sistema de preparación de exámenes** con cuatro bloques que se alimentan entre sí:

1. **Contenido**: jerarquía académica + biblioteca de documentos + banco de preguntas.
2. **Práctica**: generador de tests, simulador de exámenes, exámenes oficiales reproducibles.
3. **Planificación**: planificador adaptativo + repaso espaciado + pantalla HOY + sesiones de estudio.
4. **Inteligencia**: estadísticas, estimación de preparación, asistente con IA sobre tus documentos.

El punto clave de la arquitectura es que **los bloques 2 y 3 producen datos (intentos, sesiones, dificultad percibida) que retroalimentan al planificador**. Por eso toda la lógica de negocio (repaso espaciado, planificador, motor de exámenes, estadísticas) se escribe como **TypeScript puro y testeable**, sin depender de React, de Supabase ni de la IA.

Requisitos transversales que condicionan el diseño:

- Nada hardcodeado: asignaturas, parciales, temas, tipos de documento y tipos de pregunta son **datos**, no código.
- La procedencia de cada pregunta (`source_type`) es obligatoria y visible siempre.
- La app funciona **sin IA**: la IA solo añade generación, explicación y asistente.
- Coste ~0 €: planes gratuitos de Supabase y Vercel, y llamadas a IA cacheadas.

## 2. Arquitectura final

Mantengo el stack que propones. No veo una alternativa claramente mejor para tu caso:

| Capa | Tecnología | Comentario |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript | Server Components para leer datos, Server Actions para escribir. |
| UI | Tailwind CSS | Mobile-first; componentes propios ligeros. |
| BD | Supabase PostgreSQL | RLS en todas las tablas; búsqueda con `tsvector` (español). |
| Auth | Supabase Auth (email + contraseña) | Sesión por cookies con `@supabase/ssr`. |
| Archivos | Supabase Storage (bucket privado) | Subida **directa desde el navegador** (ver problema 1). |
| Hosting | Vercel (Hobby) | Gratis para uso personal. |
| PWA | `app/manifest.ts` + service worker | Instalable desde la Fase 1; offline real en Fase 10. |

Añadidos que propongo (no sustituyen nada):

- **zod**: validación de variables de entorno, formularios y del JSON de cada tipo de pregunta.
- **Vitest**: tests unitarios de la lógica de dominio. **PGlite** (Postgres en WASM) para probar las migraciones y las políticas RLS sin Docker.
- **Extracción de texto en el navegador** (`pdfjs-dist`, `mammoth` para DOCX, lectura XML para PPTX): evita los límites de las funciones serverless y no cuesta nada.
- **pgvector** (incluido en Supabase) para búsqueda semántica del asistente, en la Fase 9.
- **Recharts** para el dashboard (Fase 8).
- **Algoritmo de repaso**: FSRS simplificado (o la librería `ts-fsrs`), que es lo que usa Anki hoy.

### Capas del código

```
UI (app/, components/)         → solo presentación, sin reglas de negocio
   │
Server Actions / Route Handlers → orquestan: validan, llaman a dominio y repositorios
   │
   ├── domain/   lógica pura: academic, questions, srs, scheduler, exam-engine, stats
   ├── server/   repositorios (acceso a Supabase), único sitio que habla con la BD
   ├── ai/       AIProvider + proveedores + caché; nunca llamado desde el cliente
   └── documents/ extracción de texto y troceado (chunking)
```

Reglas:

- `domain/` no importa nada de Next, Supabase ni IA. Recibe datos y devuelve decisiones. Así el planificador o la nota de un examen se prueban con tests unitarios.
- Las claves (IA, `service_role`) solo existen en el servidor. `src/lib/env.ts` valida las variables al arrancar.
- La IA se usa a través de `getAIProvider()`. Si `AI_PROVIDER=none` devuelve un proveedor desactivado y la app degrada con elegancia (botones de IA ocultos, todo lo demás funciona).

### Capa de IA

```ts
interface AIProvider {
  readonly name: string;           // 'anthropic' | 'openai' | 'none' | ...
  readonly enabled: boolean;
  complete(req: AICompletionRequest): Promise<AICompletionResult>;
  completeJSON<T>(req: AICompletionRequest, schema: ZodType<T>): Promise<T>;
  embed?(texts: string[]): Promise<number[][]>;   // opcional
}
```

- Cada uso (generar preguntas, explicar fallo, clasificar tema...) es una **tarea** con su prompt versionado en `src/ai/prompts/`.
- **Caché**: `hash(proveedor + modelo + versión del prompt + entrada)` → tabla `ai_cache`. Antes de llamar se consulta la caché; las preguntas generadas se guardan en el banco y nunca se regeneran.
- Las preguntas generadas entran con `source_type = 'ai_generated'` y `review_status = 'draft'` hasta que las revises.

## 3. Esquema de base de datos

Todas las tablas tienen `id uuid`, `user_id` (dueño, con RLS `user_id = auth.uid()`), `created_at` y `updated_at`. Aunque la app es personal, esto sale gratis y protege tus datos aunque alguien encuentre la URL.

### Catálogos ampliables (sin tocar código)

| Tabla | Contenido inicial |
|---|---|
| `assessment_types` | parcial, final, examen de prácticas, práctica, otro |
| `document_types` | teoría, apuntes, ejercicios, soluciones, práctica, examen oficial, examen antiguo, material adicional |
| `question_types` | test, verdadero/falso, respuesta corta, numérico, programación, completar código, encontrar errores, teórica, problema desarrollado |

Filas con `user_id = NULL` son del sistema; puedes añadir las tuyas. Cada tipo de pregunta indica si es **autocorregible** (`auto_gradable`).

### Jerarquía académica

```
courses            curso académico (2026-27)
└─ subjects        asignatura (CPA, TSR): color, dificultad percibida, importancia
   ├─ topics       tema / práctica (parent_id permite subtemas)
   └─ assessments  evaluación: parcial, final, examen de prácticas (fecha, duración, importancia)
      └─ assessment_topics   qué temas entran y con qué peso
```

**Decisión importante:** los temas cuelgan de la **asignatura**, no del parcial, y se asocian a evaluaciones mediante `assessment_topics`. Así el "Tema 2" de CPA es el mismo objeto en el Parcial 1 y en el examen final, y su historial de aciertos no se duplica. El "parcial" de una pregunta se obtiene a través de su tema.

### Documentos

| Tabla | Campos principales |
|---|---|
| `documents` | asignatura, `document_type`, título, ruta en Storage, mime, tamaño, `sha256` (evita duplicados), año, convocatoria, estado de extracción |
| `document_topics` | documento ↔ temas (un PDF puede cubrir varios temas) |
| `document_assessments` | documento ↔ evaluaciones |
| `document_chunks` | texto extraído por fragmentos con página; `tsvector` para búsqueda; embedding en Fase 9 |

### Exámenes oficiales y banco de preguntas

| Tabla | Campos principales |
|---|---|
| `official_exams` | asignatura, evaluación, documento del enunciado, documento de soluciones, año, convocatoria, fecha, duración, puntuación total, reglas de penalización, instrucciones |
| `questions` | asignatura, tema, subtópico, `question_type`, **`source_type`** (`official_exam`, `course_material`, `ai_generated`, `manual`), enunciado, `content` (JSON: opciones, código...), `answer` (JSON), explicación, dificultad 1–5, documento origen y referencia (p. ej. "pág. 12, ej. 3"), `official_exam_id` + posición + puntos, `original_text` literal, `review_status`, `variant_of` (pregunta "parecida a"), etiquetas |

Restricción en BD: `source_type = 'official_exam'` ⇔ `official_exam_id` no nulo. Es imposible guardar una pregunta oficial sin examen, o colar una de IA como oficial.

Un examen oficial se reproduce **exactamente** leyendo sus preguntas por `official_position`, con su duración, puntos y penalización originales.

### Progreso, intentos y repaso espaciado

| Tabla | Para qué |
|---|---|
| `question_progress` | por pregunta: veces respondida / acertada / fallada, última fecha, último resultado y estado de repaso espaciado (`due_at`, estabilidad, dificultad, repeticiones, olvidos) |
| `topic_progress` | por tema: dominio (0–1), cobertura de teoría (0–1), último estudio, próximo repaso, "no lo he entendido", ajuste manual de prioridad |
| `attempts` | cada test o examen: modo (rápido, fallos, inteligente, tema, parcial, simulacro, oficial), configuración JSON, tiempos, nota, estado |
| `attempt_items` | cada pregunta del intento: respuesta, correcta o no, puntos, marcada, tiempo, cómo se corrigió (auto, autoevaluación, IA) |

Los contadores ("veces respondida"...) viven en `question_progress` y no en `questions`, para separar **contenido** de **progreso**: puedes reiniciar tu progreso, o exportar el banco sin tus resultados.

### Planificación y sesiones

| Tabla | Para qué |
|---|---|
| `availability_rules` | minutos disponibles por día de la semana |
| `blocked_days` | días sin estudio |
| `plan_tasks` | tareas por día: asignatura, evaluación, tema, tipo (teoría, ejercicios, repaso, test, práctica, simulacro), minutos, prioridad, estado (pendiente, hecha, parcial, saltada, reprogramada), origen (auto/manual) |
| `study_sessions` | sesión real: tarea, cronómetro, completada, dificultad percibida 1–5, "no he entendido bien este tema", notas |

### IA y asistente

| Tabla | Para qué |
|---|---|
| `ai_cache` | respuestas cacheadas por hash, con tokens consumidos (control de coste) |
| `assistant_conversations` / `assistant_messages` | historial del asistente con citas a documentos |

El SQL completo está en `supabase/migrations/`.

## 4. Lógica de los módulos clave (resumen)

- **Repaso espaciado** (`domain/srs`): FSRS simplificado por pregunta. Fallo → vuelve pronto; aciertos seguidos → intervalo creciente. A nivel de tema se agrega en un **dominio** que mezcla aciertos recientes, retención estimada y tiempo sin repasar.
- **Planificador** (`domain/scheduler`): función pura `plan(estado, hoy) → tareas`. Calcula, para cada evaluación, el trabajo pendiente (temas no cubiertos + repasos vencidos + simulacros finales) y lo reparte en los días disponibles hasta el examen, ponderando por urgencia (días restantes), importancia, dificultad y debilidad del tema. Se **recalcula cada día** (y al cerrar una sesión): lo no hecho vuelve al saco y se redistribuye. No se reescriben tareas pasadas ni las manuales.
- **Motor de exámenes** (`domain/exam-engine`): selecciona preguntas según configuración (temas, pesos, dificultad, tipos), corrige, aplica penalización y calcula nota global y por tema. Las preguntas abiertas se corrigen por autoevaluación con la solución delante (o con IA si está activa).
- **Preparación estimada** (`domain/stats`): media ponderada por peso de tema de `0,40·dominio en tests + 0,25·simulacros/exámenes + 0,20·cobertura del temario + 0,15·repasos al día`, con penalización por tiempo sin repasar. Se muestra junto a sus componentes para que sea explicable.

## 5. Estructura de carpetas

```
app-estudio/
├─ src/
│  ├─ app/                       rutas (App Router)
│  │  ├─ (auth)/login/           acceso
│  │  ├─ auth/callback/          confirmación de email
│  │  ├─ (app)/                  zona privada con navegación
│  │  │  ├─ hoy/                 pantalla principal
│  │  │  ├─ asignaturas/         jerarquía académica (F2)
│  │  │  ├─ biblioteca/          documentos (F3)
│  │  │  ├─ preguntas/           banco (F4)
│  │  │  ├─ tests/  examenes/    práctica (F5–F6)
│  │  │  ├─ plan/                planificador (F7)
│  │  │  ├─ estadisticas/        dashboard (F8)
│  │  │  ├─ asistente/  buscar/  IA y búsqueda (F9)
│  │  │  └─ ajustes/             perfil, disponibilidad, exportar (F11)
│  │  └─ manifest.ts             PWA
│  ├─ components/                UI reutilizable (layout/, ui/)
│  ├─ domain/                    lógica pura + tipos
│  │  ├─ academic/ questions/ srs/ scheduler/ exam-engine/ stats/
│  ├─ server/                    repositorios y acciones de servidor
│  ├─ ai/                        AIProvider, proveedores, caché, prompts
│  ├─ documents/                 extracción y troceado de documentos
│  ├─ lib/                       supabase (cliente/servidor/sesión), env, utilidades
│  └─ types/                     tipos generados de la BD
├─ supabase/
│  ├─ migrations/                SQL versionado
│  └─ seed.sql
├─ tests/                        tests de migraciones / integración
├─ public/                       iconos PWA, service worker
└─ README.md
```

## 6. Problemas y riesgos detectados

1. **Tamaño de subida en Vercel (4,5 MB por petición).** Muchos PDFs y PPTX lo superan. Solución: el navegador sube el archivo **directamente a Supabase Storage**; el servidor nunca lo recibe. Límite del plan gratuito de Supabase: 50 MB por archivo y 1 GB en total. Si tu material supera 1 GB habrá que comprimir PDFs o pasar a un plan de pago.
2. **Supabase gratis se pausa tras 7 días sin actividad.** Mientras estudies no pasará; en vacaciones sí. Se reactiva desde el panel sin perder datos. Puedo añadir una tarea programada que lo mantenga despierto.
3. **Extraer preguntas de exámenes oficiales automáticamente no es fiable.** Enunciados con figuras, código o tablas, PDFs escaneados... Propongo un flujo de **importación con revisión**: la IA (o tú a mano) propone las preguntas, tú las validas, y el PDF original siempre queda enlazado con su página para verlo tal cual.
4. **PDFs escaneados** no tienen texto: necesitan OCR (`tesseract.js` en el navegador, gratis pero lento, o IA con visión, que cuesta tokens). Lo trato en la Fase 9.
5. **Corrección de preguntas abiertas** (programación, problemas desarrollados) no se puede automatizar con fiabilidad. Propongo autoevaluación guiada con la solución y rúbrica, y corrección con IA opcional y marcada como tal.
6. **"Parcial" de una pregunta**: si el parcial se guardara en la pregunta, el examen final duplicaría todo. Por eso se deriva del tema (ver sección 3).
7. **Embeddings**: Claude no ofrece API de embeddings. Opciones para la búsqueda semántica: OpenAI `text-embedding-3-small` (céntimos para todo tu temario) o un modelo local en el navegador (gratis, más lento). La búsqueda por palabras clave con Postgres funciona desde la Fase 3 sin IA.
8. **Orden de fases**: hasta la Fase 9 no hay IA, así que el banco de preguntas de las Fases 4–8 se llenará a mano o importando JSON. Propongo adelantar a la Fase 3 la extracción de texto (sin IA) para que la búsqueda y el asistente tengan material desde el principio.
9. **Offline en el móvil**: instalar la PWA es fácil; hacer tests sin conexión y sincronizar después es bastante más complejo. En la Fase 10 propongo offline para la biblioteca ya abierta y los tests ya generados, con sincronización al volver la red. iOS limita el almacenamiento y la sincronización en segundo plano.
10. **Zona horaria**: el plan es por días; todas las fechas se calculan en tu zona (`Europe/Madrid` por defecto, configurable).
11. **Derechos del material**: el bucket es privado y solo accesible con tu sesión. No hay enlaces públicos a tus documentos.
12. **Tiempo de las funciones en Vercel**: generar muchas preguntas con IA puede tardar. Se hará por lotes pequeños y con *streaming*, no en una sola llamada gigante.

## 7. Plan de fases (con los ajustes propuestos)

| Fase | Contenido |
|---|---|
| 1 | Arquitectura, proyecto, migraciones completas, autenticación, esqueleto de navegación, capa IA (interfaz + modo desactivado), tests |
| 2 | CRUD de cursos, asignaturas, evaluaciones, temas; disponibilidad y fechas de examen |
| 3 | Biblioteca: subida directa a Storage, metadatos, visor, **extracción de texto y búsqueda básica** |
| 4 | Banco de preguntas: editor por tipo, importación JSON, exámenes oficiales |
| 5 | Tests y modos automáticos + repaso espaciado |
| 6 | Simulador de exámenes y examen oficial reproducible |
| 7 | Planificador + pantalla HOY + sesiones |
| 8 | Dashboard y preparación estimada |
| 9 | IA: proveedores, generación, explicación, asistente con citas, OCR, embeddings |
| 10 | PWA completa y offline |
| 11 | Exportar/importar JSON, mejoras |
