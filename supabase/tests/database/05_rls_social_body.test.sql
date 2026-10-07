-- T25 · RLS de comments, body_measurements, progress_photos, invitations y login_attempts
-- (RF-1, RF-6, RF-36, RF-38, RF-40 a RF-42, RF-44; DC-5, DC-14, DC-15, DC-18).
begin;
select plan(33);

select tests.setup_basic();

insert into public.workouts (id, student_id, started_at, finished_at, duration_seconds) values
  ('d0000000-0000-0000-0000-0000000000a1', tests.student_a_id(), now() - interval '3 hours', now() - interval '2 hours', 3600),
  ('d0000000-0000-0000-0000-0000000000b1', tests.student_b_id(), now() - interval '3 hours', now() - interval '2 hours', 3600);
insert into public.comments (id, workout_id, author_id, body) values
  ('c1000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-0000000000b1', tests.coach_id(), 'comentario sobre B');
insert into public.body_measurements (student_id, measured_on, weight_kg) values
  (tests.student_b_id(), '2026-10-01', 90);
insert into public.progress_photos (id, student_id, taken_on, storage_path, size_bytes) values
  ('f1000000-0000-0000-0000-00000000000b', tests.student_b_id(), '2026-10-01',
   tests.student_b_id()::text || '/b.webp', 1000);

-- ===== Alumno A =====
select tests.authenticate_as(tests.student_a_id());

-- comments
select lives_ok(
  $$ insert into public.comments (id, workout_id, author_id, body)
     values ('c1000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000a1',
             'a0000000-0000-0000-0000-00000000000a', 'mi comentario') $$,
  'A comenta su entrenamiento');
select throws_ok(
  $$ insert into public.comments (workout_id, author_id, body)
     values ('d0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-00000000000a', 'intruso') $$,
  '42501', null, 'A no comenta el entrenamiento de B');
select throws_ok(
  $$ insert into public.comments (workout_id, author_id, body)
     values ('d0000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-000000000001', 'suplantación') $$,
  '42501', null, 'A no puede firmar un comentario como el coach');
select is((select count(*)::int from public.comments), 1, 'A ve solo los comentarios de su entrenamiento');
update public.comments set body = 'editado' where id = 'c1000000-0000-0000-0000-0000000000a1';
select is((select body from public.comments where id = 'c1000000-0000-0000-0000-0000000000a1'),
  'mi comentario', 'los comentarios no se editan (DC-14)');

-- body_measurements
select lives_ok(
  $$ insert into public.body_measurements (student_id, measured_on, weight_kg)
     values ('a0000000-0000-0000-0000-00000000000a', '2026-10-02', 80) $$,
  'A registra sus medidas');
select throws_ok(
  $$ insert into public.body_measurements (student_id, measured_on, weight_kg)
     values ('b0000000-0000-0000-0000-00000000000b', '2026-10-02', 80) $$,
  '42501', null, 'A no registra medidas de B');
select is((select count(*)::int from public.body_measurements), 1, 'A ve solo sus medidas');
update public.body_measurements set weight_kg = 79 where student_id = tests.student_a_id();
select is((select weight_kg::int from public.body_measurements), 79, 'A edita sus medidas');

-- progress_photos
select lives_ok(
  $$ insert into public.progress_photos (id, student_id, taken_on, storage_path, size_bytes)
     values ('f1000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', '2026-10-02',
             'a0000000-0000-0000-0000-00000000000a/a.webp', 1000) $$,
  'A registra su foto');
select throws_ok(
  $$ insert into public.progress_photos (student_id, taken_on, storage_path, size_bytes)
     values ('b0000000-0000-0000-0000-00000000000b', '2026-10-02',
             'b0000000-0000-0000-0000-00000000000b/x.webp', 1000) $$,
  '42501', null, 'A no registra fotos a nombre de B');
select is((select count(*)::int from public.progress_photos), 1, 'A ve solo sus fotos');
delete from public.progress_photos where id = 'f1000000-0000-0000-0000-00000000000b';
reset role;
select is((select count(*)::int from public.progress_photos where id = 'f1000000-0000-0000-0000-00000000000b'),
  1, 'A no borra la foto de B');
select tests.authenticate_as(tests.student_a_id());
delete from public.progress_photos where id = 'f1000000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from public.progress_photos), 0, 'A borra su foto');

-- invitations y login_attempts
select is((select count(*)::int from public.invitations), 0, 'A no ve invitaciones');
select throws_ok(
  $$ insert into public.invitations (coach_id, email, token_hash, expires_at)
     values ('c0000000-0000-0000-0000-000000000001', 'x@test.local', 'hx', now() + interval '1 day') $$,
  '42501', null, 'A no crea invitaciones');
select throws_ok($$ select * from public.login_attempts $$, '42501', null, 'A no accede a login_attempts');
reset role;

-- ===== Coach =====
select tests.authenticate_as(tests.coach_id());

select is((select count(*)::int from public.comments), 2, 'el coach ve los comentarios de sus alumnos');
select lives_ok(
  $$ insert into public.comments (id, workout_id, author_id, body)
     values ('c1000000-0000-0000-0000-0000000000c1', 'd0000000-0000-0000-0000-0000000000a1',
             'c0000000-0000-0000-0000-000000000001', 'buen trabajo') $$,
  'el coach comenta el entrenamiento de un alumno');
delete from public.comments where id = 'c1000000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from public.comments where id = 'c1000000-0000-0000-0000-0000000000a1'),
  1, 'el coach no borra el comentario de un alumno');
delete from public.comments where id = 'c1000000-0000-0000-0000-0000000000c1';
select is((select count(*)::int from public.comments where id = 'c1000000-0000-0000-0000-0000000000c1'),
  0, 'el coach borra su propio comentario');

select is((select count(*)::int from public.body_measurements), 2, 'el coach ve las medidas de sus alumnos');
select throws_ok(
  $$ insert into public.body_measurements (student_id, measured_on, weight_kg)
     values ('a0000000-0000-0000-0000-00000000000a', '2026-10-03', 70) $$,
  '42501', null, 'el coach no registra medidas a un alumno');
update public.body_measurements set weight_kg = 1 + 99 where student_id = tests.student_b_id();
select is((select weight_kg::int from public.body_measurements where student_id = tests.student_b_id()),
  90, 'el coach no edita medidas de un alumno');
select is((select count(*)::int from public.progress_photos), 1, 'el coach ve las fotos de sus alumnos');
delete from public.progress_photos where id = 'f1000000-0000-0000-0000-00000000000b';
select is((select count(*)::int from public.progress_photos), 1, 'el coach no borra fotos de un alumno');

select lives_ok(
  $$ insert into public.invitations (id, coach_id, email, token_hash, expires_at)
     values ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
             'nuevo@test.local', 'h-nuevo', now() + interval '7 days') $$,
  'el coach crea invitaciones');
select is((select count(*)::int from public.invitations), 1, 'el coach ve sus invitaciones');
delete from public.invitations where id = '10000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.invitations), 0, 'el coach revoca una invitación');
select throws_ok($$ select * from public.login_attempts $$, '42501', null, 'ni el coach accede a login_attempts');
reset role;

-- ===== Anónimo =====
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.invitations $$, '42501', null, 'el anónimo no lee invitations');
select throws_ok($$ select * from public.comments $$, '42501', null, 'el anónimo no lee comments');
select throws_ok($$ select * from public.progress_photos $$, '42501', null, 'el anónimo no lee fotos');

select * from finish();
rollback;
