-- T28 · Bucket privado de fotos de progreso y sus políticas (RF-40 a RF-43, DC-18, DC-5).
-- Ruta de cada archivo: {id_del_alumno}/{uuid}.webp. Solo se entregan con URL firmada.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 1048576, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Ver: el dueño de la carpeta y su coach. Como la RLS de profiles ya limita qué perfiles se
-- ven (uno mismo y los alumnos del coach), basta con que el dueño de la carpeta sea visible.
create policy progress_photos_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'progress-photos'
    and public.is_active_member()
    and exists (
      select 1 from public.profiles p where p.id::text = (storage.foldername(name))[1]
    )
  );

create policy progress_photos_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'progress-photos'
    and public.is_active_member()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Sin política de update: una foto no se modifica, se borra y se sube otra.
create policy progress_photos_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'progress-photos'
    and public.is_active_member()
    and (storage.foldername(name))[1] = auth.uid()::text
  );
