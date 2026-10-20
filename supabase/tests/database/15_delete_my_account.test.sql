-- T126 · Borrar la propia cuenta (RF-48; DC-4, DC-32).
begin;
select plan(19);

select tests.setup_basic();

-- Datos completos de A (con un entrenamiento antiguo) y algo de B para comprobar que no se toca.
insert into public.programs (id, coach_id, student_id, name, weeks_count, start_date, ends_on) values
  ('90000000-0000-0000-0000-0000000000a1', tests.coach_id(), tests.student_a_id(), 'Programa de A', 2,
   '2026-09-07', '2026-09-20');
insert into public.program_sessions (id, program_id, week_number, label) values
  ('91000000-0000-0000-0000-0000000000a1', '90000000-0000-0000-0000-0000000000a1', 1, 'A');
insert into public.exercises (id, coach_id, name, muscle_group) values
  ('e0000000-0000-0000-0000-000000000001', null, 'Sentadilla', 'Piernas');
insert into public.exercises(id,name,muscle_group) values('e0000000-0000-0000-0000-000000000002','Alternativa','Piernas');
insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max) values
 ('a3000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-0000000000a1','e0000000-0000-0000-0000-000000000001',0,3,8,12);
insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max) values
 ('a3000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002',0,2,6,10);
insert into public.workouts (id, student_id, program_id, program_session_id, started_at, finished_at, duration_seconds) values
  ('d0000000-0000-0000-0000-0000000000a1', tests.student_a_id(), '90000000-0000-0000-0000-0000000000a1',
   '91000000-0000-0000-0000-0000000000a1', now() - interval '40 days', now() - interval '40 days' + interval '1 hour', 3600),
  ('d0000000-0000-0000-0000-0000000000a2', tests.student_a_id(), null, null,
   now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 3600),
  ('d0000000-0000-0000-0000-0000000000b1', tests.student_b_id(), null, null,
   now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 3600);
insert into public.workout_sets (workout_id, student_id, exercise_id, exercise_name, position, set_number, weight_kg, reps) values
  ('d0000000-0000-0000-0000-0000000000a1', tests.student_a_id(), 'e0000000-0000-0000-0000-000000000001', 'Sentadilla', 0, 1, 60, 10),
  ('d0000000-0000-0000-0000-0000000000a2', tests.student_a_id(), 'e0000000-0000-0000-0000-000000000001', 'Sentadilla', 0, 1, 65, 8),
  ('d0000000-0000-0000-0000-0000000000b1', tests.student_b_id(), 'e0000000-0000-0000-0000-000000000001', 'Sentadilla', 0, 1, 50, 10);
insert into public.comments (workout_id, author_id, body) values
  ('d0000000-0000-0000-0000-0000000000a1', tests.coach_id(), 'comentario del coach a A'),
  ('d0000000-0000-0000-0000-0000000000b1', tests.coach_id(), 'comentario del coach a B');
insert into public.body_measurements (student_id, measured_on, weight_kg) values
  (tests.student_a_id(), '2026-10-01', 80), (tests.student_b_id(), '2026-10-01', 90);
insert into public.progress_photos (student_id, taken_on, storage_path, size_bytes) values
  (tests.student_a_id(), '2026-10-01', tests.student_a_id()::text || '/a.webp', 1000),
  (tests.student_b_id(), '2026-10-01', tests.student_b_id()::text || '/b.webp', 1000);
insert into public.achievements (student_id, kind) values
  (tests.student_a_id(), 'first_workout'), (tests.student_b_id(), 'first_workout');
insert into public.comment_reads (user_id, workout_id) values
  (tests.student_a_id(), 'd0000000-0000-0000-0000-0000000000a1');

-- ===== Quien no puede =====
select tests.authenticate_as_anon();
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'sin sesión no se borra nada');

reset role;
select tests.authenticate_as(tests.coach_id());
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'el coach no borra su cuenta desde la app');
reset role;
select is((select count(*)::int from auth.users where id = tests.coach_id()), 1, 'la cuenta del coach sigue');

update public.profiles set is_active = false where id = tests.student_b_id();
select tests.authenticate_as(tests.student_b_id());
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'un alumno desactivado no puede');
reset role;
update public.profiles set is_active = true where id = tests.student_b_id();

-- ===== Alumno A borra su cuenta =====
select tests.authenticate_as(tests.student_a_id());
select lives_ok($$ select public.delete_my_account() $$, 'A borra su cuenta');
reset role;

select is((select count(*)::int from auth.users where id = tests.student_a_id()), 0, 'el usuario de autenticación desaparece');
select is((select count(*)::int from public.profiles where id = tests.student_a_id()), 0, 'el perfil desaparece');
select is((select count(*)::int from public.workouts where student_id = tests.student_a_id()), 0, 'sus entrenamientos (también los antiguos) desaparecen');
select is((select count(*)::int from public.workout_sets where student_id = tests.student_a_id()), 0, 'sus series desaparecen');
select is((select count(*)::int from public.programs where student_id = tests.student_a_id()), 0, 'sus programas asignados desaparecen');
select is((select count(*)::int from public.body_measurements where student_id = tests.student_a_id()), 0, 'sus medidas desaparecen');
select is((select count(*)::int from public.progress_photos where student_id = tests.student_a_id()), 0, 'las filas de sus fotos desaparecen');
select is((select count(*)::int from public.achievements where student_id = tests.student_a_id()), 0, 'sus logros desaparecen');
select is((select count(*)::int from public.comment_reads where user_id = tests.student_a_id()), 0, 'sus marcas de lectura desaparecen');
select is((select count(*)::int from public.comments where body = 'comentario del coach a A'), 0, 'los comentarios sobre sus entrenamientos desaparecen (DC-4)');

select is((select count(*)::int from public.session_exercise_alternatives),0,'sus alternativas asignadas desaparecen');

-- ===== Lo de los demás sigue intacto =====
select is((select count(*)::int from public.workouts where student_id = tests.student_b_id()), 1, 'el entrenamiento de B sigue');
select is((select count(*)::int from public.comments where body = 'comentario del coach a B'), 1, 'el comentario a B sigue');
select is((select count(*)::int from public.profiles where role = 'coach'), 1, 'el coach sigue');

select * from finish();
rollback;
