-- Borrar un programa o una sesión planificada con entrenamientos conserva los entrenamientos
-- (ON DELETE SET NULL) y no choca con workouts_guard.
begin;
select plan(8);

select tests.setup_basic();
insert into public.exercises (id, coach_id, name, muscle_group)
values ('e0000000-0000-0000-0000-000000000001', null, 'Sentadilla', 'Piernas');

insert into public.programs (id, coach_id, student_id, name, weeks_count, start_date, ends_on) values
  ('a1000000-0000-0000-0000-00000000000a', tests.coach_id(), tests.student_a_id(), 'PA', 2, '2025-03-03', '2025-03-16'),
  ('a1000000-0000-0000-0000-00000000000b', tests.coach_id(), tests.student_a_id(), 'PB', 2, '2025-03-17', '2025-03-30');
insert into public.program_sessions (id, program_id, week_number, label) values
  ('a2000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 1, 'A'),
  ('a2000000-0000-0000-0000-00000000000b', 'a1000000-0000-0000-0000-00000000000b', 1, 'A');
insert into public.workouts (id, student_id, program_id, program_session_id, started_at, finished_at, duration_seconds) values
  ('d0000000-0000-0000-0000-00000000000a', tests.student_a_id(), 'a1000000-0000-0000-0000-00000000000a',
   'a2000000-0000-0000-0000-00000000000a', '2025-03-04 15:00:00+00', '2025-03-04 16:00:00+00', 3600),
  ('d0000000-0000-0000-0000-00000000000b', tests.student_a_id(), 'a1000000-0000-0000-0000-00000000000b',
   'a2000000-0000-0000-0000-00000000000b', '2025-03-18 15:00:00+00', '2025-03-18 16:00:00+00', 3600);

select lives_ok($$ delete from public.programs where id = 'a1000000-0000-0000-0000-00000000000a' $$,
  'se puede borrar un programa que tiene entrenamientos');
select is((select program_id from public.workouts where id = 'd0000000-0000-0000-0000-00000000000a'), null,
  'el entrenamiento queda sin programa');
select is((select program_session_id from public.workouts where id = 'd0000000-0000-0000-0000-00000000000a'), null,
  'y sin sesión planificada');
select is((select count(*)::int from public.workouts where id = 'd0000000-0000-0000-0000-00000000000a'), 1,
  'pero el entrenamiento se conserva');

select lives_ok($$ delete from public.program_sessions where id = 'a2000000-0000-0000-0000-00000000000b' $$,
  'se puede quitar una sesión planificada que tiene entrenamientos');
select is((select program_session_id from public.workouts where id = 'd0000000-0000-0000-0000-00000000000b'), null,
  'el entrenamiento queda sin sesión planificada');
select is((select program_id from public.workouts where id = 'd0000000-0000-0000-0000-00000000000b'),
  'a1000000-0000-0000-0000-00000000000b'::uuid, 'y conserva su programa');

-- La coherencia sigue exigiéndose al insertar
select throws_ok(
  $$ insert into public.workouts (id, student_id, program_id, program_session_id, started_at, finished_at, duration_seconds)
     values (gen_random_uuid(), tests.student_a_id(), 'a1000000-0000-0000-0000-00000000000b',
             'a2000000-0000-0000-0000-00000000000a', '2025-03-19 15:00:00+00', '2025-03-19 16:00:00+00', 60) $$,
  null, null, 'no se puede insertar un entrenamiento con una sesión de otro programa');

select * from finish();
rollback;
