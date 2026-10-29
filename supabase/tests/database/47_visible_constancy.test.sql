-- T219 · Complete, thin constancy evidence under caller RLS.
begin;
select no_plan();
select has_function('public','get_visible_constancy',array['uuid'],'constancia completa con RLS');
select isnt_definer('public','get_visible_constancy',array['uuid'],'lector invoker');
select volatility_is('public','get_visible_constancy',array['uuid'],'stable','una instantánea');
select is((select p.proconfig[1] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_visible_constancy'),'search_path=""','nombres cerrados');
select ok(not has_function_privilege('anon','public.get_visible_constancy(uuid)','EXECUTE'),'anon no ejecuta');
select ok(has_function_privilege('authenticated','public.get_visible_constancy(uuid)','EXECUTE'),'authenticated con RLS');
select tests.setup_basic();
select tests.create_profile('a0000000-0000-4000-8000-00000000000c','student','Alumno C',tests.coach_id());
insert into public.exercises(id,name,muscle_group) values('e0000000-0000-4000-8000-000000000001','Constancia','Piernas');
insert into public.programs(id,coach_id,student_id,name,weeks_count,start_date,ends_on) values
 ('b0000000-0000-4000-8000-000000000001',tests.coach_id(),tests.student_a_id(),'A',2,'2026-10-05','2026-10-18'),
 ('b0000000-0000-4000-8000-000000000002',tests.coach_id(),tests.student_b_id(),'B',1,'2026-10-05','2026-10-11'),
 ('b0000000-0000-4000-8000-000000000003',tests.coach_id(),tests.coach_id(),'Propio',1,'2026-10-05','2026-10-11');
insert into public.program_sessions(id,program_id,week_number,label) values
 ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',1,'A'),
 ('c0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002',1,'A'),
 ('c0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000003',1,'A'),
 ('c0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000001',2,'B');
insert into public.session_exercises(program_session_id,exercise_id,position,sets,reps_min,reps_max)
 select id,'e0000000-0000-4000-8000-000000000001',0,1,8,12 from public.program_sessions;
insert into public.workouts(id,student_id,program_id,program_session_id,started_at,finished_at,duration_seconds) values
 ('90000000-0000-4000-8000-000000000001',tests.student_a_id(),'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','2026-10-06 15:00Z','2026-10-06 16:00Z',3600),
 ('90000000-0000-4000-8000-000000000002',tests.student_a_id(),'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','2026-10-07 15:00Z','2026-10-07 16:00Z',3600),
 ('90000000-0000-4000-8000-000000000003',tests.student_b_id(),'b0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002','2026-10-06 15:00Z','2026-10-06 16:00Z',3600),
 ('90000000-0000-4000-8000-000000000004',tests.coach_id(),'b0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000003','2026-10-06 15:00Z','2026-10-06 16:00Z',3600),
 ('90000000-0000-4000-8000-000000000005',tests.student_a_id(),null,null,'2026-10-06 15:00Z','2026-10-06 16:00Z',3600),
 ('90000000-0000-4000-8000-000000000006',tests.student_a_id(),'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000004','2026-10-13 15:00Z','2026-10-13 16:00Z',3600);
insert into public.workout_sets(workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps,is_warmup) values
 ('90000000-0000-4000-8000-000000000001',tests.student_a_id(),'e0000000-0000-4000-8000-000000000001','Constancia',0,1,30,8,false),
 ('90000000-0000-4000-8000-000000000001',tests.student_a_id(),'e0000000-0000-4000-8000-000000000001','Constancia',0,2,20,8,true),
 ('90000000-0000-4000-8000-000000000003',tests.student_b_id(),'e0000000-0000-4000-8000-000000000001','Constancia',0,1,20,8,true),
 ('90000000-0000-4000-8000-000000000004',tests.coach_id(),'e0000000-0000-4000-8000-000000000001','Constancia',0,1,30,8,false),
 ('90000000-0000-4000-8000-000000000005',tests.student_a_id(),'e0000000-0000-4000-8000-000000000001','Constancia',0,1,30,8,false),
 ('90000000-0000-4000-8000-000000000006',tests.student_a_id(),'e0000000-0000-4000-8000-000000000001','Constancia',0,1,30,8,false);
delete from public.program_sessions where id='c0000000-0000-4000-8000-000000000004';
select tests.authenticate_as(tests.student_a_id());
select is(public.get_visible_constancy(tests.student_a_id())->>'version','1','contrato1');
select is(public.get_visible_constancy(tests.student_a_id())->>'studentId',tests.student_a_id()::text,'destinatario exacto');
select is(jsonb_array_length(public.get_visible_constancy(tests.student_a_id())->'programs'),1,'programa propio');
select is(jsonb_array_length(public.get_visible_constancy(tests.student_a_id())->'sessions'),1,'sesiones vigentes propias');
select is(jsonb_array_length(public.get_visible_constancy(tests.student_a_id())->'workouts'),2,'solo asignados no vacíos, incluida referencia histórica nula');
select is(public.get_visible_constancy(tests.student_a_id())->'workouts'->0->>'setCount','2','calentamientos mantienen definición anterior');
select is(public.get_visible_constancy(tests.student_a_id())->'workouts'->1->'programSessionId','null'::jsonb,'no reconstruye la sesión eliminada');
select ok(not ((public.get_visible_constancy(tests.student_a_id())->'workouts'->0)?'note'),'fuente mínima sin notas/performance');
select is(public.get_visible_constancy(tests.student_b_id()),null::jsonb,'ajeno invisible');
select is(public.get_visible_constancy('00000000-0000-4000-8000-000000000001'),null::jsonb,'inexistente indistinguible');
reset role;
select tests.authenticate_as(tests.coach_id());
select is(jsonb_array_length(public.get_visible_constancy(tests.student_a_id())->'workouts'),2,'coach revisa A');
select is(jsonb_array_length(public.get_visible_constancy(tests.student_b_id())->'workouts'),1,'coach revisa B');
select is(jsonb_array_length(public.get_visible_constancy(tests.coach_id())->'workouts'),1,'coach propio');
reset role;
select tests.authenticate_as('a0000000-0000-4000-8000-00000000000c');
select is(public.get_visible_constancy('a0000000-0000-4000-8000-00000000000c')->'programs','[]'::jsonb,'tercer alumno vacío real');
select is(public.get_visible_constancy(tests.student_a_id()),null::jsonb,'tercero no consulta A');
reset role;
update public.profiles set is_active=false where id=tests.student_b_id();
select tests.authenticate_as(tests.student_b_id());
select throws_ok($$select public.get_visible_constancy(tests.student_b_id())$$,'42501',null,'inactivo rechazado');
reset role;
select tests.authenticate_as(tests.coach_id());
select is(jsonb_array_length(public.get_visible_constancy(tests.student_b_id())->'workouts'),1,'coach conserva revisión de desactivado');
reset role;
select tests.authenticate_as_anon();
select throws_ok($$select public.get_visible_constancy(tests.student_a_id())$$,'42501',null,'anónimo rechazado');
reset role;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.get_visible_constancy(tests.student_a_id())$$,'42501',null,'sin identidad no recibe ceros');
-- One JSON row carries all1001programs/sessions, not a truncated REST list.
create temp table constancy_extra as select gen_random_uuid() program_id,gen_random_uuid() session_id,gen_random_uuid() workout_id,date '2000-01-03'+7*g start_date from generate_series(1,1000) g;
insert into public.programs(id,coach_id,student_id,name,weeks_count,start_date,ends_on)
 select program_id,tests.coach_id(),tests.student_a_id(),'Completo',1,start_date,start_date+6 from constancy_extra;
insert into public.program_sessions(id,program_id,week_number,label) select session_id,program_id,1,'A' from constancy_extra;
insert into public.session_exercises(program_session_id,exercise_id,position,sets,reps_min,reps_max)
 select session_id,'e0000000-0000-4000-8000-000000000001',0,1,8,12 from constancy_extra;
insert into public.workouts(id,student_id,program_id,program_session_id,started_at,finished_at,duration_seconds)
 select workout_id,tests.student_a_id(),program_id,session_id,start_date+time '15:00',start_date+time '15:00',0 from constancy_extra;
insert into public.workout_sets(workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps)
 select workout_id,tests.student_a_id(),'e0000000-0000-4000-8000-000000000001','Constancia',0,1,30,8 from constancy_extra;
select tests.authenticate_as(tests.student_a_id());
select is(jsonb_array_length(public.get_visible_constancy(tests.student_a_id())->'programs'),1001,'1001programas completos');
select is(jsonb_array_length(public.get_visible_constancy(tests.student_a_id())->'sessions'),1001,'1001sesiones completas');
select is(jsonb_array_length(public.get_visible_constancy(tests.student_a_id())->'workouts'),1002,'1002evidencias completas');
reset role;
-- Unlinked/empty history must not consume the relevant-workout bound.
insert into public.workouts(id,student_id,started_at,finished_at,duration_seconds)
 select gen_random_uuid(),'a0000000-0000-4000-8000-00000000000c',now(),now(),0 from generate_series(1,10001);
select tests.authenticate_as('a0000000-0000-4000-8000-00000000000c');
select is(public.get_visible_constancy('a0000000-0000-4000-8000-00000000000c')->'workouts','[]'::jsonb,'10001libres no bloquean constancia sin programa');
reset role;
insert into public.programs(coach_id,student_id,name,weeks_count,start_date,ends_on)
 select tests.coach_id(),'a0000000-0000-4000-8000-00000000000c','Límite programas',1,date '2000-01-03'+7*g,date '2000-01-09'+7*g from generate_series(1,10001) g;
select tests.authenticate_as('a0000000-0000-4000-8000-00000000000c');
select throws_ok($$select public.get_visible_constancy('a0000000-0000-4000-8000-00000000000c')$$,'0A000',null,'capacidad programas explícita');
reset role;
delete from public.programs where student_id='a0000000-0000-4000-8000-00000000000c';
create temp table constancy_capacity as select gen_random_uuid() id,g n from generate_series(1,1000) g;
insert into public.programs(id,coach_id,student_id,name,weeks_count,start_date,ends_on)
 select id,tests.coach_id(),'a0000000-0000-4000-8000-00000000000c','Límite sesiones',16,date '2000-01-03'+112*(n-1),date '2000-04-23'+112*(n-1) from constancy_capacity;
insert into public.program_sessions(program_id,week_number,label,position)
 select p.id,(g-1)/7+1,chr(65+(g-1)%7),(g-1)%7 from constancy_capacity p cross join generate_series(1,112) g order by p.n,g limit 100001;
select tests.authenticate_as('a0000000-0000-4000-8000-00000000000c');
select throws_ok($$select public.get_visible_constancy('a0000000-0000-4000-8000-00000000000c')$$,'0A000',null,'capacidad sesiones explícita');
reset role;
create temp table constancy_many_workouts as select gen_random_uuid() id from generate_series(1,9000);
insert into public.workouts(id,student_id,program_id,program_session_id,started_at,finished_at,duration_seconds)
 select id,tests.student_a_id(),'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','2026-10-06 15:00Z','2026-10-06 15:00Z',0 from constancy_many_workouts;
insert into public.workout_sets(workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps)
 select id,tests.student_a_id(),'e0000000-0000-4000-8000-000000000001','Constancia',0,1,30,8 from constancy_many_workouts;
select tests.authenticate_as(tests.student_a_id());
select throws_ok($$select public.get_visible_constancy(tests.student_a_id())$$,'0A000',null,'capacidad evidencia explícita');
select * from finish();
rollback;
