-- T74 · save_workout (RF-23, RF-24, DC-8): atómico, idempotente y sujeto a la RLS de quien llama.
begin;
select plan(35);

select tests.setup_basic();
insert into public.exercises (id, coach_id, name, muscle_group) values
  ('e0000000-0000-0000-0000-000000000001', null, 'Sentadilla', 'Piernas'),
  ('e0000000-0000-0000-0000-000000000002', null, 'Press de banca', 'Pecho');

insert into public.programs (id, coach_id, student_id, name, weeks_count, start_date, ends_on) values
  ('a1000000-0000-0000-0000-00000000000a', tests.coach_id(), tests.student_a_id(), 'PA', 2, '2025-03-03', '2025-03-16'),
  ('a1000000-0000-0000-0000-00000000000b', tests.coach_id(), tests.student_b_id(), 'PB', 2, '2025-03-03', '2025-03-16');
insert into public.program_sessions (id, program_id, week_number, label) values
  ('a2000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 1, 'A'),
  ('a2000000-0000-0000-0000-00000000000b', 'a1000000-0000-0000-0000-00000000000b', 1, 'A');

insert into public.session_exercises (program_session_id, exercise_id, position, sets, reps_min, reps_max)
select ps.id, e.id, case when e.name = 'Sentadilla' then 0 else 1 end, 3, 8, 12
from public.program_sessions ps cross join public.exercises e
where e.id in ('e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002');

create function pg_temp.payload(p_id text, p_session text, p_program text, p_sets jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'id', p_id, 'programId', p_program, 'programSessionId', p_session, 'sessionLabel', 'A',
    'startedAt', '2025-03-04T15:00:00Z', 'finishedAt', '2025-03-04T16:00:00Z', 'durationSeconds', 3600,
    'sets', p_sets)
$$;

create function pg_temp.sets_ok() returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('exerciseId','e0000000-0000-0000-0000-000000000001','exerciseName','Sentadilla','position',0,'setNumber',1,'weightKg',60,'reps',10,'isWarmup',false),
    jsonb_build_object('exerciseId','e0000000-0000-0000-0000-000000000001','exerciseName','Sentadilla','position',0,'setNumber',2,'weightKg',62.5,'reps',8,'isWarmup',false),
    jsonb_build_object('exerciseId','e0000000-0000-0000-0000-000000000002','exerciseName','Press de banca','position',1,'setNumber',1,'weightKg',20,'reps',12,'isWarmup',true))
$$;

select isnt_definer('public', 'save_workout', array['jsonb'], 'se ejecuta con los permisos del que llama (security invoker)');

select tests.authenticate_as(tests.student_a_id());

select is(
  public.save_workout(pg_temp.payload('d0000000-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-00000000000a',
    'a1000000-0000-0000-0000-00000000000a', pg_temp.sets_ok()))->>'status', 'created',
  'guarda el entrenamiento');
select is((select count(*)::int from public.workouts where id = 'd0000000-0000-0000-0000-0000000000a1'), 1, 'una fila de entrenamiento');
select is((select count(*)::int from public.workout_sets where workout_id = 'd0000000-0000-0000-0000-0000000000a1'), 3, 'con sus 3 series');
select is((select student_id from public.workouts where id = 'd0000000-0000-0000-0000-0000000000a1'),
  tests.student_a_id(), 'a nombre de quien llama');
select is((select is_warmup from public.workout_sets
           where workout_id = 'd0000000-0000-0000-0000-0000000000a1' and exercise_name = 'Press de banca'), true,
  'conserva el calentamiento');
select is((select performed_on from public.workouts where id = 'd0000000-0000-0000-0000-0000000000a1'),
  '2025-03-04'::date, 'y deriva el día en hora de Santiago');

-- T156: campos opcionales validados dentro de la misma transacción.
select is(public.save_workout(pg_temp.payload('d0000000-0000-0000-0000-000000000156','a2000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-00000000000a',pg_temp.sets_ok()) || '{"perceivedEffort":8,"note":"Buen ritmo"}'::jsonb)->>'status','created','valoración guardada');
select is((select perceived_effort::int from public.workouts where id='d0000000-0000-0000-0000-000000000156'),8,'esfuerzo conservado');
select is((select note from public.workouts where id='d0000000-0000-0000-0000-000000000156'),'Buen ritmo','nota conservada');
select throws_ok($$select public.save_workout(pg_temp.payload('d0000000-0000-0000-0000-000000000157','a2000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-00000000000a',pg_temp.sets_ok()) || '{"perceivedEffort":11}'::jsonb)$$,'23514',null,'esfuerzo inválido rechaza todo');
select is((select count(*)::int from public.workouts where id='d0000000-0000-0000-0000-000000000157'),0,'sin entrenamiento parcial');
reset role;
select throws_ok($$update public.workouts set note=repeat('x',501) where id='d0000000-0000-0000-0000-000000000156'$$,'23514',null,'nota larga rechazada también en UPDATE directo');
select tests.authenticate_as(tests.student_a_id());

-- Idempotencia (DC-8)
select is(
  public.save_workout(pg_temp.payload('d0000000-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-00000000000a',
    'a1000000-0000-0000-0000-00000000000a', pg_temp.sets_ok()))->>'status', 'duplicate',
  'reenviar el mismo id responde duplicado');
select is((select count(*)::int from public.workout_sets where workout_id = 'd0000000-0000-0000-0000-0000000000a1'), 3,
  'y no duplica las series');

-- Sin series
select throws_ok(
  $$ select public.save_workout(pg_temp.payload('d0000000-0000-0000-0000-0000000000a2', 'a2000000-0000-0000-0000-00000000000a',
       'a1000000-0000-0000-0000-00000000000a', '[]'::jsonb)) $$,
  '22023', null, 'sin series completadas no guarda nada');
select is((select count(*)::int from public.workouts where id = 'd0000000-0000-0000-0000-0000000000a2'), 0, 'y no queda ninguna fila');

-- Atomicidad: una serie inválida deshace todo el entrenamiento
select throws_ok(
  $$ select public.save_workout(pg_temp.payload('d0000000-0000-0000-0000-0000000000a3', 'a2000000-0000-0000-0000-00000000000a',
       'a1000000-0000-0000-0000-00000000000a',
       jsonb_build_array(
         jsonb_build_object('exerciseId','e0000000-0000-0000-0000-000000000001','exerciseName','Sentadilla','position',0,'setNumber',1,'weightKg',60,'reps',10,'isWarmup',false),
         jsonb_build_object('exerciseId','e0000000-0000-0000-0000-000000000001','exerciseName','Sentadilla','position',0,'setNumber',2,'weightKg',60,'reps',0,'isWarmup',false)))) $$,
  '23514', null, 'una serie con 0 repeticiones falla');
select is((select count(*)::int from public.workouts where id = 'd0000000-0000-0000-0000-0000000000a3'), 0,
  'y no deja el entrenamiento a medias');

-- T161: el transporte JSON no puede eludir la semana de inicio.
select throws_ok($$select public.save_workout(pg_temp.payload('d0000000-0000-0000-0000-000000000161','a2000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-00000000000a',pg_temp.sets_ok()) || '{"startedAt":"2025-03-11T15:00:00Z","finishedAt":"2025-03-11T16:00:00Z"}'::jsonb)$$,'P0002',null,'la base rechaza una semana de inicio incorrecta');
select is((select count(*)::int from public.workouts where id='d0000000-0000-0000-0000-000000000161'),0,'no deja registro parcial de otra semana');

-- Una sesión de otro alumno no se puede usar
select throws_ok(
  $$ select public.save_workout(pg_temp.payload('d0000000-0000-0000-0000-0000000000a4', 'a2000000-0000-0000-0000-00000000000b',
       'a1000000-0000-0000-0000-00000000000b', pg_temp.sets_ok())) $$,
  'P0002', null, 'no se guarda sobre la sesión planificada de otro alumno');
reset role;

-- Un id que ya usa otro usuario no se puede reclamar (y no se revela quién)
select tests.authenticate_as(tests.student_b_id());
select throws_ok(
  $$ select public.save_workout(pg_temp.payload('d0000000-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-00000000000b',
       'a1000000-0000-0000-0000-00000000000b', pg_temp.sets_ok())) $$,
  '23505', null, 'un id usado por otro alumno da conflicto');
select is((select count(*)::int from public.workouts where student_id = tests.student_b_id()), 0, 'sin crear nada para B');
reset role;

-- El coach llama con su propia sesión: la RLS le impide guardar a nombre de un alumno
select tests.authenticate_as(tests.coach_id());
select throws_ok(
  $$ select public.save_workout(pg_temp.payload('d0000000-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-00000000000a',
       'a1000000-0000-0000-0000-00000000000a', pg_temp.sets_ok())) $$,
  '42501', null, 'el coach no puede reenviar el entrenamiento de un alumno');
reset role;

select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.save_workout('{}'::jsonb) $$, '42501', null, 'un visitante no puede ejecutarla');
reset role;

-- T152: las escrituras directas tampoco permiten una sustitución arbitraria.
select tests.authenticate_as(tests.student_a_id());
select throws_ok($$ insert into public.workout_sets(workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps)
values('d0000000-0000-0000-0000-0000000000a1',auth.uid(),'e0000000-0000-0000-0000-000000000002','Press',0,3,20,8) $$,
'P0001',null,'rechaza alternativa no autorizada directamente');
reset role;
select throws_ok($$ update public.workout_sets set exercise_id='e0000000-0000-0000-0000-000000000002'
where workout_id='d0000000-0000-0000-0000-0000000000a1' $$,
'P0001',null,'identidad histórica inmutable');
reset role;
insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max)
select id,'e0000000-0000-0000-0000-000000000002',0,2,6,10 from public.session_exercises
where program_session_id='a2000000-0000-0000-0000-00000000000a' and position=0;
select tests.authenticate_as(tests.student_a_id());
select is(public.save_workout(pg_temp.payload('d0000000-0000-0000-0000-0000000000a5',
'a2000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-00000000000a',
jsonb_build_array(jsonb_build_object('exerciseId','e0000000-0000-0000-0000-000000000002','exerciseName','Inventado',
'position',0,'setNumber',1,'weightKg',20,'reps',8))))->>'status','created','alternativa autorizada válida');
select is((select prescribed_exercise_name from public.workout_sets where workout_id='d0000000-0000-0000-0000-0000000000a5'),
'Sentadilla','conserva nombre original');
select is((select exercise_name from public.workout_sets where workout_id='d0000000-0000-0000-0000-0000000000a5'),
'Press de banca','nombre realizado canónico');
select throws_ok($$ insert into public.workout_sets(workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps)
values('d0000000-0000-0000-0000-0000000000a5',auth.uid(),'e0000000-0000-0000-0000-000000000001','Sentadilla',0,2,20,8) $$,
'P0001',null,'no mezcla original y alternativa en una posición');
reset role;
delete from public.programs where id='a1000000-0000-0000-0000-00000000000a';
select is((select prescribed_exercise_name from public.workout_sets where workout_id='d0000000-0000-0000-0000-0000000000a5'),
'Sentadilla','borrar rutina conserva el nombre prescrito');

select tests.authenticate_as(tests.student_a_id());
select is(public.save_workout(pg_temp.payload('d0000000-0000-0000-0000-0000000000a1','a2000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-00000000000a',pg_temp.sets_ok()))->>'status','duplicate','confirma una respuesta perdida tras borrar la rutina');
select is((select count(*)::int from public.workout_sets where workout_id='d0000000-0000-0000-0000-0000000000a1'),3,'confirmar no cambia las series originales');
reset role;

select * from finish();
rollback;
