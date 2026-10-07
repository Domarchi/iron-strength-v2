-- T27 · Storage de fotos de progreso (RF-40 a RF-43, DC-18, DC-5).
begin;
select plan(16);

select tests.setup_basic();

-- Configuración del bucket
select is((select public from storage.buckets where id = 'progress-photos'), false, 'el bucket es privado');
select is((select file_size_limit from storage.buckets where id = 'progress-photos'), 1048576::bigint,
  'límite de 1 MB');
select is((select allowed_mime_types from storage.buckets where id = 'progress-photos'),
  array['image/jpeg', 'image/webp'], 'solo JPEG y WebP');

insert into storage.objects (bucket_id, name) values
  ('progress-photos', tests.student_a_id()::text || '/a.webp'),
  ('progress-photos', tests.student_b_id()::text || '/b.webp');

-- ===== Alumno A =====
select tests.authenticate_as(tests.student_a_id());

select is((select count(*)::int from storage.objects where bucket_id = 'progress-photos'), 1,
  'A ve solo los archivos de su carpeta');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('progress-photos', 'a0000000-0000-0000-0000-00000000000a/nueva.webp') $$,
  'A sube a su carpeta');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('progress-photos', 'b0000000-0000-0000-0000-00000000000b/intruso.webp') $$,
  '42501', null, 'A no sube a la carpeta de B');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('progress-photos', 'suelto.webp') $$,
  '42501', null, 'A no sube fuera de una carpeta propia');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('otro-bucket', 'a0000000-0000-0000-0000-00000000000a/x.webp') $$,
  '42501', null, 'A no sube a otro bucket');

select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where name = 'b0000000-0000-0000-0000-00000000000b/b.webp';
select is((select count(*)::int from storage.objects where name = 'b0000000-0000-0000-0000-00000000000b/b.webp'
           and bucket_id = 'progress-photos'), 0, 'A no ve el archivo de B (ni puede borrarlo)');
delete from storage.objects where name = 'a0000000-0000-0000-0000-00000000000a/nueva.webp';
select is((select count(*)::int from storage.objects where bucket_id = 'progress-photos'), 1,
  'A borra su propio archivo');
reset role;
select is((select count(*)::int from storage.objects where name = 'b0000000-0000-0000-0000-00000000000b/b.webp'),
  1, 'el archivo de B sigue existiendo');

-- ===== Coach =====
select tests.authenticate_as(tests.coach_id());
select is((select count(*)::int from storage.objects where bucket_id = 'progress-photos'), 2,
  'el coach ve los archivos de sus alumnos');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('progress-photos', 'a0000000-0000-0000-0000-00000000000a/del-coach.webp') $$,
  '42501', null, 'el coach no sube a la carpeta de un alumno');
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where name = 'a0000000-0000-0000-0000-00000000000a/a.webp';
select is((select count(*)::int from storage.objects where bucket_id = 'progress-photos'), 2,
  'el coach no borra archivos de un alumno');
reset role;

-- ===== Alumno desactivado y anónimo =====
update public.profiles set is_active = false where id = tests.student_b_id();
select tests.authenticate_as(tests.student_b_id());
select is((select count(*)::int from storage.objects where bucket_id = 'progress-photos'), 0,
  'un alumno desactivado no ve sus archivos');
reset role;
select tests.authenticate_as_anon();
select is((select count(*)::int from storage.objects where bucket_id = 'progress-photos'), 0,
  'el anónimo no ve archivos');

select * from finish();
rollback;
