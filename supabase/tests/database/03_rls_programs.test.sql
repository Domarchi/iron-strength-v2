-- T21 · RLS de programs, program_sessions y session_exercises (RF-12 a RF-18, RF-44).
begin;
select plan(17);

select tests.setup_basic();

insert into public.exercises (id, coach_id, name, muscle_group) values
  ('e0000000-0000-0000-0000-000000000001', null, 'Sentadilla', 'Piernas');
insert into public.exercises (id, coach_id, name, muscle_group, archived_at) values
  ('e0000000-0000-0000-0000-0000000000a1', tests.coach_id(), 'Archivado A', 'Core', now()),
  ('e0000000-0000-0000-0000-0000000000b1', tests.coach_id(), 'Archivado B', 'Core', now());

-- Plantilla, programa de A y programa de B
insert into public.programs (id, coach_id, student_id, name, weeks_count, start_date, ends_on) values
  ('a1000000-0000-0000-0000-000000000001', tests.coach_id(), null, 'Plantilla', 2, null, null),
  ('a1000000-0000-0000-0000-00000000000a', tests.coach_id(), tests.student_a_id(), 'PA', 2, '2026-10-05', '2026-10-18'),
  ('a1000000-0000-0000-0000-00000000000b', tests.coach_id(), tests.student_b_id(), 'PB', 2, '2026-10-05', '2026-10-18');
insert into public.program_sessions (id, program_id, week_number, label) values
  ('a2000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 1, 'A'),
  ('a2000000-0000-0000-0000-00000000000b', 'a1000000-0000-0000-0000-00000000000b', 1, 'A');
insert into public.session_exercises (program_session_id, exercise_id, position, sets, reps_min, reps_max) values
  ('a2000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001', 0, 3, 8, 12),
  ('a2000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-0000000000a1', 1, 3, 8, 12),
  ('a2000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-0000000000b1', 0, 3, 8, 12);

-- ===== Alumno A =====
select tests.authenticate_as(tests.student_a_id());

select is((select count(*)::int from public.programs), 1, 'A ve solo su programa (no la plantilla ni el de B)');
select is((select id from public.programs), 'a1000000-0000-0000-0000-00000000000a'::uuid, 'y es el suyo');
select is((select count(*)::int from public.program_sessions), 1, 'A ve solo las sesiones de su programa');
select is((select count(*)::int from public.session_exercises), 2, 'A ve solo los ejercicios de su programa');

update public.programs set name = 'Hackeado' where id = 'a1000000-0000-0000-0000-00000000000a';
select is((select name from public.programs where id = 'a1000000-0000-0000-0000-00000000000a'), 'PA',
  'A no puede editar su programa');
delete from public.programs where id = 'a1000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.programs), 1, 'A no puede borrar su programa');
select throws_ok(
  $$ insert into public.programs (coach_id, name, weeks_count)
     values ('c0000000-0000-0000-0000-000000000001', 'X', 1) $$,
  '42501', null, 'A no crea programas');
select throws_ok(
  $$ insert into public.program_sessions (program_id, week_number, label)
     values ('a1000000-0000-0000-0000-00000000000a', 2, 'B') $$,
  '42501', null, 'A no agrega sesiones a su programa');
select throws_ok(
  $$ insert into public.session_exercises (program_session_id, exercise_id, sets, reps_min, reps_max)
     values ('a2000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001', 3, 8, 12) $$,
  '42501', null, 'A no agrega ejercicios a su programa');

select is((select count(*)::int from public.exercises where name = 'Archivado A'), 1,
  'A ve un ejercicio archivado que sigue en su programa asignado');
select is((select count(*)::int from public.exercises where name = 'Archivado B'), 0,
  'A no ve un ejercicio archivado que solo está en el programa de B');
reset role;

-- ===== Coach =====
select tests.authenticate_as(tests.coach_id());

select is((select count(*)::int from public.programs), 3, 'el coach ve plantilla y programas asignados');
select lives_ok(
  $$ insert into public.programs (coach_id, name, weeks_count)
     values ('c0000000-0000-0000-0000-000000000001', 'Nueva plantilla', 4) $$,
  'el coach crea plantillas');
select throws_ok(
  $$ insert into public.programs (coach_id, student_id, name, weeks_count, start_date, ends_on)
     values ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a',
             'Directo', 2, '2026-12-07', '2026-12-20') $$,
  '42501', null, 'asignar a un alumno solo se hace con assign_program');
update public.programs set name = 'Renombrado' where id = 'a1000000-0000-0000-0000-00000000000a';
select is((select name from public.programs where id = 'a1000000-0000-0000-0000-00000000000a'),
  'Renombrado', 'el coach edita un programa asignado');
select lives_ok(
  $$ insert into public.program_sessions (program_id, week_number, label)
     values ('a1000000-0000-0000-0000-000000000001', 1, 'A') $$,
  'el coach agrega sesiones a su plantilla');
reset role;

-- ===== Anónimo =====
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.programs $$, '42501', null, 'el anónimo no accede a programs');

select * from finish();
rollback;
