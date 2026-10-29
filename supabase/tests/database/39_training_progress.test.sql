begin;
select no_plan();
select tests.setup_basic();
select tests.create_profile('a0000000-0000-4000-8000-00000000000c','student','C',tests.coach_id());
select has_function('public','get_own_training_progress',array[]::text[],'snapshot completo propio');
select isnt_definer('public','get_own_training_progress',array[]::text[],'lectura invoker');
select volatility_is('public','get_own_training_progress',array[]::text[],'stable','un snapshot estable');
select ok(not has_function_privilege('anon','public.get_own_training_progress()','EXECUTE'),'anónimo sin permiso');
select ok(has_function_privilege('authenticated','public.get_own_training_progress()','EXECUTE'),'autenticado consulta');
insert into public.exercises(id,name,muscle_group) values('e0000000-0000-4000-8000-000000000001','Nombre actual','Piernas');
insert into public.exercises(id,personal_owner_id,name,muscle_group,record_type,archived_at)
 values('e0000000-0000-4000-8000-000000000002',tests.student_a_id(),'Tiempo propio archivado','Core','duration',now());
insert into public.workouts(id,student_id,started_at,finished_at,duration_seconds,note) values
 ('90000000-0000-4000-8000-000000000001',tests.student_a_id(),'2026-10-01 01:00Z','2026-10-01 02:00Z',3600,'Nota propia'),
 ('90000000-0000-4000-8000-000000000002',tests.student_b_id(),'2026-10-02 16:00Z','2026-10-02 17:00Z',3600,'Nota ajena'),
 ('90000000-0000-4000-8000-000000000003',tests.coach_id(),'2026-10-03 16:00Z','2026-10-03 17:00Z',3600,'Nota del coach');
insert into public.workout_sets(workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps,is_warmup) values
 ('90000000-0000-4000-8000-000000000001',tests.student_a_id(),'e0000000-0000-4000-8000-000000000001','Nombre histórico',0,1,60,8,false),
 ('90000000-0000-4000-8000-000000000002',tests.student_b_id(),'e0000000-0000-4000-8000-000000000001','Ajeno',0,1,60,8,false);
select tests.authenticate_as(tests.student_a_id());
select is(public.get_own_training_progress()->>'userId',tests.student_a_id()::text,'cuenta del token');
select is(jsonb_array_length(public.get_own_training_progress()->'workouts'),1,'solo registros propios');
select is(public.get_own_training_progress()->'workouts'->0->>'date','2026-09-30','fecha Santiago conservada');
select is(public.get_own_training_progress()->'workouts'->0->'sets'->0->>'name','Nombre histórico','no sustituye nombre registrado');
select is(public.get_own_training_progress()->'workouts'->0->'sets'->0->>'muscleGroup','Piernas','clasificación actual visible');
select is(public.get_own_training_progress()->'workouts'->0->'sets'->0->'metrics'->>'recordType',null,'tipo anterior no inferido');
reset role;
select tests.authenticate_as(tests.coach_id());
select is(jsonb_array_length(public.get_own_training_progress()->'workouts'),1,'coach solo propia actividad, no suma alumnos');
select is(public.get_own_training_progress()->'workouts'->0->>'note','Nota del coach','no expone notas de alumno');
reset role;
select tests.authenticate_as('a0000000-0000-4000-8000-00000000000c');
select is(public.get_own_training_progress()->'workouts','[]'::jsonb,'tercer alumno vacío verdadero');
reset role;
update public.profiles set is_active=false where id=tests.student_b_id();
select tests.authenticate_as(tests.student_b_id());
select throws_ok($$select public.get_own_training_progress()$$,'42501',null,'desactivado rechazado');
reset role;
select tests.authenticate_as_anon();
select throws_ok($$select public.get_own_training_progress()$$,'42501',null,'anónimo rechazado');
reset role;
-- Incluso un snapshot vacío exige identidad; no se usa service role para la lectura de producto.
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.get_own_training_progress()$$,'42501',null,'sin identidad no obtiene snapshot');
reset role;
insert into public.workouts(id,student_id,started_at,finished_at,duration_seconds)
 select gen_random_uuid(),tests.student_a_id(),now(),now(),0 from generate_series(1,10000);
select tests.authenticate_as(tests.student_a_id());
select throws_ok($$select public.get_own_training_progress()$$,'0A000',null,'capacidad rechaza snapshot parcial');
select * from finish();
rollback;
