-- T219 · Exact count without materializing a nested history.
begin;
select no_plan();
select has_function('public','count_visible_workouts',array['uuid'],'recuento exacto con RLS');
select isnt_definer('public','count_visible_workouts',array['uuid'],'no evita RLS');
select volatility_is('public','count_visible_workouts',array['uuid'],'stable','instantánea coherente');
select is((select p.proconfig[1] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='count_visible_workouts'),'search_path=""','resolución cerrada');
select ok(not has_function_privilege('anon','public.count_visible_workouts(uuid)','EXECUTE'),'anónimo no ejecuta');
select ok(has_function_privilege('authenticated','public.count_visible_workouts(uuid)','EXECUTE'),'miembro autenticado ejecuta con RLS');
select tests.setup_basic();
select tests.create_profile('a0000000-0000-4000-8000-00000000000c','student','Alumno C',tests.coach_id());
insert into public.exercises(id,name,muscle_group) values('e0000000-0000-4000-8000-000000000001','Recuento','Piernas');
insert into public.workouts(id,student_id,started_at,finished_at,duration_seconds) values
 ('90000000-0000-4000-8000-000000000001',tests.student_a_id(),now(),now(),0),
 ('90000000-0000-4000-8000-000000000002',tests.student_a_id(),now(),now(),0),
 ('90000000-0000-4000-8000-000000000003',tests.student_b_id(),now(),now(),0),
 ('90000000-0000-4000-8000-000000000004',tests.coach_id(),now(),now(),0);
insert into public.workout_sets(workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps,is_warmup) values
 ('90000000-0000-4000-8000-000000000001',tests.student_a_id(),'e0000000-0000-4000-8000-000000000001','Recuento',0,1,60,8,false),
 ('90000000-0000-4000-8000-000000000001',tests.student_a_id(),'e0000000-0000-4000-8000-000000000001','Recuento',0,2,60,8,false),
 ('90000000-0000-4000-8000-000000000003',tests.student_b_id(),'e0000000-0000-4000-8000-000000000001','Recuento',0,1,60,8,true),
 ('90000000-0000-4000-8000-000000000004',tests.coach_id(),'e0000000-0000-4000-8000-000000000001','Recuento',0,1,60,8,false);
select tests.authenticate_as(tests.student_a_id());
select is(public.count_visible_workouts(tests.student_a_id()),1::bigint,'varias series cuentan un encabezado; vacío no cuenta');
select is(public.count_visible_workouts(tests.student_b_id()),0::bigint,'otro alumno devuelve0');
select is(public.count_visible_workouts('00000000-0000-4000-8000-000000000001'),0::bigint,'inexistente indistinguible');
select is(public.count_visible_workouts(null),0::bigint,'sin destino no descubre perfiles');
reset role;
select tests.authenticate_as(tests.coach_id());
select is(public.count_visible_workouts(tests.student_a_id()),1::bigint,'coach ve primer alumno');
select is(public.count_visible_workouts(tests.student_b_id()),1::bigint,'calentamiento mantiene definición anterior');
select is(public.count_visible_workouts(tests.coach_id()),1::bigint,'coach entrena con identidad propia');
select is(public.count_visible_workouts('a0000000-0000-4000-8000-00000000000c'),0::bigint,'tercer alumno verdaderamente vacío');
reset role;
update public.profiles set is_active=false where id=tests.student_b_id();
select tests.authenticate_as(tests.student_b_id());
select throws_ok($$select public.count_visible_workouts(tests.student_b_id())$$,'42501',null,'inactivo sin cero exitoso');
reset role;
select tests.authenticate_as(tests.coach_id());
select is(public.count_visible_workouts(tests.student_b_id()),1::bigint,'coach puede revisar alumno desactivado');
reset role;
select tests.authenticate_as_anon();
select throws_ok($$select public.count_visible_workouts(tests.student_a_id())$$,'42501',null,'anónimo rechazado');
reset role;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.count_visible_workouts(tests.student_a_id())$$,'42501',null,'sin identidad no cuenta');
insert into public.workouts(id,student_id,started_at,finished_at,duration_seconds)
 select gen_random_uuid(),tests.student_a_id(),now(),now(),0 from generate_series(1,1000);
insert into public.workout_sets(workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps)
 select w.id,tests.student_a_id(),'e0000000-0000-4000-8000-000000000001','Recuento',0,1,60,8 from public.workouts w where w.student_id=tests.student_a_id() and w.id<>'90000000-0000-4000-8000-000000000002' and not exists(select from public.workout_sets s where s.workout_id=w.id);
insert into public.workouts(id,student_id,started_at,finished_at,duration_seconds)
 select gen_random_uuid(),tests.student_a_id(),now(),now(),0 from generate_series(1,8999);
select tests.authenticate_as(tests.student_a_id());
select is(public.count_visible_workouts(tests.student_a_id()),1001::bigint,'10001encabezados: total exacto sobre1000, sin contar vacíos');
reset role;
select tests.authenticate_as(tests.coach_id());
select is(public.count_visible_workouts(tests.student_a_id()),1001::bigint,'mismo total exacto al revisar como coach');
reset role;
select tests.authenticate_as('a0000000-0000-4000-8000-00000000000c');
select is(public.count_visible_workouts(tests.student_a_id()),0::bigint,'historial grande sigue privado');
select * from finish();
rollback;
