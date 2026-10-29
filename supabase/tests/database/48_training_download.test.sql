-- T220 · Read-only own complete download. Fixtures roll back in isolated tests only.
begin;
select no_plan();
select has_function('public','get_own_training_download',array[]::text[],'fuente completa propia');
select isnt_definer('public','get_own_training_download',array[]::text[],'invoker sin admin');
select volatility_is('public','get_own_training_download',array[]::text[],'stable','misma instantánea');
select is((select p.proconfig[1] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_own_training_download'),'search_path=""','nombres cerrados');
select ok(not has_function_privilege('anon','public.get_own_training_download()','EXECUTE'),'anon no ejecuta');
select ok(has_function_privilege('authenticated','public.get_own_training_download()','EXECUTE'),'authenticated con RLS');
select tests.setup_basic();
select tests.create_profile('a0000000-0000-4000-8000-00000000000c','student','Alumno C',tests.coach_id());
insert into public.exercises(id,name,muscle_group,personal_owner_id) values
 ('e0000000-0000-4000-8000-000000000001','Global','Core',null),
 ('e0000000-0000-4000-8000-000000000002','Solo A','Core',tests.student_a_id()),
 ('e0000000-0000-4000-8000-000000000003','Solo B','Core',tests.student_b_id());
insert into public.personal_routines(id,owner_id,name,position) values
 ('f0000000-0000-4000-8000-000000000001',tests.student_a_id(),'Rutina A',0),
 ('f0000000-0000-4000-8000-000000000002',tests.student_b_id(),'Rutina B',0);
insert into public.personal_routine_items(id,owner_id,routine_id,exercise_id,position,sets,reps_min,reps_max,note) values
 ('d0000000-0000-4000-8000-000000000001',tests.student_a_id(),'f0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002',0,2,8,12,'Control');
update public.exercises set archived_at=now() where id='e0000000-0000-4000-8000-000000000002';
select tests.authenticate_as(tests.student_a_id());
select is(public.get_own_training_download()->>'userId',tests.student_a_id()::text,'identidad SQL propia');
select is(public.get_own_training_download()->'library'->>'userId',tests.student_a_id()::text,'misma biblioteca');
select is(public.get_own_training_download()->'history'->'student'->>'id',tests.student_a_id()::text,'mismo historial');
select is(public.get_own_training_download()->'week','null'::jsonb,'sin programa no inventa semana');
select is(jsonb_array_length(public.get_own_training_download()->'catalog'->'exercises'),1,'solo activos autorizados');
select is(jsonb_array_length(public.get_own_training_download()->'references'),1,'archivado necesario conservado');
select is(public.get_own_training_download()->'references'->0->>'id','e0000000-0000-4000-8000-000000000002','referencia propia exacta');
select is(jsonb_array_length(public.get_own_training_download()->'library'->'routines'),1,'base propia completa');
select is(public.get_own_training_download()->'library'->'routines'->0->'items'->0->>'note','Control','nota conservada');
select is((public.get_own_training_download()->>'downloadedAt')::timestamptz,now(),'tiempo único transaccional');
reset role;
select tests.authenticate_as(tests.student_b_id());
select is(public.get_own_training_download()->'library'->'routines'->0->>'name','Rutina B','B no descarga A');
select is(jsonb_array_length(public.get_own_training_download()->'references'),0,'sin referencias de A');
reset role;
select tests.authenticate_as(tests.coach_id());
select is(public.get_own_training_download()->>'userId',tests.coach_id()::text,'coach descarga lo propio');
select is(jsonb_array_length(public.get_own_training_download()->'library'->'routines'),0,'coach no descarga bases de alumnos');
select is(jsonb_array_length(public.get_own_training_download()->'catalog'->'exercises'),1,'coach no amplía catálogo personal de alumnos');
reset role;
select tests.authenticate_as('a0000000-0000-4000-8000-00000000000c');
select is(public.get_own_training_download()->>'userId','a0000000-0000-4000-8000-00000000000c','tercer alumno propio');
reset role;
update public.profiles set is_active=false where id=tests.student_b_id();
select tests.authenticate_as(tests.student_b_id());
select throws_ok($$select public.get_own_training_download()$$,'42501','Sin acceso','inactivo rechazado');
reset role;
select tests.authenticate_as_anon();
select throws_ok($$select public.get_own_training_download()$$,'42501',null,'anon sin permiso');
reset role;
insert into public.exercises(name,muscle_group) select 'Capacidad '||n,'Core' from generate_series(1,1000) n;
select tests.authenticate_as(tests.student_a_id());
select throws_ok($$select public.get_own_training_download()$$,'0A000','Descarga excede esta versión','1001activos no se recortan');
reset role;
delete from public.exercises where name='Capacidad 1000';
select tests.authenticate_as(tests.student_a_id());
select lives_ok($$select public.get_own_training_download()$$,'1000activos completos permitidos');
reset role;
delete from public.exercises where name like 'Capacidad %';
insert into public.personal_routines(id,owner_id,name,position) select gen_random_uuid(),tests.student_a_id(),'Base '||n,n from generate_series(1,1000) n;
select tests.authenticate_as(tests.student_a_id());
select throws_ok($$select public.get_own_training_download()$$,'0A000','Descarga excede esta versión','1001bases no se recortan');
reset role;
delete from public.personal_routines where owner_id=tests.student_a_id() and name like 'Base %';
insert into public.personal_folders(id,owner_id,name,position) select gen_random_uuid(),tests.student_a_id(),'Carpeta '||n,n from generate_series(1,1001) n;
select tests.authenticate_as(tests.student_a_id());
select throws_ok($$select public.get_own_training_download()$$,'0A000','Descarga excede esta versión','1001carpetas no se recortan');
reset role;
select * from finish();
rollback;
