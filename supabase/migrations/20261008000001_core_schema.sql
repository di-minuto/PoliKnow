-- =====================================================================
-- App de Estudio — esquema principal
-- Todas las tablas de usuario llevan user_id + RLS (user_id = auth.uid()).
-- Los catálogos (tipos) admiten filas de sistema (user_id NULL) y del usuario.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Perfil
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone     text not null default 'Europe/Madrid',
  settings     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Catálogos ampliables
-- ---------------------------------------------------------------------
create table public.assessment_types (
  code       text primary key,
  label      text not null,
  user_id    uuid references auth.users (id) on delete cascade,
  position   int not null default 0,
  created_at timestamptz not null default now()
);

create table public.document_types (
  code       text primary key,
  label      text not null,
  -- true si los documentos de este tipo son exámenes (oficiales o antiguos)
  is_exam    boolean not null default false,
  user_id    uuid references auth.users (id) on delete cascade,
  position   int not null default 0,
  created_at timestamptz not null default now()
);

create table public.question_types (
  code          text primary key,
  label         text not null,
  -- si la app puede corregirla sola (test, V/F, numérico...)
  auto_gradable boolean not null default false,
  user_id       uuid references auth.users (id) on delete cascade,
  position      int not null default 0,
  created_at    timestamptz not null default now()
);

insert into public.assessment_types (code, label, position) values
  ('partial',  'Parcial', 1),
  ('final',    'Examen final', 2),
  ('lab_exam', 'Examen de prácticas', 3),
  ('practice', 'Práctica', 4),
  ('other',    'Otro', 99);

insert into public.document_types (code, label, is_exam, position) values
  ('theory',        'Teoría', false, 1),
  ('notes',         'Apuntes', false, 2),
  ('exercises',     'Ejercicios', false, 3),
  ('solutions',     'Soluciones', false, 4),
  ('practice',      'Práctica', false, 5),
  ('official_exam', 'Examen oficial', true, 6),
  ('past_exam',     'Examen antiguo', true, 7),
  ('additional',    'Material adicional', false, 8);

insert into public.question_types (code, label, auto_gradable, position) values
  ('multiple_choice', 'Tipo test', true, 1),
  ('true_false',      'Verdadero / falso', true, 2),
  ('short_answer',    'Respuesta corta', false, 3),
  ('numeric',         'Ejercicio numérico', true, 4),
  ('programming',     'Ejercicio de programación', false, 5),
  ('code_completion', 'Completar código', false, 6),
  ('find_errors',     'Encontrar errores', false, 7),
  ('theory',          'Pregunta teórica', false, 8),
  ('long_problem',    'Problema desarrollado', false, 9);

-- ---------------------------------------------------------------------
-- Jerarquía académica
-- ---------------------------------------------------------------------
create table public.courses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null,
  academic_year text,
  start_date    date,
  end_date      date,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.subjects (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id            uuid not null references public.courses (id) on delete cascade,
  name                 text not null,
  code                 text,
  color                text not null default '#6366f1',
  perceived_difficulty smallint not null default 3 check (perceived_difficulty between 1 and 5),
  importance           smallint not null default 3 check (importance between 1 and 5),
  position             int not null default 0,
  archived             boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.topics (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id      uuid not null references public.subjects (id) on delete cascade,
  parent_id       uuid references public.topics (id) on delete cascade,
  name            text not null,
  description     text,
  -- 'theory' (tema) | 'lab' (práctica) | 'other'
  kind            text not null default 'theory' check (kind in ('theory', 'lab', 'other')),
  estimated_hours numeric(5, 1),
  position        int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.assessments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id           uuid not null references public.subjects (id) on delete cascade,
  assessment_type      text not null default 'partial' references public.assessment_types (code),
  name                 text not null,
  exam_at              timestamptz,
  duration_minutes     int check (duration_minutes > 0),
  importance           smallint not null default 3 check (importance between 1 and 5),
  perceived_difficulty smallint check (perceived_difficulty between 1 and 5),
  grade_weight         numeric(5, 2),
  status               text not null default 'upcoming' check (status in ('upcoming', 'done', 'cancelled')),
  final_grade          numeric(5, 2),
  position             int not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Qué temas entran en cada evaluación y con qué peso
create table public.assessment_topics (
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  topic_id      uuid not null references public.topics (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  weight        numeric(6, 3) not null default 1 check (weight >= 0),
  primary key (assessment_id, topic_id)
);

-- ---------------------------------------------------------------------
-- Biblioteca de documentos
-- ---------------------------------------------------------------------
create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id        uuid not null references public.subjects (id) on delete cascade,
  document_type     text not null references public.document_types (code),
  title             text not null,
  storage_path      text not null unique,
  original_filename text,
  mime_type         text,
  size_bytes        bigint,
  sha256            text,
  page_count        int,
  year              int,
  -- convocatoria (p. ej. "enero", "junio", "recuperación")
  exam_session      text,
  language          text default 'es',
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'processing', 'done', 'failed', 'not_applicable')),
  extracted_at      timestamptz,
  notes             text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, sha256)
);

create table public.document_topics (
  document_id uuid not null references public.documents (id) on delete cascade,
  topic_id    uuid not null references public.topics (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (document_id, topic_id)
);

create table public.document_assessments (
  document_id   uuid not null references public.documents (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (document_id, assessment_id)
);

-- Texto extraído, troceado para búsqueda y para el asistente.
-- (La columna de embedding se añade en la Fase 9 con pgvector.)
create table public.document_chunks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  chunk_index int not null,
  page_from   int,
  page_to     int,
  heading     text,
  content     text not null,
  tsv         tsvector generated always as (
                setweight(to_tsvector('spanish', coalesce(heading, '')), 'A') ||
                setweight(to_tsvector('spanish', content), 'B')
              ) stored,
  created_at  timestamptz not null default now(),
  unique (document_id, chunk_index)
);

-- ---------------------------------------------------------------------
-- Exámenes oficiales
-- ---------------------------------------------------------------------
create table public.official_exams (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id           uuid not null references public.subjects (id) on delete cascade,
  assessment_id        uuid references public.assessments (id) on delete set null,
  document_id          uuid references public.documents (id) on delete set null,
  solution_document_id uuid references public.documents (id) on delete set null,
  title                text not null,
  year                 int,
  exam_session         text,
  exam_date            date,
  duration_minutes     int check (duration_minutes > 0),
  total_points         numeric(6, 2),
  -- p. ej. {"wrong_answer_penalty": 0.33, "allow_back": true}
  rules                jsonb not null default '{}'::jsonb,
  instructions         text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Banco de preguntas
-- ---------------------------------------------------------------------
create table public.questions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id        uuid not null references public.subjects (id) on delete cascade,
  topic_id          uuid references public.topics (id) on delete set null,
  subtopic          text,
  question_type     text not null references public.question_types (code),
  source_type       text not null
    check (source_type in ('official_exam', 'course_material', 'ai_generated', 'manual')),
  -- enunciado (markdown)
  stem              text not null,
  -- datos específicos del tipo: opciones, código base, tolerancia numérica...
  content           jsonb not null default '{}'::jsonb,
  -- respuesta correcta (formato según tipo)
  answer            jsonb,
  explanation       text,
  difficulty        smallint not null default 3 check (difficulty between 1 and 5),
  document_id       uuid references public.documents (id) on delete set null,
  -- dónde está en el documento: "pág. 12, ejercicio 3"
  source_ref        text,
  official_exam_id  uuid references public.official_exams (id) on delete cascade,
  official_position int,
  points            numeric(6, 2),
  -- texto literal original (exámenes oficiales)
  original_text     text,
  review_status     text not null default 'approved' check (review_status in ('draft', 'approved', 'rejected')),
  ai_model          text,
  -- "pregunta parecida a" (variantes generadas)
  variant_of        uuid references public.questions (id) on delete set null,
  tags              text[] not null default '{}',
  archived          boolean not null default false,
  tsv               tsvector generated always as (
                      setweight(to_tsvector('spanish', stem), 'A') ||
                      setweight(to_tsvector('spanish', coalesce(subtopic, '')), 'B') ||
                      setweight(to_tsvector('spanish', coalesce(explanation, '')), 'C')
                    ) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Una pregunta oficial siempre pertenece a un examen oficial, y viceversa.
  constraint questions_official_consistency check (
    (source_type = 'official_exam') = (official_exam_id is not null)
  ),
  -- Las preguntas de IA nunca se marcan como oficiales ni carecen de modelo.
  constraint questions_ai_model check (
    source_type <> 'ai_generated' or ai_model is not null
  )
);

-- ---------------------------------------------------------------------
-- Progreso y repaso espaciado
-- ---------------------------------------------------------------------
create table public.question_progress (
  question_id      uuid not null references public.questions (id) on delete cascade,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  times_answered   int not null default 0,
  times_correct    int not null default 0,
  times_incorrect  int not null default 0,
  last_answered_at timestamptz,
  last_result      text check (last_result in ('correct', 'incorrect', 'partial', 'skipped')),
  -- estado de repaso espaciado (FSRS simplificado)
  srs_state        text not null default 'new' check (srs_state in ('new', 'learning', 'review', 'relearning')),
  due_at           timestamptz,
  stability        double precision,
  srs_difficulty   double precision,
  reps             int not null default 0,
  lapses           int not null default 0,
  updated_at       timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table public.topic_progress (
  topic_id              uuid not null references public.topics (id) on delete cascade,
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 0..1: dominio estimado a partir de tests y repasos
  mastery               double precision not null default 0 check (mastery between 0 and 1),
  -- 0..1: parte de la teoría ya estudiada
  coverage              double precision not null default 0 check (coverage between 0 and 1),
  last_studied_at       timestamptz,
  last_reviewed_at      timestamptz,
  next_review_at        timestamptz,
  not_understood_count  int not null default 0,
  -- ajuste manual o automático de prioridad (-1..+1)
  priority_adjustment   double precision not null default 0,
  updated_at            timestamptz not null default now(),
  primary key (user_id, topic_id)
);

-- ---------------------------------------------------------------------
-- Tests, simulacros y exámenes: intentos
-- ---------------------------------------------------------------------
create table public.attempts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mode               text not null check (mode in (
                       'quick', 'failed_review', 'smart_review', 'topic', 'assessment',
                       'custom', 'exam_simulation', 'official_exam')),
  subject_id         uuid references public.subjects (id) on delete set null,
  assessment_id      uuid references public.assessments (id) on delete set null,
  official_exam_id   uuid references public.official_exams (id) on delete set null,
  -- configuración completa usada para generarlo (temas, pesos, penalización...)
  config             jsonb not null default '{}'::jsonb,
  status             text not null default 'in_progress' check (status in ('in_progress', 'finished', 'abandoned')),
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  time_limit_seconds int,
  time_used_seconds  int,
  score              numeric(7, 3),
  max_score          numeric(7, 3),
  -- nota normalizada sobre 10
  grade              numeric(5, 2),
  summary            jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.attempt_items (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  attempt_id         uuid not null references public.attempts (id) on delete cascade,
  question_id        uuid not null references public.questions (id) on delete cascade,
  position           int not null,
  points             numeric(6, 2) not null default 1,
  user_answer        jsonb,
  is_correct         boolean,
  score              numeric(6, 3),
  flagged            boolean not null default false,
  answered_at        timestamptz,
  time_spent_seconds int,
  grading_method     text check (grading_method in ('auto', 'self', 'ai')),
  created_at         timestamptz not null default now(),
  unique (attempt_id, position)
);

-- ---------------------------------------------------------------------
-- Planificación
-- ---------------------------------------------------------------------
create table public.availability_rules (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 0 = domingo ... 6 = sábado
  weekday    smallint not null check (weekday between 0 and 6),
  minutes    int not null check (minutes between 0 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, weekday)
);

create table public.blocked_days (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  reason     text,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

create table public.plan_tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day             date not null,
  subject_id      uuid not null references public.subjects (id) on delete cascade,
  assessment_id   uuid references public.assessments (id) on delete set null,
  topic_id        uuid references public.topics (id) on delete set null,
  task_type       text not null check (task_type in (
                    'theory', 'exercises', 'review', 'test', 'practice', 'exam_simulation')),
  planned_minutes int not null check (planned_minutes > 0),
  question_count  int,
  priority        double precision not null default 0,
  status          text not null default 'pending' check (status in (
                    'pending', 'in_progress', 'done', 'partial', 'skipped', 'rescheduled')),
  origin          text not null default 'auto' check (origin in ('auto', 'manual')),
  position        int not null default 0,
  -- tarea de la que procede si se ha reprogramado
  rescheduled_from uuid references public.plan_tasks (id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.study_sessions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_task_id         uuid references public.plan_tasks (id) on delete set null,
  subject_id           uuid references public.subjects (id) on delete set null,
  topic_id             uuid references public.topics (id) on delete set null,
  started_at           timestamptz not null default now(),
  ended_at             timestamptz,
  duration_seconds     int check (duration_seconds >= 0),
  completed            boolean,
  -- 1 muy fácil ... 5 muy difícil
  perceived_difficulty smallint check (perceived_difficulty between 1 and 5),
  not_understood       boolean not null default false,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- IA: caché y asistente
-- ---------------------------------------------------------------------
create table public.ai_cache (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cache_key     text not null,
  task          text not null,
  provider      text not null,
  model         text not null,
  prompt_version text not null default '1',
  request       jsonb,
  response      jsonb not null,
  input_tokens  int,
  output_tokens int,
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (user_id, cache_key)
);

create table public.assistant_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assistant_messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.assistant_conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  -- [{document_id, chunk_id, page, quote}]
  citations       jsonb not null default '[]'::jsonb,
  provider        text,
  model           text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------
create index on public.subjects (user_id, course_id);
create index on public.topics (subject_id, position);
create index on public.topics (parent_id);
create index on public.assessments (subject_id);
create index on public.assessments (user_id, exam_at);
create index on public.assessment_topics (topic_id);
create index on public.documents (subject_id, document_type);
create index on public.document_topics (topic_id);
create index on public.document_assessments (assessment_id);
create index on public.document_chunks (document_id);
create index document_chunks_tsv_idx on public.document_chunks using gin (tsv);
create index on public.official_exams (subject_id);
create index on public.questions (subject_id, topic_id);
create index on public.questions (official_exam_id, official_position);
create index on public.questions (source_type);
create index questions_tsv_idx on public.questions using gin (tsv);
create index on public.question_progress (user_id, due_at);
create index on public.attempts (user_id, started_at desc);
create index on public.attempt_items (attempt_id);
create index on public.attempt_items (question_id);
create index on public.plan_tasks (user_id, day);
create index on public.study_sessions (user_id, started_at desc);
create index on public.assistant_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'courses', 'subjects', 'topics', 'assessments', 'documents',
    'official_exams', 'questions', 'question_progress', 'topic_progress',
    'attempts', 'availability_rules', 'plan_tasks', 'study_sessions',
    'assistant_conversations'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
create policy "profiles: own row" on public.profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Catálogos: se leen los del sistema y los propios; solo se modifican los propios.
do $$
declare
  t text;
begin
  foreach t in array array['assessment_types', 'document_types', 'question_types']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%1$s: read system and own" on public.%1$I
         for select to authenticated
         using (user_id is null or user_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s: insert own" on public.%1$I
         for insert to authenticated
         with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s: update own" on public.%1$I
         for update to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s: delete own" on public.%1$I
         for delete to authenticated
         using (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- Tablas de usuario: acceso total solo a las filas propias.
do $$
declare
  t text;
begin
  foreach t in array array[
    'courses', 'subjects', 'topics', 'assessments', 'assessment_topics',
    'documents', 'document_topics', 'document_assessments', 'document_chunks',
    'official_exams', 'questions', 'question_progress', 'topic_progress',
    'attempts', 'attempt_items', 'availability_rules', 'blocked_days',
    'plan_tasks', 'study_sessions', 'ai_cache',
    'assistant_conversations', 'assistant_messages'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%1$s: own rows" on public.%1$I
         for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;
