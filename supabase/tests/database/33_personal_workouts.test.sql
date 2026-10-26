begin;
select no_plan();
select tests.setup_basic();
create function tests.pw_id(n integer) returns uuid language sql immutable as $$
 select ('af213000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function tests.pw_payload(n integer, origin jsonb default '{"kind":"free"}') returns jsonb language sql stable as $$
 select jsonb_build_object('version',1,'id',tests.pw_id(n),'origin',origin,'title','Sesión propia',
 'startedAt',to_char(now()-interval '30 minutes','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
 'finishedAt',to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'),'durationSeconds',1800,
 'sets',jsonb_build_array(jsonb_build_object('exerciseId',tests.pw_id(800),'position',0,'setNumber',1,'weightKg',30,'reps',8,'isWarmup',false)))
$$;
create temp table pw_saved_input(payload jsonb);
grant select,insert on pw_saved_input to authenticated;
insert into public.exercises(id,name,muscle_group) values(tests.pw_id(800),'Press real','Pecho');
select has_column('public','workouts','source_kind','procedencia explícita compatible');
select has_table('public','personal_workout_receipts','recibos privados persistentes');
select isnt_definer('public','save_personal_workout',array['jsonb'],'guardado no salta RLS');
select tests.authenticate_as_anon();
select throws_ok($$select public.save_personal_workout(tests.pw_payload(1))$$,'42501',null,'visitante no registra');
reset role;
select tests.authenticate_as(tests.student_a_id());
select is(public.save_personal_workout(tests.pw_payload(1))->>'status','created','A registra sin programa');
select is((select source_kind from public.workouts where id=tests.pw_id(1)),'free','no deducir origen por FK');
select is((select program_id from public.workouts where id=tests.pw_id(1)),null::uuid,'sin programa ficticio');
select is((select exercise_name from public.workout_sets where workout_id=tests.pw_id(1)),'Press real','nombre del ejercicio real');
select is(public.save_personal_workout(tests.pw_payload(1))->>'status','duplicate','reintento exacto confirma');
select throws_ok($$select public.save_personal_workout(tests.pw_payload(1)||'{"title":"Otro"}')$$,'23505',null,'mismo id no acepta otro cuerpo');
select throws_ok($$select public.save_personal_workout(tests.pw_payload(2)||'{"sets":[]}')$$,'22023',null,'sin series no guarda');
select is((select count(*)::int from public.workouts where id=tests.pw_id(2)),0,'sin encabezado parcial');
select throws_ok($$select public.save_personal_workout(tests.pw_payload(2)||jsonb_build_object('sets',(tests.pw_payload(2)->'sets')||jsonb_build_array((tests.pw_payload(2)->'sets'->0)||'{"setNumber":2,"reps":101}')))$$,'22023',null,'una fila inválida revierte todo');
select is((select count(*)::int from public.workout_sets where workout_id=tests.pw_id(2)),0,'sin series parciales');
select throws_ok($$delete from public.personal_workout_receipts$$,'42501',null,'API no borra recibos');
select throws_ok($$update public.workouts set source_kind='assigned' where id=tests.pw_id(1)$$,'P0001',null,'origen guardado inmutable');
select throws_ok($$select public.save_personal_workout(tests.pw_payload(7)||jsonb_build_object('programId',tests.pw_id(999)))$$,'22023',null,'programa inventado rechazado en SQL');
select throws_ok($$select public.save_personal_workout(tests.pw_payload(7)||jsonb_build_object('sets',(tests.pw_payload(7)->'sets')||(tests.pw_payload(7)->'sets')))$$,'22023',null,'series duplicadas rechazadas en SQL');
select throws_ok($$select public.save_personal_workout(tests.pw_payload(7)||jsonb_build_object('sets',jsonb_build_array((tests.pw_payload(7)->'sets'->0)||'{"weightKg":0.001}')))$$,'22023',null,'precision de kilos validada antes de convertir columna');
select throws_ok($$insert into public.workout_sets(workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps)
 values(tests.pw_id(1),tests.student_a_id(),tests.pw_id(800),'Nombre falso',15,1,30,8)$$,'22023',null,'DML directo respeta máximo de ejercicios');
select throws_ok($$insert into public.workout_sets(workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps)
 values(tests.pw_id(1),tests.student_a_id(),tests.pw_id(800),'Nombre falso',0,21,30,8)$$,'22023',null,'DML directo respeta máximo de series');
select throws_ok($$update public.workout_sets set set_number=21 where workout_id=tests.pw_id(1)$$,'22023',null,'actualización directa también respeta límites');
select lives_ok($$delete from public.workouts where id=tests.pw_id(1)$$,'se puede retirar el resultado propio reciente');
select is(public.save_personal_workout(tests.pw_payload(1))->>'status','removed','recibo no recrea un resultado eliminado');
select is((select count(*)::int from public.workouts where id=tests.pw_id(1)),0,'sigue eliminado');
select is(public.mutate_personal_library(tests.pw_id(901),'routine_create',tests.pw_id(900),0,'{"name":"Propia","folderId":null,"items":[]}')->>'status','created','base de A');
insert into pw_saved_input values(tests.pw_payload(3,jsonb_build_object('kind','personal','routineId',tests.pw_id(900),'revision',(select revision from public.personal_routines where id=tests.pw_id(900)))));
select is(public.save_personal_workout((select payload from pw_saved_input))->>'status','created','guarda procedencia de base propia');
select is((select source_kind from public.workouts where id=tests.pw_id(3)),'personal','origen personal explícito');
select throws_ok($$select public.save_personal_workout(tests.pw_payload(6,jsonb_build_object('kind','personal','routineId',tests.pw_id(900),'revision',999999)))$$,'22023',null,'revisión futura no inventada');
reset role;
select tests.authenticate_as(tests.student_b_id());
select is((select count(*)::int from public.workouts where id=tests.pw_id(3)),0,'B no ve registro de A');
select is((select count(*)::int from public.personal_workout_receipts),0,'B no ve recibos de A');
select throws_ok($$select public.save_personal_workout(tests.pw_payload(4,jsonb_build_object('kind','personal','routineId',tests.pw_id(900),'revision',0)))$$,'P0002',null,'B no usa rutina de A');
select is(public.save_personal_workout(tests.pw_payload(4))->>'status','created','B guarda libre propio');
reset role;
select tests.authenticate_as(tests.coach_id());
select is((select count(*)::int from public.workouts where id=tests.pw_id(3)),1,'coach revisa resultado de A');
select is((select count(*)::int from public.personal_workout_receipts),0,'coach no lee recibos privados ajenos');
select is(public.save_personal_workout(tests.pw_payload(5))->>'status','created','coach entrena como propietario propio');
reset role;
select tests.authenticate_as(tests.student_a_id());
select lives_ok($$delete from public.personal_routines where id=tests.pw_id(900)$$,'borrar base conserva historial');
select is((select personal_routine_id from public.workouts where id=tests.pw_id(3)),null::uuid,'FK limpiada');
select is((select source_kind from public.workouts where id=tests.pw_id(3)),'personal','histórico no se convierte en libre al borrar base');
select is((select title from public.workouts where id=tests.pw_id(3)),'Sesión propia','título preservado');
select is(public.save_personal_workout((select payload from pw_saved_input))->>'status','duplicate','recibo se comprueba antes de base desaparecida');
select lives_ok($$select public.delete_my_account()$$,'A puede borrar sus datos personales y recibos');
reset role;
select is((select count(*)::int from public.personal_workout_receipts where owner_id=tests.student_a_id()),0,'recibos nuevos caen con A');
select is((select count(*)::int from public.workouts where id=tests.pw_id(4)),1,'datos de B conservados');
select is((select count(*)::int from public.workouts where id=tests.pw_id(5)),1,'entrenamiento del coach conservado');
select * from finish();
rollback;
