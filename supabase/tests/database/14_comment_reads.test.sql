-- T124 · Comentarios no leídos: marcas de lectura y conteos con RLS (RF-37; DC-30).
begin;
select plan(16);

select tests.setup_basic();

insert into public.workouts (id, student_id, started_at, finished_at, duration_seconds) values
  ('d0000000-0000-0000-0000-0000000000a1', tests.student_a_id(), now() - interval '3 hours', now() - interval '2 hours', 3600),
  ('d0000000-0000-0000-0000-0000000000b1', tests.student_b_id(), now() - interval '3 hours', now() - interval '2 hours', 3600);

-- El coach comenta el entrenamiento de A y el de B; A comenta el suyo.
insert into public.comments (workout_id, author_id, body, created_at) values
  ('d0000000-0000-0000-0000-0000000000a1', tests.coach_id(), 'del coach 1', now() - interval '2 hours'),
  ('d0000000-0000-0000-0000-0000000000a1', tests.coach_id(), 'del coach 2', now() - interval '90 minutes'),
  ('d0000000-0000-0000-0000-0000000000b1', tests.coach_id(), 'para B', now() - interval '2 hours'),
  ('d0000000-0000-0000-0000-0000000000a1', tests.student_a_id(), 'de A', now() - interval '60 minutes');

-- ===== Alumno A =====
select tests.authenticate_as(tests.student_a_id());

select is((select count(*)::int from public.unread_comments()), 1,
  'A tiene un entrenamiento con comentarios sin leer');
select is((select unread_count from public.unread_comments()), 2,
  'solo cuentan los del coach (sus propios comentarios no son no leídos)');
select is((select student_id from public.unread_comments()), tests.student_a_id(),
  'informa de quién es el entrenamiento');

select lives_ok(
  $$ select public.mark_comments_read('d0000000-0000-0000-0000-0000000000a1') $$,
  'A marca su entrenamiento como leído');
select is((select count(*)::int from public.unread_comments()), 0, 'tras marcarlo no queda nada sin leer');

select throws_ok(
  $$ select public.mark_comments_read('d0000000-0000-0000-0000-0000000000b1') $$,
  '42501', null, 'A no marca como leído el entrenamiento de B');

-- Un comentario nuevo posterior a la marca vuelve a contar.
reset role;
insert into public.comments (workout_id, author_id, body, created_at) values
  ('d0000000-0000-0000-0000-0000000000a1', tests.coach_id(), 'nuevo', now() + interval '1 minute');
select tests.authenticate_as(tests.student_a_id());
select is((select unread_count from public.unread_comments()), 1, 'un comentario posterior vuelve a quedar sin leer');

select is((select count(*)::int from public.comment_reads), 1, 'A ve solo sus marcas de lectura');
select lives_ok(
  $$ select public.mark_comments_read('d0000000-0000-0000-0000-0000000000a1') $$,
  'marcar de nuevo actualiza la marca (sin duplicar)');
select is((select count(*)::int from public.comment_reads), 1, 'sigue habiendo una sola marca');
select throws_ok($$ delete from public.comment_reads $$, '42501', null, 'las marcas no se borran');

-- ===== Alumno B =====
reset role;
select tests.authenticate_as(tests.student_b_id());
select is((select count(*)::int from public.unread_comments()), 1, 'B solo ve lo suyo');
select is((select count(*)::int from public.comment_reads), 0, 'B no ve las marcas de A');

-- ===== Coach =====
reset role;
select tests.authenticate_as(tests.coach_id());
select is((select unread_count from public.unread_comments() where student_id = tests.student_a_id()), 1,
  'el coach ve como no leído el comentario de A');

-- ===== Sin sesión =====
reset role;
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.unread_comments() $$, '42501', null, 'sin sesión no se puede');

-- ===== Cascada =====
reset role;
delete from public.workouts where id = 'd0000000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from public.comment_reads), 0, 'al borrar el entrenamiento se borran sus marcas');

select * from finish();
rollback;
