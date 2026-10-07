-- Restricciones del esquema (T9 a T16): cada "Hecho cuando" de las migraciones.
begin;
select plan(21);

select tests.setup_basic();

-- profiles
select throws_ok(
  $$ select tests.create_profile('c0000000-0000-0000-0000-000000000002', 'coach', 'Otro coach') $$,
  '23505', null, 'solo puede existir un coach');
select throws_ok(
  $$ select tests.create_profile('a0000000-0000-0000-0000-0000000000a2', 'student', 'X',
       'a0000000-0000-0000-0000-00000000000a') $$,
  '23514', null, 'el coach de un alumno debe ser el coach');

-- invitations: el token no se guarda en claro
select has_column('public', 'invitations', 'token_hash', 'se guarda el hash del token');
select hasnt_column('public', 'invitations', 'token', 'no existe columna con el token en claro');
insert into public.invitations (coach_id, email, token_hash, expires_at)
values (tests.coach_id(), 'nuevo@test.local', 'h1', now() + interval '7 days');
select throws_ok(
  $$ insert into public.invitations (coach_id, email, token_hash, expires_at)
     values (tests.coach_id(), 'nuevo@test.local', 'h2', now() + interval '7 days') $$,
  '23505', null, 'una sola invitación abierta por correo');

-- exercises
insert into public.exercises (coach_id, name, muscle_group) values (null, 'Press de banca', 'Pecho');
select throws_ok(
  $$ insert into public.exercises (coach_id, name, muscle_group) values (null, '  press DE banca ', 'Pecho') $$,
  '23505', null, 'nombre único sin distinguir mayúsculas');

-- programs
insert into public.programs (id, coach_id, student_id, name, weeks_count, start_date, ends_on)
values ('11111111-1111-1111-1111-111111111111', tests.coach_id(), tests.student_a_id(),
        'P1', 4, '2026-10-05', '2026-11-01');
select throws_ok(
  $$ insert into public.programs (coach_id, student_id, name, weeks_count, start_date, ends_on)
     values (tests.coach_id(), tests.student_a_id(), 'P2', 4, '2026-10-26', '2026-11-22') $$,
  '23P01', null, 'no se solapan programas del mismo alumno');
select throws_ok(
  $$ insert into public.programs (coach_id, student_id, name, weeks_count, start_date, ends_on)
     values (tests.coach_id(), tests.student_a_id(), 'P3', 4, '2026-12-02', '2026-12-29') $$,
  '23514', null, 'la fecha de inicio debe ser lunes');
select throws_ok(
  $$ insert into public.programs (coach_id, name, weeks_count) values (tests.coach_id(), 'Larga', 17) $$,
  '23514', null, 'un programa tiene como máximo 16 semanas');

-- program_sessions y session_exercises
insert into public.program_sessions (id, program_id, week_number, label)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 1, 'A');
select throws_ok(
  $$ insert into public.program_sessions (program_id, week_number, label)
     values ('11111111-1111-1111-1111-111111111111', 5, 'A') $$,
  '23514', null, 'la semana no puede exceder weeks_count');
select throws_ok(
  $$ insert into public.session_exercises (program_session_id, exercise_id, sets, reps_min, reps_max)
     select '22222222-2222-2222-2222-222222222222', id, 3, 12, 8 from public.exercises limit 1 $$,
  '23514', null, 'reps_min no puede superar reps_max');
insert into public.session_exercises (program_session_id, exercise_id, position, sets, reps_min, reps_max)
select '22222222-2222-2222-2222-222222222222', e.id, g, 3, 8, 12
from public.exercises e, generate_series(1, 15) g where e.name = 'Press de banca';
select throws_ok(
  $$ insert into public.session_exercises (program_session_id, exercise_id, sets, reps_min, reps_max)
     select '22222222-2222-2222-2222-222222222222', id, 3, 8, 12 from public.exercises limit 1 $$,
  '23514', null, 'máximo 15 ejercicios por sesión');

-- workouts
insert into public.workouts (id, student_id, started_at, finished_at, duration_seconds)
values ('33333333-3333-3333-3333-333333333333', tests.student_a_id(),
        '2026-10-01 02:30:00+00', '2026-10-01 03:20:00+00', 3000);
select throws_ok(
  $$ insert into public.workouts (id, student_id, started_at, finished_at, duration_seconds)
     values ('33333333-3333-3333-3333-333333333333', tests.student_a_id(),
             '2026-10-01 02:30:00+00', '2026-10-01 03:20:00+00', 3000) $$,
  '23505', null, 'reinsertar el mismo id falla (idempotencia, DC-8)');
select is(
  (select performed_on from public.workouts where id = '33333333-3333-3333-3333-333333333333'),
  '2026-09-30'::date, 'performed_on usa hora de Santiago (02:30Z = 23:30 del día anterior)');
select is(
  (select week_start from public.workouts where id = '33333333-3333-3333-3333-333333333333'),
  '2026-09-28'::date, 'week_start es el lunes de la semana en Santiago');
select throws_ok(
  $$ insert into public.workouts (id, student_id, started_at, finished_at, duration_seconds)
     values (gen_random_uuid(), tests.student_a_id(), now() + interval '1 hour', now() + interval '2 hours', 60) $$,
  '23514', null, 'started_at no puede estar en el futuro');
select throws_ok(
  $$ insert into public.workout_sets (workout_id, student_id, exercise_id, exercise_name, position, set_number, weight_kg, reps)
     select '33333333-3333-3333-3333-333333333333', tests.student_b_id(), id, 'x', 0, 1, 50, 8
     from public.exercises limit 1 $$,
  '23503', null, 'la serie debe tener el mismo alumno que el entrenamiento');

-- body_measurements
select throws_ok(
  $$ insert into public.body_measurements (student_id, measured_on) values (tests.student_a_id(), '2026-10-07') $$,
  '23514', null, 'una medida necesita al menos un campo');
insert into public.body_measurements (student_id, measured_on, weight_kg)
values (tests.student_a_id(), '2026-10-07', 80);
select throws_ok(
  $$ insert into public.body_measurements (student_id, measured_on, weight_kg)
     values (tests.student_a_id(), '2026-10-07', 81) $$,
  '23505', null, 'un registro de medidas por fecha');

-- progress_photos
insert into public.progress_photos (student_id, taken_on, storage_path, size_bytes)
select tests.student_a_id(), '2026-10-07', tests.student_a_id()::text || '/f' || g || '.webp', 1000
from generate_series(1, 3) g;
select throws_ok(
  $$ insert into public.progress_photos (student_id, taken_on, storage_path, size_bytes)
     values (tests.student_a_id(), '2026-10-07', tests.student_a_id()::text || '/f4.webp', 1000) $$,
  '23514', null, 'máximo 3 fotos por fecha');
select throws_ok(
  $$ insert into public.progress_photos (student_id, taken_on, storage_path, size_bytes)
     values (tests.student_a_id(), '2026-10-08', 'otra-carpeta/f.webp', 1000) $$,
  '23514', null, 'la ruta debe estar en la carpeta del dueño');

select * from finish();
rollback;
