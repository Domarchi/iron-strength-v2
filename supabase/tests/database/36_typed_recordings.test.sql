begin;
select no_plan();
select tests.setup_basic();
create function tests.typed_id(n integer) returns uuid language sql immutable as $$select ('af215000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.exercises(id,name,muscle_group,record_type) values(tests.typed_id(800),'Tiempo','Pecho','duration');
create function tests.typed_recording(n integer) returns jsonb language sql stable as $$
 select jsonb_build_object('version',3,'id',tests.typed_id(n),'source','free',
 'workout',jsonb_build_object('version',2,'id',tests.typed_id(n),'title','Libre','origin',jsonb_build_object('kind','free'),
 'startedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'finishedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'durationSeconds',0,
 'exerciseNotes',jsonb_build_array(jsonb_build_object('sessionExerciseId',tests.typed_id(100),'note','Propia')),
 'sets',jsonb_build_array(jsonb_build_object('exerciseId',tests.typed_id(800),'position',0,'setNumber',1,'setType','failure','effort',8.5,
 'metrics',jsonb_build_object('recordType','duration','weightKg',null,'reps',null,'durationSeconds',60,'distanceMeters',null)))),
 'structure',jsonb_build_object('version',2,'exercises',jsonb_build_array(jsonb_build_object('id',tests.typed_id(100),'exerciseId',tests.typed_id(800),'prescribedExerciseId',null,'note','Indicación',
 'restSeconds',90,'supersetId',null,'supersetRestSeconds',null,
 'prescribed',jsonb_build_object('recordType','duration','sets',2,'target',jsonb_build_object('repsMin',null,'repsMax',null,'targetWeightKg',null,'targetDurationSeconds',60,'targetDistanceMeters',null),'series',null)))))
$$;
select has_column('public','workout_sets','record_type','tipo por serie');
select has_column('public','workouts','exercise_notes','nota propia independiente');
select col_is_null('public','workout_sets','reps','tiempo sin reps inventadas');
select isnt_definer('public','save_typed_workout_recording',array['jsonb'],'RPC invoker');
select ok(public.valid_typed_workout_recording(tests.typed_recording(1)),'documento3 completo');
select ok(not public.valid_workout_recording(tests.typed_recording(1)),'validador2 no acepta3');
select ok(not public.valid_workout_structure(tests.typed_recording(1)->'structure'),'estructura anterior no acepta2');
select ok(not public.valid_typed_workout_recording(jsonb_set(tests.typed_recording(1),'{workout,sets,0,metrics,reps}','1')),'no reps en tiempo');
select ok(not public.valid_typed_workout_recording(jsonb_set(tests.typed_recording(1),'{workout,sets,0,extra}','1')),'campos futuros rechazados');
select ok(not public.valid_typed_workout_recording(jsonb_set(tests.typed_recording(1),'{workout,exerciseNotes}','[]')),'notas no omiten fila');
select ok(not public.valid_typed_workout_recording(jsonb_set(tests.typed_recording(1),'{workout,exerciseNotes,0}','{}')),'nota ausente no es null');
select ok(not public.valid_typed_workout_recording(jsonb_set(tests.typed_recording(1),'{workout,exerciseNotes,0,note}',to_jsonb(repeat(chr(128170),501)))),'nota no recorta501 caracteres');
select ok(public.valid_typed_workout_recording(jsonb_set(tests.typed_recording(1),'{workout,exerciseNotes,0,note}',to_jsonb(repeat(chr(128170),500)))),'500 caracteres Unicode');
select ok(not has_function_privilege('anon','public.save_typed_workout_recording(jsonb)','EXECUTE'),'anónimo sin RPC');
select tests.authenticate_as(tests.student_a_id());
select is(public.save_typed_workout_recording(tests.typed_recording(1))->>'status','created','crea con rol real');
select is(public.save_typed_workout_recording(tests.typed_recording(1))->>'status','duplicate','mismo documento');
select is((select reps from public.workout_sets where workout_id=tests.typed_id(1)),null::numeric,'reps se conserva null');
select is((select weight_kg from public.workout_sets where workout_id=tests.typed_id(1)),null::numeric,'peso se conserva null');
select is((select duration_seconds from public.workout_sets where workout_id=tests.typed_id(1)),60::numeric,'segundos canónicos');
select is((select effort from public.workout_sets where workout_id=tests.typed_id(1)),8.5::numeric,'esfuerzo fraccional');
select is((select exercise_notes->0->>'note' from public.workouts where id=tests.typed_id(1)),'Propia','nota distinta de indicación');
select throws_ok($$update public.workout_sets set reps=1 where workout_id=tests.typed_id(1)$$,'23514',null,'DML valida dimensiones');
select throws_ok($$update public.workout_sets set duration_seconds=1.5 where workout_id=tests.typed_id(1)$$,'23514',null,'DML no redondea segundos');
select throws_ok($$update public.workout_sets set effort=8.1 where workout_id=tests.typed_id(1)$$,'23514',null,'DML valida paso del esfuerzo');
select throws_ok($$update public.workout_sets set is_warmup=true where workout_id=tests.typed_id(1)$$,'23514',null,'DML no separa clase y calentamiento');
select throws_ok($$update public.workouts set exercise_notes='[]' where id=tests.typed_id(1)$$,'23514',null,'DML preserva identidad de notas');
select throws_ok($$select public.save_typed_workout_recording(jsonb_set(tests.typed_recording(1),'{workout,sets,0,effort}','9'))$$,'23505',null,'otro cuerpo no confirma');
select throws_ok($$select public.save_typed_workout_recording(jsonb_set(tests.typed_recording(2),'{workout,sets,0,metrics,reps}','1'))$$,'22023',null,'documento inválido no guarda parcialmente');
select is((select count(*) from public.workouts where id=tests.typed_id(2)),0::bigint,'cabecera inválida ausente');
select is((select count(*) from public.workout_recording_receipts where workout_id=tests.typed_id(2)),0::bigint,'recibo inválido ausente');
select throws_ok($$select public.save_personal_workout(((tests.typed_recording(3)->'workout')-'exerciseNotes')||jsonb_build_object('version',1,'sets',jsonb_build_array(jsonb_build_object('exerciseId',tests.typed_id(800),'position',0,'setNumber',1,'weightKg',0,'reps',8,'isWarmup',false))))$$,'23514',null,'formato viejo no registra tiempo como repeticiones');
select is((select count(*) from public.workouts where id=tests.typed_id(3)),0::bigint,'formato incompatible revierte cabecera');
select tests.authenticate_as(tests.student_b_id());
select is((select count(*) from public.workouts where id=tests.typed_id(1)),0::bigint,'alumno ajeno sin cabecera');
select is((select count(*) from public.workout_sets where workout_id=tests.typed_id(1)),0::bigint,'alumno ajeno sin métricas');
select is((select count(*) from public.workout_recording_receipts where workout_id=tests.typed_id(1)),0::bigint,'alumno ajeno sin recibo');
select tests.authenticate_as(tests.coach_id());
select is((select count(*) from public.workout_sets where workout_id=tests.typed_id(1)),1::bigint,'coach autorizado ve métricas');
select is((select count(*) from public.workout_recording_receipts where workout_id=tests.typed_id(1)),0::bigint,'coach no ve recibo del alumno');
select tests.authenticate_as(tests.student_a_id());
delete from public.workouts where id=tests.typed_id(1);
select is(public.save_typed_workout_recording(tests.typed_recording(1))->>'status','removed','eliminado no resucita');
select is((select count(*) from public.workout_sets where workout_id=tests.typed_id(1)),0::bigint,'borrado conserva cascada');
reset role;
select throws_ok($$update public.exercises set record_type='weight_reps' where id=tests.typed_id(800)$$,'23514',null,'tipo histórico no se reinterpreta');
select * from finish();
rollback;
