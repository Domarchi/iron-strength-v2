begin;
select no_plan();
select tests.setup_basic();
create function tests.rec_id(n integer) returns uuid language sql immutable as $$
 select ('af214000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function tests.recording(n integer, src text default 'free') returns jsonb language plpgsql stable as $$
declare rows jsonb:='[]'; sets jsonb:='[]'; w jsonb; i integer; start_at timestamptz;
begin
 start_at:=(tests.current_monday()::timestamp+interval '12 hours') at time zone 'America/Santiago';
 for i in 0..1 loop
  rows:=rows||jsonb_build_array(jsonb_build_object('id',tests.rec_id(100+i),'exerciseId',tests.rec_id(800+i),
   'prescribedExerciseId',case when src='assigned' then to_jsonb(tests.rec_id(800+i)) else 'null'::jsonb end,
   'prescribed',jsonb_build_object('sets',2,'repsMin',8,'repsMax',12,'targetWeightKg',30,'series',null),
   'note','Controlado','restSeconds',90,'supersetId',tests.rec_id(400),'supersetRestSeconds',60));
  sets:=sets||jsonb_build_array(jsonb_build_object('exerciseId',tests.rec_id(800+i),'position',i,'setNumber',1,'weightKg',30,'reps',8,'isWarmup',false)
   ||case when src='assigned' then jsonb_build_object('sessionExerciseId',tests.rec_id(100+i),'prescribedExerciseId',tests.rec_id(800+i),'exerciseName','No confiar') else '{}'::jsonb end);
 end loop;
 w:=jsonb_build_object('id',tests.rec_id(n),'startedAt',to_char(start_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'finishedAt',to_char((start_at+interval '30 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'durationSeconds',1800,'sets',sets);
 if src='assigned' then w:=w||jsonb_build_object('programId',tests.rec_id(500),'programSessionId',tests.rec_id(600),'sessionLabel','A');
 else w:=w||jsonb_build_object('version',1,'title','Superior','origin',case when src='personal' then jsonb_build_object('kind','personal','routineId',tests.rec_id(700),'revision',0) else jsonb_build_object('kind','free') end); end if;
 return jsonb_build_object('version',2,'id',tests.rec_id(n),'source',src,'workout',w,'structure',jsonb_build_object('version',1,'exercises',rows));
end;
$$;
create function tests.recording_alt(n integer) returns jsonb language sql stable as $$
 select jsonb_set(jsonb_set(jsonb_set(tests.recording(n,'assigned'),'{structure,exercises,0,exerciseId}',to_jsonb(tests.rec_id(802))),'{workout,sets,0,exerciseId}',to_jsonb(tests.rec_id(802))),'{structure,exercises,0,prescribed,targetWeightKg}','20')
$$;
insert into public.exercises(id,name,muscle_group) values(tests.rec_id(800),'Press real','Pecho'),(tests.rec_id(801),'Remo real','Espalda'),(tests.rec_id(802),'Alternativa','Pecho');
insert into public.programs(id,coach_id,student_id,name,weeks_count,start_date,ends_on)
 values(tests.rec_id(500),tests.coach_id(),tests.student_a_id(),'Programa',2,tests.current_monday(),tests.current_monday()+13);
insert into public.program_sessions(id,program_id,week_number,label) values(tests.rec_id(600),tests.rec_id(500),1,'A');
insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,note,rest_seconds,superset_id,superset_rest_seconds)
 select tests.rec_id(100+i),tests.rec_id(600),tests.rec_id(800+i),i,2,8,12,30,'Controlado',90,tests.rec_id(400),60 from generate_series(0,1) i;
insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg)
 values(tests.rec_id(100),tests.rec_id(802),0,2,8,12,20);
select has_column('public','workouts','structure','estructura del cierre nullable y privada por RLS existente');
select has_table('public','workout_recording_receipts','recibos completos de documento');
select isnt_definer('public','save_workout_recording',array['jsonb'],'sin ampliar privilegios');
select tests.authenticate_as_anon();
select throws_ok($$select public.save_workout_recording(tests.recording(1))$$,'42501',null,'anónimo no guarda');
reset role;
select tests.authenticate_as(tests.student_a_id());
select ok(public.valid_workout_recording(tests.recording(1)),'contrato completo válido');
select ok(public.valid_workout_recording(jsonb_set(tests.recording(1),'{structure,exercises,0,prescribed,sets}','2.0')),'entero JSON con escala decimal conserva su valor');
select ok(not public.valid_workout_recording(jsonb_set(tests.recording(1),'{structure,exercises,0,id}','"af214000-0000-0000-0000-000000000100"')),'UUID de estructura cumple el mismo contrato de la app');
select ok(public.valid_workout_recording(jsonb_set(tests.recording(1),'{structure,exercises,0,note}',to_jsonb(repeat(chr(128170),500)))),'nota admite 500 caracteres Unicode');
select ok(not public.valid_workout_recording(jsonb_set(tests.recording(1),'{structure,exercises,0,note}',to_jsonb(repeat(chr(128170),501)))),'nota rechaza más de 500 caracteres Unicode');
select ok(not public.valid_workout_recording(jsonb_set(tests.recording(1),'{structure,exercises,0,prescribed}','{"sets":2,"repsMin":8,"repsMax":12,"targetWeightKg":null,"series":[{"repsMin":8,"repsMax":12},{"repsMin":8,"repsMax":12}]}')),'series detalladas no omiten campos del contrato');
select ok(not public.valid_workout_recording(jsonb_set(tests.recording(1),'{workout,startedAt}','"infinity"')),'fechas infinitas no son fechas ISO');
select ok(not public.valid_workout_recording(tests.recording(1)||'{"studentId":"ignored"}'),'sin destino adicional');
select ok(not public.valid_workout_recording(jsonb_set(tests.recording(1),'{workout,sets,0,weightKg}','0.001')),'precisión antes de convertir columna');
select ok(not public.valid_workout_recording(jsonb_set(tests.recording(1),'{workout,sets,0,setNumber}','21')),'veinte series por posición');
select ok((select relrowsecurity from pg_class where oid='public.workout_recording_receipts'::regclass),'RLS activa en recibos');
select is(public.save_workout_recording(tests.recording(1))->>'status','created','guarda libre con estructura y series');
set constraints all immediate;
select is((select structure from public.workouts where id=tests.rec_id(1)),tests.recording(1)->'structure','estructura exacta');
select is((select count(*)::int from public.workout_sets where workout_id=tests.rec_id(1)),2,'todas sus series');
select is(public.save_workout_recording(tests.recording(1))->>'status','duplicate','respuesta perdida confirma el mismo resultado');
select throws_ok($$select public.save_workout_recording(jsonb_set(tests.recording(1),'{structure,exercises,0,note}','"Distinta"'))$$,'23505',null,'mismo ID y otra estructura es conflicto');
select throws_ok($$select public.save_workout_recording(jsonb_set(tests.recording(1),'{workout,sets,0,weightKg}','35'))$$,'23505',null,'mismo ID y otras series es conflicto');
select throws_ok($$update public.workouts set structure=jsonb_set(structure,'{exercises,0,note}','"Cambio"') where id=tests.rec_id(1)$$,'P0001',null,'objetivos del cierre son inmutables');
select throws_ok($$update public.workouts set structure=null where id=tests.rec_id(1)$$,'P0001',null,'no quitar estructura');
select throws_ok($$select public.save_workout_recording(jsonb_set(tests.recording(2),'{structure,exercises,1,exerciseId}',to_jsonb(tests.rec_id(899))))$$,'22023',null,'identidad de serie y estructura coinciden');
select is((select count(*)::int from public.workouts where id=tests.rec_id(2)),0,'fallo no deja cabecera');
select is((select count(*)::int from public.workout_recording_receipts where workout_id=tests.rec_id(2)),0,'fallo no deja recibo');
select is(public.save_workout_recording(tests.recording(3,'assigned'))->>'status','created','asignada conserva prescripción y grupo reales');
select is((select exercise_name from public.workout_sets where workout_id=tests.rec_id(3) and position=0),'Press real','nombre canónico, no el enviado');
select throws_ok($$select public.save_workout_recording(jsonb_set(tests.recording(4,'assigned'),'{structure,exercises,0,prescribed,targetWeightKg}','25'))$$,'40001',null,'no inventar prescripción del coach');
select throws_ok($$select public.save_workout_recording(jsonb_set(tests.recording(4,'assigned'),'{structure,exercises,1,note}','null'))$$,'40001',null,'se comprueba la fuente completa');
select is(public.save_workout_recording(tests.recording_alt(8))->>'status','created','alternativa autorizada conserva prescripción propia');
select is((select prescribed_exercise_id from public.workout_sets where workout_id=tests.rec_id(8) and position=0),tests.rec_id(800),'identidad original conservada');
select is((select exercise_name from public.workout_sets where workout_id=tests.rec_id(8) and position=0),'Alternativa','nombre realizado canónico');
select throws_ok($$select public.save_workout_recording(jsonb_set(tests.recording_alt(9),'{structure,exercises,0,prescribed,targetWeightKg}','25'))$$,'40001',null,'alternativa no inventa objetivo');
-- Fuentes anteriores admiten omitir peso en el detalle; el contrato leído lo normaliza a null.
reset role;
update public.session_exercises set target_weight_kg=null,
 prescription_sets='[{"repsMin":8,"repsMax":12},{"repsMin":8,"repsMax":12}]' where id=tests.rec_id(100);
update public.session_exercise_alternatives set target_weight_kg=null,
 prescription_sets='[{"repsMin":8,"repsMax":12},{"repsMin":8,"repsMax":12}]' where session_exercise_id=tests.rec_id(100);
select tests.authenticate_as(tests.student_a_id());
select is(public.save_workout_recording(jsonb_set(tests.recording(10,'assigned'),'{structure,exercises,0,prescribed}',
 '{"sets":2,"repsMin":8,"repsMax":12,"targetWeightKg":null,"series":[{"repsMin":8,"repsMax":12,"targetWeightKg":null},{"repsMin":8,"repsMax":12,"targetWeightKg":null}]}'))->>'status','created','detalle previo sin peso se compara con la representación normalizada');
select is(public.save_workout_recording(jsonb_set(tests.recording_alt(11),'{structure,exercises,0,prescribed}',
 '{"sets":2,"repsMin":8,"repsMax":12,"targetWeightKg":null,"series":[{"repsMin":8,"repsMax":12,"targetWeightKg":null},{"repsMin":8,"repsMax":12,"targetWeightKg":null}]}'))->>'status','created','alternativa anterior sin peso también se normaliza');
select is((select structure from public.workouts where id=tests.rec_id(3)),tests.recording(3,'assigned')->'structure','la fuente nueva no reinterpreta el resultado anterior');
select throws_ok($$update public.workout_sets set set_number=21 where workout_id=tests.rec_id(3) and position=0$$,'23514',null,'SQL directo mantiene el límite del contrato nuevo');
select is(public.save_workout(tests.recording(20,'assigned')->'workout')->>'status','created','cliente anterior conserva su guardado');
select is((select structure from public.workouts where id=tests.rec_id(20)),null::jsonb,'no inventar estructura para registro anterior');
select throws_ok($$update public.workouts set structure=tests.recording(20,'assigned')->'structure' where id=tests.rec_id(20)$$,'P0001',null,'no adjuntar a posteriori una prescripción actual');
select throws_ok($$select public.save_workout_recording(tests.recording(20,'assigned'))$$,'23505',null,'no convertir un recibo anterior');
select public.mutate_personal_library(tests.rec_id(710),'routine_create',tests.rec_id(700),0,jsonb_build_object('name','Base','folderId',null,'items','[]'::jsonb));
select is(public.save_workout_recording(tests.recording(5,'personal'))->>'status','created','personal admite adaptación sin cambiar base');
select is((select count(*)::int from public.personal_routine_items where routine_id=tests.rec_id(700)),0,'base conservada');
select lives_ok($$delete from public.personal_routines where id=tests.rec_id(700)$$,'base puede desaparecer');
select is(public.save_workout_recording(tests.recording(5,'personal'))->>'status','duplicate','recibo precede a consultar base eliminada');
select is((select structure from public.workouts where id=tests.rec_id(5)),tests.recording(5,'personal')->'structure','histórico independiente de base');
select lives_ok($$delete from public.workouts where id=tests.rec_id(1)$$,'borrar resultado conserva tombstone');
select is(public.save_workout_recording(tests.recording(1))->>'status','removed','reintentar no resucita un eliminado');
reset role;
select tests.authenticate_as(tests.student_b_id());
select is((select count(*)::int from public.workout_recording_receipts),0,'B no lee recibos ajenos');
select throws_ok($$insert into public.workout_recording_receipts(owner_id,workout_id,payload_hash) values(tests.student_b_id(),tests.rec_id(3),repeat('a',64))$$,'42501',null,'B no fabrica recibo sobre resultado de A');
select is((select count(*)::int from public.workouts where id=tests.rec_id(3)),0,'B no lee estructura ajena');
select is(public.save_workout_recording(tests.recording(6))->>'status','created','B guarda libre propio');
select throws_ok($$update public.workout_recording_receipts set payload_hash=repeat('b',64)$$,'42501',null,'no reescribir recibos');
select throws_ok($$delete from public.workout_recording_receipts$$,'42501',null,'no retirar tombstones para resucitar registros');
reset role;
select tests.authenticate_as(tests.coach_id());
select is((select count(*)::int from public.workouts where structure is not null),6,'coach revisa estructuras de sus alumnos');
select is((select count(*)::int from public.workout_recording_receipts),0,'coach no lee recibos privados de alumnos');
select is(public.save_workout_recording(tests.recording(7))->>'status','created','coach puede entrenar');
reset role;
select tests.authenticate_as(tests.student_a_id());
select lives_ok($$select public.delete_my_account()$$,'borrado elimina datos y recibos nuevos');
reset role;
select is((select count(*)::int from public.workout_recording_receipts where owner_id=tests.student_a_id()),0,'cascada por cuenta');
select is((select count(*)::int from public.workouts where id=tests.rec_id(6)),1,'B preservado');
select is((select count(*)::int from public.workouts where id=tests.rec_id(7)),1,'coach preservado');
select * from finish();
rollback;
