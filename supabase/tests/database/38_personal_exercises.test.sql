begin;
select plan(40);
select tests.setup_basic();
select tests.create_profile('a0000000-0000-0000-0000-00000000000c','student','C',tests.coach_id());
insert into public.exercises(id,name,muscle_group) values('e0000000-0000-0000-0000-000000000001','Compartido','Core');
insert into public.exercises(id,coach_id,name,muscle_group) values('e0000000-0000-0000-0000-000000000002',tests.coach_id(),'Del coach','Core');
select tests.authenticate_as(tests.student_a_id());
select lives_ok($$insert into public.exercises(id,personal_owner_id,name,muscle_group,record_type)
 values('e0000000-0000-0000-0000-00000000000a',tests.student_a_id(),'Propio','Core','duration')$$,'alumno crea propio');
select is((select personal_owner_id from public.exercises where id='e0000000-0000-0000-0000-00000000000a'),tests.student_a_id(),'propietario privado');
select throws_ok($$insert into public.exercises(personal_owner_id,name,muscle_group) values(tests.student_b_id(),'Ajeno','Core')$$,'42501',null,'no crea en otra cuenta');
select throws_ok($$insert into public.exercises(name,muscle_group) values('Global','Core')$$,'42501',null,'no crea globales');
select throws_ok($$insert into public.exercises(personal_owner_id,coach_id,name,muscle_group) values(tests.student_a_id(),tests.coach_id(),'Ambos','Core')$$,'42501',null,'no convierte privado a compartido');
select throws_ok($$update public.exercises set personal_owner_id=tests.student_b_id() where id='e0000000-0000-0000-0000-00000000000a'$$,'42501',null,'propietario inmutable');
select throws_ok($$update public.exercises set record_type='weight_reps' where id='e0000000-0000-0000-0000-00000000000a'$$,'23514',null,'tipo inmutable');
select throws_ok($$insert into public.exercises(personal_owner_id,name,muscle_group) values(tests.student_a_id(),' propio ','Core')$$,'23505',null,'nombre único normalizado');
update public.exercises set name='Mi propio',personal_revision=999 where id='e0000000-0000-0000-0000-00000000000a';
select is((select personal_revision from public.exercises where id='e0000000-0000-0000-0000-00000000000a'),2,'revisión DML no procede del cliente');
delete from public.exercises where id='e0000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.exercises where id='e0000000-0000-0000-0000-00000000000a'),1,'archivar, no borrar individualmente');
update public.exercises set archived_at=now() where id='e0000000-0000-0000-0000-00000000000a';
select is((public.get_personal_exercises()->'exercises'->0->>'revision')::int,3,'gestión conserva archivado/revisión');
reset role;
select tests.authenticate_as(tests.student_b_id());
select is((select count(*)::int from public.exercises where personal_owner_id is not null),0,'B no ve privados de A');
select lives_ok($$insert into public.exercises(personal_owner_id,name,muscle_group) values(tests.student_b_id(),'Mi propio','Core')$$,'otro propietario usa el mismo nombre');
select is((select count(*)::int from public.exercises where personal_owner_id is null),2,'comunes y compartidos conservados');
reset role;
select tests.authenticate_as(tests.coach_id());
select is((select count(*)::int from public.exercises where personal_owner_id=tests.student_a_id()),0,'coach no obtiene catálogo privado del alumno');
select lives_ok($$insert into public.exercises(id,personal_owner_id,name,muscle_group) values('e0000000-0000-0000-0000-00000000000c',tests.coach_id(),'Personal del coach','Core')$$,'coach también tiene ejercicios privados');
insert into public.programs(id,coach_id,name,weeks_count) values('90000000-0000-0000-0000-000000000001',tests.coach_id(),'Plantilla',1);
insert into public.program_sessions(id,program_id,week_number,label) values('91000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001',1,'A');
select throws_ok($$insert into public.session_exercises(program_session_id,exercise_id,position,sets,reps_min,reps_max)
 values('91000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-00000000000c',0,3,8,12)$$,'23514',null,'privado no se introduce en una asignación compartida');
select throws_ok($$insert into public.session_exercises(program_session_id,exercise_id,position,sets,reps_min,reps_max)
 values('91000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-00000000000a',0,3,8,12)$$,'23514',null,'adivinar ID privado ajeno no permite asignarlo');
reset role;
select tests.authenticate_as(tests.student_a_id());
create temporary table exercise_attempt as select public.mutate_personal_exercise(
 '10000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000010',0,'create',
 '{"name":"Por RPC","muscleGroup":"Core","equipment":null,"isBodyweight":true,"progressionIncrementKg":2.5,"recordType":"duration"}') as result;
select is((select result->>'revision' from exercise_attempt),'1','creación atómica revisada');
select is((public.mutate_personal_exercise('10000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000010',0,'create',
 '{"name":"Por RPC","muscleGroup":"Core","equipment":null,"isBodyweight":true,"progressionIncrementKg":2.5,"recordType":"duration"}')->>'duplicate')::bool,true,'reintento idéntico confirma');
select throws_ok($$select public.mutate_personal_exercise('10000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000010',0,'create',
 '{"name":"Cambio","muscleGroup":"Core","equipment":null,"isBodyweight":true,"progressionIncrementKg":2.5,"recordType":"duration"}')$$,'22023',null,'ID de intento no cambia contenido');
select throws_ok($$select public.mutate_personal_exercise(gen_random_uuid(),'e0000000-0000-0000-0000-000000000010',0,'archive','{}')$$,'40001',null,'no sobrescribe versión desactualizada');
select lives_ok($$select public.mutate_personal_exercise('10000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000010',1,'archive','{}')$$,'archivo completo');
select lives_ok($$select public.mutate_personal_exercise('10000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-000000000010',2,'restore','{}')$$,'restauración completa');
select throws_ok($$select public.mutate_personal_exercise(gen_random_uuid(),'e0000000-0000-0000-0000-000000000010',3,'archive','{"userId":"oculto"}')$$,'22023',null,'datos cerrados también SQL');
select throws_ok($$select public.mutate_personal_exercise(gen_random_uuid(),'e0000000-0000-0000-0000-000000000010',3,'update',
 '{"name":"Cambio inválido","muscleGroup":"Core","equipment":null,"isBodyweight":true,"progressionIncrementKg":0.001,"recordType":"duration"}')$$,'22023',null,'precisión se valida antes de cast SQL');
select is((select name from public.exercises where id='e0000000-0000-0000-0000-000000000010'),'Por RPC','fallo no modifica datos');
select is((select count(*)::int from public.personal_exercise_receipts),3,'recibos solo de operaciones confirmadas');
select is((select count(*)::int from public.personal_exercise_receipts where owner_id=tests.student_b_id()),0,'recibos ajenos no visibles');
select is((select prosecdef from pg_proc where oid='public.mutate_personal_exercise(uuid,uuid,integer,text,jsonb)'::regprocedure),false,'RPC invoker');
select throws_ok($$update public.personal_exercise_receipts set operation='restore'$$,'42501',null,'recibos no editables');
select throws_ok($$delete from public.personal_exercise_receipts$$,'42501',null,'recibos no borrables por la API');
reset role;
delete from public.exercises where id='e0000000-0000-0000-0000-000000000010';
select tests.authenticate_as(tests.student_a_id());
select is(public.mutate_personal_exercise('10000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000010',0,'create',
 '{"name":"Por RPC","muscleGroup":"Core","equipment":null,"isBodyweight":true,"progressionIncrementKg":2.5,"recordType":"duration"}')->>'status','removed','reintento tras eliminación no recrea');
select throws_ok($$select public.mutate_personal_exercise(gen_random_uuid(),'e0000000-0000-0000-0000-000000000010',0,'create',
 '{"name":"Reciclado","muscleGroup":"Core","equipment":null,"isBodyweight":true,"progressionIncrementKg":2.5,"recordType":"duration"}')$$,'23505',null,'ID eliminado no se recicla');
reset role;
select tests.authenticate_as(tests.student_b_id());
select throws_ok($$select public.mutate_personal_exercise(gen_random_uuid(),'e0000000-0000-0000-0000-000000000010',3,'archive','{}')$$,'P0002',null,'RPC ajena no revela el ejercicio');
reset role;
update public.profiles set is_active=false where id=tests.student_b_id();
select tests.authenticate_as(tests.student_b_id());
select is((select count(*)::int from public.exercises),0,'desactivado no consulta ejercicios');
select throws_ok($$select public.get_personal_exercises()$$,'42501',null,'desactivado no gestiona');
reset role;
select tests.authenticate_as_anon();
select throws_ok($$select public.get_personal_exercises()$$,'42501',null,'anónimo no gestiona');
reset role;
select tests.authenticate_as(tests.student_a_id());
select lives_ok($$select public.delete_my_account()$$,'borrar cuenta elimina ejercicios personales');
reset role;
select is((select count(*)::int from public.personal_exercise_receipts where owner_id=tests.student_a_id()),0,'cascada retira recibos privados');
select * from finish();
rollback;
