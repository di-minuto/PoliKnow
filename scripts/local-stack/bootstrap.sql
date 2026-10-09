-- Imitación mínima de Supabase sobre un Postgres normal (solo para tests locales).
-- Roles y esquemas que esperan las migraciones y PostgREST.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login password 'authenticator' noinherit;
grant anon, authenticated, service_role to authenticator;

create schema auth;
create table auth.users (
  id                 uuid primary key,
  email              text unique,
  encrypted_password text,
  created_at         timestamptz not null default now()
);
-- Igual que en Supabase: lee el usuario de los claims que fija PostgREST.
create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id              text primary key,
  name            text not null,
  public          boolean default false,
  file_size_limit bigint
);
create table storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text
);
create function storage.foldername(name text) returns text[]
language sql immutable
as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;

-- Permisos por defecto de Supabase sobre el esquema public.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
