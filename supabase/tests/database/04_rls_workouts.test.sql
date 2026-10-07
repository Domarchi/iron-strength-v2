-- T23 · RLS de workouts y workout_sets (RF-20 a RF-24, RF-26b, RF-34, RF-44).
-- Ventana de edición: hasta 7 días después de la fecha del entrenamiento (hora de Santiago).
begin;
select plan(23);

select tests.setup_basic();

insert into public.exercises (id, coach_id, name, muscle_group) values
  ('e0000000-0000-0000-0000-000000000001', null, 'Sentadilla', 'Piernas');

-- Mediodía (hora de Santiago) de hace N días: evita ambigüedad cerca de la medianoche.
create function pg_temp.noon_ago(days int) returns timestamptz language sql as $$
  select (((now() at time zone 'America/Santiago')::date - days)::timestamp + time '12:00')
         at time zone 'America/Santiago'
$$;

insert into public.workouts (id, student_id, started_at, finished_at, duration_seconds, session_label, created_at) values
  ('d0000000-0000-0000-0000-0000000000a2', tests.student_a_id(), pg_temp.noon_ago(2), pg_temp.noon_ago(2) + interval '1 hour', 3600, 'orig', pg_temp.noon_ago(2)),
  ('d0000000-0000-0000-0000-0000000000a7', tests.student_a_id(), pg_temp.noon_ago(7), pg_temp.noon_ago(7) + interval '1 hour', 3600, 'orig', pg_temp.noon_ago(7)),
  ('d0000000-0000-0000-0000-0000000000a8', tests.student_a_id(), pg_temp.noon_ago(8), pg_temp.noon_ago(8) + interval '1 hour', 3600, 'orig', pg_temp.noon_ago(8)),
  ('d0000000-0000-0000-0000-0000000000b1', tests.student_b_id(), pg_temp.noon_ago(1), pg_temp.noon_ago(1) + interval '1 hour', 3600, 'orig', pg_temp.noon_ago(1));

insert into public.workout_sets (workout_id, student_id, exercise_id, exercise_name, position, set_number, weight_kg, reps)
select w.id, w.student_id, 'e0000000-0000-0000-0000-000000000001', 'Sentadilla', 0, s, 50, 10
from public.workouts w, generate_series(1, 2) s;

-- ===== Alumno A =====
select tests.authenticate_as(tests.student_a_id());

select is((select count(*)::int from public.workouts), 3, 'A ve solo sus 3 entrenamientos');
select is((select count(*)::int from public.workouts where student_id = tests.student_b_id()), 0, 'A no ve los de B');
select is((select count(*)::int from public.workout_sets), 6, 'A ve solo sus series');

select lives_ok(
  $$ insert into public.workouts (id, student_id, started_at, finished_at, duration_seconds)
     values ('d0000000-0000-0000-0000-0000000000a0', 'a0000000-0000-0000-0000-00000000000a',
             now() - interval '1 hour', now(), 3600) $$,
  'A crea su entrenamiento');
select lives_ok(
  $$ insert into public.workout_sets (workout_id, student_id, exercise_id, exercise_name, position, set_number, weight_kg, reps)
     values ('d0000000-0000-0000-0000-0000000000a0', 'a0000000-0000-0000-0000-00000000000a',
             'e0000000-0000-0000-0000-000000000001', 'Sentadilla', 0, 1, 60, 8) $$,
  'A agrega series a su entrenamiento recién creado');
select throws_ok(
  $$ insert into public.workouts (id, student_id, started_at, finished_at, duration_seconds)
     values (gen_random_uuid(), 'b0000000-0000-0000-0000-00000000000b', now() - interval '1 hour', now(), 60) $$,
  '42501', null, 'A no crea entrenamientos a nombre de B');
select throws_ok(
  $$ insert into public.workout_sets (workout_id, student_id, exercise_id, exercise_name, position, set_number, weight_kg, reps)
     values ('d0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b',
             'e0000000-0000-0000-0000-000000000001', 'Sentadilla', 0, 9, 60, 8) $$,
  '42501', null, 'A no agrega series al entrenamiento de B');

-- Ventana de 7 días
update public.workouts set session_label = 'edit' where id = 'd0000000-0000-0000-0000-0000000000a2';
select is((select session_label from public.workouts where id = 'd0000000-0000-0000-0000-0000000000a2'),
  'edit', 'A edita un entrenamiento de hace 2 días');
update public.workouts set session_label = 'edit' where id = 'd0000000-0000-0000-0000-0000000000a7';
select is((select session_label from public.workouts where id = 'd0000000-0000-0000-0000-0000000000a7'),
  'edit', 'A edita un entrenamiento del día 7 (último día de la ventana)');
update public.workouts set session_label = 'edit' where id = 'd0000000-0000-0000-0000-0000000000a8';
select is((select session_label from public.workouts where id = 'd0000000-0000-0000-0000-0000000000a8'),
  'orig', 'A no edita un entrenamiento del día 8');

update public.workout_sets set weight_kg = 100
  where workout_id = 'd0000000-0000-0000-0000-0000000000a7';
select is((select max(weight_kg)::int from public.workout_sets where workout_id = 'd0000000-0000-0000-0000-0000000000a7'),
  100, 'A edita series dentro de la ventana');
update public.workout_sets set weight_kg = 100
  where workout_id = 'd0000000-0000-0000-0000-0000000000a8';
select is((select max(weight_kg)::int from public.workout_sets where workout_id = 'd0000000-0000-0000-0000-0000000000a8'),
  50, 'A no edita series fuera de la ventana');
select throws_ok(
  $$ insert into public.workout_sets (workout_id, student_id, exercise_id, exercise_name, position, set_number, weight_kg, reps)
     values ('d0000000-0000-0000-0000-0000000000a8', 'a0000000-0000-0000-0000-00000000000a',
             'e0000000-0000-0000-0000-000000000001', 'Sentadilla', 0, 9, 60, 8) $$,
  '42501', null, 'A no agrega series a un entrenamiento antiguo');

delete from public.workouts where id = 'd0000000-0000-0000-0000-0000000000a8';
select is((select count(*)::int from public.workouts where id = 'd0000000-0000-0000-0000-0000000000a8'),
  1, 'A no borra un entrenamiento del día 8');
delete from public.workouts where id = 'd0000000-0000-0000-0000-0000000000a2';
select is((select count(*)::int from public.workouts where id = 'd0000000-0000-0000-0000-0000000000a2'),
  0, 'A borra un entrenamiento dentro de la ventana');
reset role;

-- ===== Coach =====
select tests.authenticate_as(tests.coach_id());
select is((select count(*)::int from public.workouts where student_id = tests.student_a_id()), 3,
  'el coach ve los entrenamientos de A');
select is((select count(*)::int from public.workouts where student_id = tests.student_b_id()), 1,
  'y los de B');
select is((select count(*)::int from public.workout_sets where student_id = tests.student_b_id()), 2,
  'y sus series');
select throws_ok(
  $$ insert into public.workouts (id, student_id, started_at, finished_at, duration_seconds)
     values (gen_random_uuid(), 'a0000000-0000-0000-0000-00000000000a', now() - interval '1 hour', now(), 60) $$,
  '42501', null, 'el coach no crea entrenamientos a nombre de un alumno');
update public.workouts set session_label = 'coach' where id = 'd0000000-0000-0000-0000-0000000000b1';
select is((select session_label from public.workouts where id = 'd0000000-0000-0000-0000-0000000000b1'),
  'orig', 'el coach no edita entrenamientos de un alumno');
delete from public.workouts where id = 'd0000000-0000-0000-0000-0000000000b1';
select is((select count(*)::int from public.workouts where id = 'd0000000-0000-0000-0000-0000000000b1'),
  1, 'el coach no borra entrenamientos de un alumno');
reset role;

-- ===== Alumno desactivado y anónimo =====
update public.profiles set is_active = false where id = tests.student_b_id();
select tests.authenticate_as(tests.student_b_id());
select is((select count(*)::int from public.workouts), 0, 'un alumno desactivado no ve sus entrenamientos');
reset role;
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.workouts $$, '42501', null, 'el anónimo no accede a workouts');

select * from finish();
rollback;
