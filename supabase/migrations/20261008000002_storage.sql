-- =====================================================================
-- Storage: bucket privado para los documentos del usuario.
-- Ruta de cada archivo: <user_id>/<document_id>/<nombre>
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800) -- 50 MB (límite del plan gratuito)
on conflict (id) do nothing;

create policy "documents bucket: read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "documents bucket: insert own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "documents bucket: update own"
  on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "documents bucket: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
