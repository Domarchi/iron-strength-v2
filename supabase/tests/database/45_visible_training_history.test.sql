-- T219 · Complete, authorized review/export snapshot without scalar metric conversion.
begin;
select no_plan();
select tests.setup_basic();
select tests.create_profile('a0000000-0000-4000-8000-00000000000c','student','Alumno C',tests.coach_id());
select has_function('public','get_visible_training_history',array['uuid'],'fuente completa visible');
select isnt_definer('public','get_visible_training_history',array['uuid'],'lectura invoker');
select volatility_is('public','get_visible_training_history',array['uuid'],'stable','instantánea coherente');
select is((select p.proconfig[1] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_visible_training_history'),'search_path=""','resolución de nombres cerrada');
select ok(not has_function_privilege('anon','public.get_visible_training_history(uuid)','EXECUTE'),'anónimo no ejecuta');
select ok(has_function_privilege('authenticated','public.get_visible_training_history(uuid)','EXECUTE'),'miembro autenticado ejecuta con RLS');
insert into public.exercises(id,name,muscle_group) values('e0000000-0000-4000-8000-000000000001','Nombre actual','Piernas');
insert into public.workouts(id,student_id,started_at,finished_at,duration_seconds,note) values
 ('90000000-0000-4000-8000-000000000001',tests.student_a_id(),'2026-10-01 01:00Z','2026-10-01 02:00Z',3600,'Nota propia'),
 ('90000000-0000-4000-8000-000000000002',tests.student_b_id(),'2026-10-02 16:00Z','2026-10-02 17:00Z',3600,'Nota ajena'),
 ('90000000-0000-4000-8000-000000000003',tests.coach_id(),'2026-10-03 16:00Z','2026-10-03 17:00Z',3600,'Nota del coach');
insert into public.workout_sets(workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps,is_warmup) values
 ('90000000-0000-4000-8000-000000000001',tests.student_a_id(),'e0000000-0000-4000-8000-000000000001','Nombre histórico',0,1,60,8,false),
 ('90000000-0000-4000-8000-000000000002',tests.student_b_id(),'e0000000-0000-4000-8000-000000000001','Ajeno',0,1,60,8,false);
select tests.authenticate_as(tests.student_a_id());
select is(public.get_visible_training_history(tests.student_a_id())->>'version','1','contrato nuevo explícito');
select is(public.get_visible_training_history(tests.student_a_id())->'student'->>'id',tests.student_a_id()::text,'identidad solicitada propia');
select is(public.get_visible_training_history(tests.student_a_id())->'student'->>'name','Alumno A','nombre permitido por RLS');
select is(public.get_visible_training_history(tests.student_a_id())->>'today',((now() at time zone 'America/Santiago')::date)::text,'corte Santiago');
select is(jsonb_array_length(public.get_visible_training_history(tests.student_a_id())->'workouts'),1,'solo encabezados propios');
select is(public.get_visible_training_history(tests.student_b_id()),null::jsonb,'otro alumno no existe para esta cuenta');
select is(public.get_visible_training_history('00000000-0000-4000-8000-000000000001'),null::jsonb,'no revela existencia por resultado diferente');
select is(public.get_visible_training_history(null),null::jsonb,'identidad ausente no descubre perfiles');
select is(public.get_visible_training_history(tests.student_a_id())->'workouts'->0->>'date','2026-09-30','conserva la fecha generada original');
select is(public.get_visible_training_history(tests.student_a_id())->'workouts'->0->>'note','Nota propia','conserva nota global');
select is(public.get_visible_training_history(tests.student_a_id())->'workouts'->0->'structure','null'::jsonb,'no reconstruye estructura anterior');
select is(public.get_visible_training_history(tests.student_a_id())->'workouts'->0->'exerciseNotes','null'::jsonb,'no inventa notas anteriores');
select is(public.get_visible_training_history(tests.student_a_id())->'workouts'->0->'sets'->0->>'name','Nombre histórico','nombre realizado histórico');
select is(public.get_visible_training_history(tests.student_a_id())->'workouts'->0->'sets'->0->>'muscleGroup','Piernas','clasificación visible actual');
select is(public.get_visible_training_history(tests.student_a_id())->'workouts'->0->'sets'->0->'metrics',jsonb_build_object('recordType',null,'weightKg',60,'reps',8,'durationSeconds',null,'distanceMeters',null),'métricas anteriores sin duración o distancia inventadas');
select is(public.get_visible_training_history(tests.student_a_id())->'workouts'->0->'sets'->0->>'setType','working','clase anterior preservada');
select is(public.get_visible_training_history(tests.student_a_id())->'workouts'->0->'sets'->0->'effort','null'::jsonb,'sin esfuerzo de serie ficticio');
reset role;
select tests.authenticate_as(tests.coach_id());
select is(jsonb_array_length(public.get_visible_training_history(tests.student_a_id())->'workouts'),1,'coach revisa a su alumno');
select is(public.get_visible_training_history(tests.student_a_id())->'workouts'->0->>'note','Nota propia','coach consulta evidencia real');
select is(jsonb_array_length(public.get_visible_training_history(tests.coach_id())->'workouts'),1,'coach conserva su entrenamiento propio');
select is(public.get_visible_training_history(tests.coach_id())->'workouts'->0->>'note','Nota del coach','no mezcla alumnos con su registro');
select is(jsonb_array_length(public.get_own_training_progress()->'workouts'),1,'RPC propio anterior conserva su alcance');
reset role;
select tests.authenticate_as('a0000000-0000-4000-8000-00000000000c');
select is(public.get_visible_training_history('a0000000-0000-4000-8000-00000000000c')->'workouts','[]'::jsonb,'tercer alumno vacío verdadero');
select is(public.get_visible_training_history(tests.student_a_id()),null::jsonb,'tercer alumno no lee al primero');
reset role;
update public.profiles set is_active=false where id=tests.student_b_id();
select tests.authenticate_as(tests.student_b_id());
select throws_ok($$select public.get_visible_training_history(tests.student_b_id())$$,'42501',null,'inactivo sin snapshot exitoso');
reset role;
select tests.authenticate_as(tests.coach_id());
select is(jsonb_array_length(public.get_visible_training_history(tests.student_b_id())->'workouts'),1,'coach puede revisar historial de alumno desactivado');
reset role;
select tests.authenticate_as_anon();
select throws_ok($$select public.get_visible_training_history(tests.student_a_id())$$,'42501',null,'anónimo sin datos');
reset role;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.get_visible_training_history(tests.student_a_id())$$,'42501',null,'sin identidad no recibe documento vacío');
-- JSON aggregation returns one complete result, rather than the REST limit of1000 rows.
insert into public.workouts(id,student_id,started_at,finished_at,duration_seconds)
 select gen_random_uuid(),tests.student_a_id(),now(),now(),0 from generate_series(1,1000);
insert into public.workout_sets(workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps)
 select w.id,tests.student_a_id(),'e0000000-0000-4000-8000-000000000001','Nombre actual',0,1,60,8 from public.workouts w where w.student_id=tests.student_a_id() and not exists(select from public.workout_sets s where s.workout_id=w.id);
select tests.authenticate_as(tests.student_a_id());
select is(jsonb_array_length(public.get_visible_training_history(tests.student_a_id())->'workouts'),1001,'más de1000entrenamientos completos');
select is((select sum(jsonb_array_length(w->'sets'))::integer from jsonb_array_elements(public.get_visible_training_history(tests.student_a_id())->'workouts') w),1001,'más de1000series completas');
reset role;
insert into public.workouts(id,student_id,started_at,finished_at,duration_seconds)
 select gen_random_uuid(),tests.student_a_id(),now(),now(),0 from generate_series(1,9000);
select tests.authenticate_as(tests.student_a_id());
select throws_ok($$select public.get_visible_training_history(tests.student_a_id())$$,'0A000',null,'capacidad explícita, nunca archivo parcial');
select * from finish();
rollback;
