-- Fase 3 (biblioteca y búsqueda). Pégalo entero en Supabase → SQL Editor → Run.

-- =====================================================================
-- Fase 3: búsqueda de texto completo sin tildes y búsqueda global.
-- =====================================================================

-- "clausula" debe encontrar "cláusula": configuración española + unaccent.
create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- (Se puede volver a ejecutar: si ya existía, se recrea junto con las columnas tsv.)
drop text search configuration if exists public.es_unaccent cascade;
create text search configuration public.es_unaccent (copy = pg_catalog.spanish);
alter text search configuration public.es_unaccent
  alter mapping for hword, hword_part, word with extensions.unaccent, pg_catalog.spanish_stem;

-- Las columnas tsv se regeneran con la nueva configuración.
alter table public.document_chunks drop column if exists tsv;
alter table public.document_chunks add column tsv tsvector generated always as (
  setweight(to_tsvector('public.es_unaccent', coalesce(heading, '')), 'A') ||
  setweight(to_tsvector('public.es_unaccent', content), 'B')
) stored;
create index document_chunks_tsv_idx on public.document_chunks using gin (tsv);

alter table public.questions drop column if exists tsv;
alter table public.questions add column tsv tsvector generated always as (
  setweight(to_tsvector('public.es_unaccent', stem), 'A') ||
  setweight(to_tsvector('public.es_unaccent', coalesce(subtopic, '')), 'B') ||
  setweight(to_tsvector('public.es_unaccent', coalesce(explanation, '')), 'C')
) stored;
create index questions_tsv_idx on public.questions using gin (tsv);

-- Búsqueda global en fragmentos de documentos, títulos, preguntas y temas.
-- security invoker: se aplica RLS, cada usuario solo busca en lo suyo.
-- Los fragmentos resaltados van entre ⟦ y ⟧ (la interfaz los pinta sin HTML).
create or replace function public.search_all(q text, subject uuid default null, max_results int default 40)
returns table (
  kind        text,
  id          uuid,
  title       text,
  snippet     text,
  subject_id  uuid,
  document_id uuid,
  chunk_index int,
  page        int,
  page_to     int,
  rank        real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with query as (
    select websearch_to_tsquery('public.es_unaccent', q) as tsq
  ),
  chunk_hits as (
    select c.id, c.document_id, c.chunk_index, c.page_from, c.page_to, c.content,
           ts_rank_cd(c.tsv, query.tsq) as rank,
           row_number() over (partition by c.document_id order by ts_rank_cd(c.tsv, query.tsq) desc) as rn
    from public.document_chunks c
    join public.documents d on d.id = c.document_id, query
    where c.tsv @@ query.tsq and (subject is null or d.subject_id = subject)
  ),
  top_chunks as (
    select * from chunk_hits where rn <= 3 order by rank desc limit max_results
  ),
  results as (
    select 'chunk'::text as kind, tc.id, d.title,
           ts_headline('public.es_unaccent', tc.content, query.tsq,
             'StartSel=⟦, StopSel=⟧, MaxWords=30, MinWords=12, MaxFragments=2, FragmentDelimiter=" … "') as snippet,
           d.subject_id, d.id as document_id, tc.chunk_index, tc.page_from as page, tc.page_to, tc.rank::real as rank
    from top_chunks tc
    join public.documents d on d.id = tc.document_id, query

    union all
    select 'document', d.id, d.title, coalesce(d.original_filename, ''), d.subject_id, d.id, null, null, null,
           (ts_rank_cd(to_tsvector('public.es_unaccent', d.title || ' ' || coalesce(d.original_filename, '')), query.tsq) * 2)::real
    from public.documents d, query
    where to_tsvector('public.es_unaccent', d.title || ' ' || coalesce(d.original_filename, '')) @@ query.tsq
      and (subject is null or d.subject_id = subject)

    union all
    select 'question', qn.id, left(qn.stem, 140),
           ts_headline('public.es_unaccent', qn.stem, query.tsq,
             'StartSel=⟦, StopSel=⟧, MaxWords=30, MinWords=12'),
           qn.subject_id, null, null, null, null, ts_rank_cd(qn.tsv, query.tsq)::real
    from public.questions qn, query
    where qn.tsv @@ query.tsq and not qn.archived and (subject is null or qn.subject_id = subject)

    union all
    select 'topic', t.id, t.name, coalesce(t.description, ''), t.subject_id, null, null, null, null,
           (ts_rank_cd(to_tsvector('public.es_unaccent', t.name || ' ' || coalesce(t.description, '')), query.tsq) * 2)::real
    from public.topics t, query
    where to_tsvector('public.es_unaccent', t.name || ' ' || coalesce(t.description, '')) @@ query.tsq
      and (subject is null or t.subject_id = subject)
  )
  select * from results order by rank desc limit max_results
$$;

grant execute on function public.search_all(text, uuid, int) to authenticated;

NOTIFY pgrst, 'reload schema';
