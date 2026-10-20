begin;
select no_plan();
select tests.setup_basic();
insert into public.exercises (id,name,muscle_group) values ('e0000000-0000-0000-0000-000000000001','Press','Pecho');
insert into public.programs (id,coach_id,name,weeks_count) values ('a1000000-0000-0000-0000-000000000001',tests.coach_id(),'Atomic',2);
insert into public.program_sessions(id,program_id,week_number,label) values ('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',1,'A');
insert into public.session_exercises(id,program_session_id,exercise_id,sets,reps_min,reps_max) values ('a3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',3,8,12);
select ok((select relrowsecurity from pg_class where oid='public.routine_mutations'::regclass),'recibos con RLS');
select isnt_definer('public','mutate_routine_session',array['uuid','integer','uuid','jsonb','uuid[]','text','integer'],'RPC respeta RLS');
select tests.authenticate_as(tests.coach_id());
select is((select revision from public.program_sessions limit 1),1,'inserción incrementa revisión');
select lives_ok($$select public.mutate_routine_session('a2000000-0000-0000-0000-000000000001',1,'a4000000-0000-0000-0000-000000000001',null,array['a3000000-0000-0000-0000-000000000001']::uuid[])$$,'coach ordena');
select lives_ok($$select public.mutate_routine_session('a2000000-0000-0000-0000-000000000001',1,'a4000000-0000-0000-0000-000000000001',null,array['a3000000-0000-0000-0000-000000000001']::uuid[])$$,'reintento confirmado');
select is((select count(*)::int from public.routine_mutations),1,'un recibo');
select throws_ok($$select public.mutate_routine_session('a2000000-0000-0000-0000-000000000001',1,gen_random_uuid(),null,array['a3000000-0000-0000-0000-000000000001']::uuid[])$$,'40001',null,'revisión antigua rechazada');
update public.session_exercises set note='Nota remota',target_weight_kg=75;
select lives_ok($$select public.mutate_routine_session('a2000000-0000-0000-0000-000000000001',
(select revision from public.program_sessions limit 1),gen_random_uuid(),
'[{"id":"a3000000-0000-0000-0000-000000000001","exerciseId":"e0000000-0000-0000-0000-000000000001","sets":4,"repsMin":8,"repsMax":12,"targetWeightKg":0,"note":"Antigua","fields":["sets"]}]'::jsonb)$$,'parche de series válido');
select is((select note from public.session_exercises limit 1),'Nota remota','conserva nota no elegida');
select is((select target_weight_kg::numeric from public.session_exercises limit 1),75::numeric,'conserva peso no elegido');
select throws_ok($$select public.mutate_routine_session('a2000000-0000-0000-0000-000000000001',
(select revision from public.program_sessions limit 1),gen_random_uuid(),
'[{"id":"a3000000-0000-0000-0000-000000000001","exerciseId":"e0000000-0000-0000-0000-000000000001","fields":["exerciseId"]}]'::jsonb)$$,'22023',null,'no permite elegir identidad como campo');
select throws_ok($$select public.mutate_routine_session('a2000000-0000-0000-0000-000000000001',
(select revision from public.program_sessions limit 1),gen_random_uuid(),
'[{"id":"a3000000-0000-0000-0000-000000000001","exerciseId":"e0000000-0000-0000-0000-000000000001","fields":["restSeconds"]}]'::jsonb)$$,'22023',null,'no borra un descanso cuyo valor se omitió');
reset role;
update public.programs set student_id=tests.student_a_id(),start_date=tests.current_monday(),ends_on=tests.current_monday()+13;
select tests.authenticate_as(tests.coach_id());
select throws_ok($$select public.mutate_routine_session('a2000000-0000-0000-0000-000000000001',2,gen_random_uuid(),null,array['a3000000-0000-0000-0000-000000000001']::uuid[])$$,'55000',null,'semana actual bloqueada');
reset role;
select tests.authenticate_as(tests.student_a_id());
select is((select count(*)::int from public.routine_mutations),0,'alumno no ve recibos del coach');
select throws_ok($$select public.mutate_routine_session('a2000000-0000-0000-0000-000000000001',2,gen_random_uuid(),null,array['a3000000-0000-0000-0000-000000000001']::uuid[])$$,'42501',null,'alumno no edita');
reset role;
select tests.authenticate_as_anon();
select throws_ok($$select public.mutate_routine_session('a2000000-0000-0000-0000-000000000001',2,gen_random_uuid(),null,array['a3000000-0000-0000-0000-000000000001']::uuid[])$$,'42501',null,'anónimo no ejecuta');
reset role;
update public.profiles set is_active=false where id=tests.coach_id();
select tests.authenticate_as(tests.coach_id());
select throws_ok($$select public.mutate_routine_session('a2000000-0000-0000-0000-000000000001',2,gen_random_uuid(),null,array['a3000000-0000-0000-0000-000000000001']::uuid[])$$,'42501',null,'coach inactivo no edita');
reset role;
delete from public.programs;
select is((select count(*)::int from public.routine_mutations),0,'recibos se borran en cascada');
select * from finish();
rollback;
