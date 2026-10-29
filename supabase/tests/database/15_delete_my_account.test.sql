-- T126 · Borrar la propia cuenta (RF-48; DC-4, DC-32).
begin;
select plan(34);

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
insert into public.exercises(id,personal_owner_id,name,muscle_group) values
 ('e0000000-0000-0000-0000-00000000000a',tests.student_a_id(),'Personal A','Core'),
 ('e0000000-0000-0000-0000-00000000000b',tests.student_b_id(),'Personal B','Core');
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

insert into public.program_copy_receipts(id,coach_id,payload) values('90000000-0000-0000-0000-0000000000a1',tests.coach_id(),'{}');

insert into public.session_day_overrides values('91000000-0000-0000-0000-0000000000a1',tests.student_a_id(),2);

insert into public.planning_mutations(id,program_id,coach_id,student_id,payload,result) values(gen_random_uuid(),'90000000-0000-0000-0000-0000000000a1',tests.coach_id(),tests.student_a_id(),'{}','{}');
select tests.authenticate_as(tests.student_a_id());
select is(public.publish_mobile_comment('c1950000-0000-4000-8000-000000000001','d0000000-0000-0000-0000-0000000000a1','Comentario del alumno'),'created','prepara recibo propio');
select public.mutate_personal_library('a2110000-0000-4000-8000-000000000001','folder_create','a2110000-0000-4000-8000-000000000002',0,'{"name":"Personal"}');
select public.mutate_personal_library('a2110000-0000-4000-8000-000000000003','routine_create','a2110000-0000-4000-8000-000000000004',0,
 '{"name":"Personal A","folderId":"a2110000-0000-4000-8000-000000000002","items":[{"id":"a2110000-0000-4000-8000-000000000005","exerciseId":"e0000000-0000-0000-0000-000000000001","sets":1,"repsMin":8,"repsMax":12,"targetWeightKg":null,"note":null,"restSeconds":null,"supersetId":null,"supersetRestSeconds":null,"series":null}]}');
select public.save_personal_workout(jsonb_build_object('version',1,'id','a2130000-0000-4000-8000-000000000001','origin',jsonb_build_object('kind','free'),'title','Libre A','startedAt',to_char(now()-interval '30 minutes','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'finishedAt',to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'),'durationSeconds',1800,'sets',jsonb_build_array(jsonb_build_object('exerciseId','e0000000-0000-0000-0000-000000000001','position',0,'setNumber',1,'weightKg',30,'reps',8,'isWarmup',false))));
reset role;
select tests.authenticate_as(tests.student_b_id());
select public.save_personal_workout(jsonb_build_object('version',1,'id','b2130000-0000-4000-8000-000000000001','origin',jsonb_build_object('kind','free'),'title','Libre B','startedAt',to_char(now()-interval '30 minutes','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'finishedAt',to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'),'durationSeconds',1800,'sets',jsonb_build_array(jsonb_build_object('exerciseId','e0000000-0000-0000-0000-000000000001','position',0,'setNumber',1,'weightKg',30,'reps',8,'isWarmup',false))));
reset role;

-- ===== Quien no puede =====
insert into public.workout_correction_receipts(owner_id,request_id,workout_id,payload_hash,revision) values
 (tests.student_a_id(),'71000000-0000-4000-8000-000000000001','d0000000-0000-0000-0000-0000000000a1',repeat('a',64),1),
 (tests.student_b_id(),'71000000-0000-4000-8000-000000000002','d0000000-0000-0000-0000-0000000000b1',repeat('b',64),1);
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

select is((select count(*)::int from public.program_copy_receipts),0,'los recibos caen al borrar el programa');

select is((select count(*)::int from public.session_day_overrides),0,'sus días elegidos desaparecen');

select is((select count(*)::int from public.planning_mutations),0,'los recibos que mencionan al alumno desaparecen');
select is((select count(*)::int from public.mobile_comment_receipts where author_id=tests.student_a_id()),0,'sus referencias de envío desaparecen');
select is((select count(*)::int from public.personal_folders where owner_id=tests.student_a_id()),0,'sus carpetas personales desaparecen');
select is((select count(*)::int from public.personal_routines where owner_id=tests.student_a_id()),0,'sus rutinas personales desaparecen');
select is((select count(*)::int from public.personal_routine_items where owner_id=tests.student_a_id()),0,'sus filas personales desaparecen');
select is((select count(*)::int from public.personal_training_receipts where owner_id=tests.student_a_id()),0,'sus recibos personales desaparecen');

select is((select count(*)::int from public.personal_workout_receipts where owner_id=tests.student_a_id()),0,'recibos de entrenamientos propios desaparecen');
select is((select count(*)::int from public.personal_workout_receipts where owner_id=tests.student_b_id()),1,'recibo de B se conserva');
select is((select count(*)::int from public.workout_correction_receipts where owner_id=tests.student_a_id()),0,'recibos de correcciones de A desaparecen');
select is((select count(*)::int from public.workout_correction_receipts where owner_id=tests.student_b_id()),1,'recibos de correcciones de B se conservan');

-- ===== Lo de los demás sigue intacto =====
select is((select count(*)::int from public.workouts where student_id = tests.student_b_id()), 2, 'ambos entrenamientos de B siguen');
select is((select count(*)::int from public.comments where body = 'comentario del coach a B'), 1, 'el comentario a B sigue');
select is((select count(*)::int from public.profiles where role = 'coach'), 1, 'el coach sigue');
select is((select count(*)::int from public.exercises where personal_owner_id=tests.student_a_id()),0,'ejercicios personales de A desaparecen');
select is((select count(*)::int from public.exercises where personal_owner_id=tests.student_b_id()),1,'ejercicios personales de B se conservan');

select * from finish();
rollback;
