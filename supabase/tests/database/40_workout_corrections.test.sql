begin;
select no_plan();
select tests.setup_basic();
select tests.create_profile('a0000000-0000-4000-8000-00000000000c','student','C',tests.coach_id());
select has_column('public','workouts','edit_revision','revisión del resultado');
select has_function('public','get_own_workout_correction',array['uuid'],'instantánea propia completa');
select has_function('public','correct_own_workout',array['jsonb'],'corrección completa');
select isnt_definer('public','get_own_workout_correction',array['uuid'],'lectura invoker');
select volatility_is('public','get_own_workout_correction',array['uuid'],'stable','instantánea de una lectura estable');
select isnt_definer('public','correct_own_workout',array['jsonb'],'escritura invoker');
select ok(not has_function_privilege('anon','public.correct_own_workout(jsonb)','EXECUTE'),'sin escritura anónima');
select ok((select relrowsecurity from pg_class where oid='public.workout_correction_receipts'::regclass),'recibos con RLS');
select ok(not has_table_privilege('authenticated','public.workout_correction_receipts','UPDATE'),'recibos inmutables');
select ok(has_table_privilege('authenticated','public.workouts','UPDATE'),'DML de producto siempre actualiza revisión del padre');

insert into public.exercises(id,name,muscle_group) values('e0000000-0000-4000-8000-000000000001','Nombre actual','Piernas');
insert into public.workouts(id,student_id,started_at,finished_at,duration_seconds) values
 ('90000000-0000-4000-8000-000000000001',tests.student_a_id(),now()-interval '1 day',now()-interval '1 day'+interval '1 hour',3600),
 ('90000000-0000-4000-8000-000000000002',tests.student_b_id(),now()-interval '1 day',now()-interval '1 day'+interval '1 hour',3600),
 ('90000000-0000-4000-8000-000000000003',tests.coach_id(),now()-interval '1 day',now()-interval '1 day'+interval '1 hour',3600),
 ('90000000-0000-4000-8000-000000000007',tests.student_a_id(),((now() at time zone 'America/Santiago')::date-7+time '12:00') at time zone 'America/Santiago',((now() at time zone 'America/Santiago')::date-7+time '13:00') at time zone 'America/Santiago',3600),
 ('90000000-0000-4000-8000-000000000008',tests.student_a_id(),((now() at time zone 'America/Santiago')::date-8+time '12:00') at time zone 'America/Santiago',((now() at time zone 'America/Santiago')::date-8+time '13:00') at time zone 'America/Santiago',3600);
insert into public.workout_sets(id,workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps) values
 ('80000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',tests.student_a_id(),'e0000000-0000-4000-8000-000000000001','Nombre histórico',0,1,60,8),
 ('80000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001',tests.student_a_id(),'e0000000-0000-4000-8000-000000000001','Nombre histórico',0,2,60,8);
insert into public.workout_sets(workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps)
 select id,student_id,'e0000000-0000-4000-8000-000000000001','Nombre histórico',0,1,60,8 from public.workouts where id<>'90000000-0000-4000-8000-000000000001';

create function tests.correction_input(wid uuid,rid uuid) returns jsonb language sql stable as $$
 select jsonb_build_object('version',1,'requestId',rid,'workoutId',wid,'expectedRevision',w.edit_revision,
  'perceivedEffort',7,'note','Corrección','exerciseNotes',w.exercise_notes,
  'sets',(select jsonb_agg(jsonb_build_object('id',s.id,'metrics',jsonb_build_object(
   'recordType',s.record_type,'weightKg',62.5,'reps',9,'durationSeconds',s.duration_seconds,'distanceMeters',s.distance_meters),
   'setType',s.set_type,'effort',s.effort,'isWarmup',s.is_warmup) order by s.set_number) from public.workout_sets s where s.workout_id=w.id))
 from public.workouts w where w.id=wid;
$$;
select tests.authenticate_as(tests.student_a_id());
select is(public.get_own_workout_correction('90000000-0000-4000-8000-000000000001')->>'userId',tests.student_a_id()::text,'identidad propia');
select is(public.get_own_workout_correction('90000000-0000-4000-8000-000000000001')->'workout'->'sets'->0->>'exerciseName','Nombre histórico','nombre histórico intacto');
select is(public.get_own_workout_correction('90000000-0000-4000-8000-000000000002'),null::jsonb,'no lee otro alumno');
do $$ begin perform set_config('tests.correction',tests.correction_input('90000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001')::text,true); end $$;
do $$ begin perform set_config('tests.initial',public.get_own_workout_correction('90000000-0000-4000-8000-000000000001')::text,true); end $$;
select throws_ok($$select public.correct_own_workout(jsonb_set(current_setting('tests.correction')::jsonb,'{workoutId}','"90000000-0000-4000-8000-000000000002"'))$$,'P0002',null,'no modifica un resultado de otro alumno');
select throws_ok($$select public.correct_own_workout(jsonb_set(current_setting('tests.correction')::jsonb,'{sets,1,id}','"80000000-0000-4000-8000-000000000009"'))$$,'22023',null,'serie ajena invalida todo');
select is((select weight_kg from public.workout_sets where id='80000000-0000-4000-8000-000000000001'),60::numeric,'fallo no escribe la primera serie');
select throws_ok($$select public.correct_own_workout(jsonb_set(current_setting('tests.correction')::jsonb,'{sets}','[]'))$$,'22023',null,'no se quitan todas las series');
reset role;
create function tests.fail_late_correction() returns trigger language plpgsql as $$ begin if new.set_number=2 and new.weight_kg=62.5 then raise exception 'late_failure'; end if; return new; end $$;
create trigger fail_late_correction before update on public.workout_sets for each row execute function tests.fail_late_correction();
select tests.authenticate_as(tests.student_a_id());
select throws_ok($$select public.correct_own_workout(current_setting('tests.correction')::jsonb)$$,'P0001','late_failure','fallo después de una serie revierte toda la operación');
select is((select weight_kg from public.workout_sets where id='80000000-0000-4000-8000-000000000001'),60::numeric,'serie previa revertida');
select is((select note from public.workouts where id='90000000-0000-4000-8000-000000000001'),null::text,'cabecera revertida');
select is((select count(*)::int from public.workout_correction_receipts),0,'no hay recibo de un fallo');
reset role;
drop trigger fail_late_correction on public.workout_sets;
select tests.authenticate_as(tests.student_a_id());
select is(public.correct_own_workout(current_setting('tests.correction')::jsonb)->>'status','updated','corrección completa confirmada');
select is((select note from public.workouts where id='90000000-0000-4000-8000-000000000001'),'Corrección','nota confirmada');
select is((select weight_kg from public.workout_sets where id='80000000-0000-4000-8000-000000000001'),62.5::numeric,'métrica confirmada');
select is(public.correct_own_workout(current_setting('tests.correction')::jsonb)->>'status','duplicate','respuesta perdida reintenta el mismo intento');
select throws_ok($$select public.correct_own_workout(jsonb_set(current_setting('tests.correction')::jsonb,'{note}','"Otro contenido"'))$$,'22023',null,'mismo intento con otro documento rechazado');
select throws_ok($$select public.correct_own_workout(jsonb_set(current_setting('tests.correction')::jsonb,'{requestId}','"70000000-0000-4000-8000-000000000002"'))$$,'40001',null,'otra pestaña con revisión anterior no sobrescribe');
do $$ begin perform set_config('tests.direct_revision',(select edit_revision::text from public.workouts where id='90000000-0000-4000-8000-000000000001'),true); end $$;
update public.workout_sets set reps=10 where id='80000000-0000-4000-8000-000000000001';
select ok((select edit_revision from public.workouts where id='90000000-0000-4000-8000-000000000001')>current_setting('tests.direct_revision')::int,'DML directo cambia revisión');
update public.workouts set edit_revision=0 where id='90000000-0000-4000-8000-000000000001';
select ok((select edit_revision from public.workouts where id='90000000-0000-4000-8000-000000000001')>current_setting('tests.direct_revision')::int,'no se puede rebajar revisión');
select is(public.correct_own_workout(current_setting('tests.correction')::jsonb)->>'status','duplicate','replay no deshace corrección posterior');
select is((select reps from public.workout_sets where id='80000000-0000-4000-8000-000000000001'),10::numeric,'métrica posterior preservada');
do $$ declare input jsonb; begin
 input:=tests.correction_input('90000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000004');
 perform set_config('tests.removal',jsonb_set(input,'{sets}',jsonb_build_array(input->'sets'->0))::text,true);
end $$;
select is(public.correct_own_workout(current_setting('tests.removal')::jsonb)->>'status','updated','quitar algunas series es una corrección completa');
select is((select count(*)::int from public.workout_sets where workout_id='90000000-0000-4000-8000-000000000001'),1,'solo se retira la serie elegida');
select is((select started_at from public.workouts where id='90000000-0000-4000-8000-000000000001'),(current_setting('tests.initial')::jsonb->'workout'->>'startedAt')::timestamptz,'inicio original intacto');
select is((select duration_seconds from public.workouts where id='90000000-0000-4000-8000-000000000001'),3600,'duración intacta');
select lives_ok($$select public.correct_own_workout(tests.correction_input('90000000-0000-4000-8000-000000000007','70000000-0000-4000-8000-000000000007'))$$,'día7 Santiago admite corrección');
select throws_ok($$select public.correct_own_workout(tests.correction_input('90000000-0000-4000-8000-000000000008','70000000-0000-4000-8000-000000000008'))$$,'55000',null,'día8 Santiago bloqueado');
reset role;
update public.workouts set started_at=now()-interval '8 days' where id='90000000-0000-4000-8000-000000000001';
select tests.authenticate_as(tests.student_a_id());
select is(public.correct_own_workout(current_setting('tests.correction')::jsonb)->>'status','duplicate','replay confirmado funciona después de la ventana');
reset role;
update public.workouts set started_at=(current_setting('tests.initial')::jsonb->'workout'->>'startedAt')::timestamptz where id='90000000-0000-4000-8000-000000000001';
select tests.authenticate_as(tests.student_a_id());
delete from public.workouts where id='90000000-0000-4000-8000-000000000001';
select is(public.correct_own_workout(current_setting('tests.correction')::jsonb)->>'status','removed','recibo sobrevive al borrado sin recrear resultado');
select is((select count(*)::int from public.workouts where id='90000000-0000-4000-8000-000000000001'),0,'no resucita el resultado');
select throws_ok($$insert into public.workouts(id,student_id,started_at,finished_at,duration_seconds) values('90000000-0000-4000-8000-000000000001',tests.student_a_id(),now(),now(),0)$$,'23505',null,'un cierre posterior tampoco reutiliza el ID eliminado');
reset role;
select tests.authenticate_as(tests.coach_id());
select is(public.get_own_workout_correction('90000000-0000-4000-8000-000000000007'),null::jsonb,'coach no abre editor de alumno');
select is((select count(*)::int from public.workout_correction_receipts),0,'coach no lee recibos ajenos');
select lives_ok($$select public.correct_own_workout(tests.correction_input('90000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000003'))$$,'coach edita su entrenamiento propio');
reset role;
select tests.authenticate_as('a0000000-0000-4000-8000-00000000000c');
select is(public.get_own_workout_correction('90000000-0000-4000-8000-000000000007'),null::jsonb,'tercer alumno tampoco lee otro resultado');
reset role;
update public.profiles set is_active=false where id=tests.student_b_id();
select tests.authenticate_as(tests.student_b_id());
select throws_ok($$select public.get_own_workout_correction('90000000-0000-4000-8000-000000000002')$$,'42501',null,'desactivado rechazado');
reset role;
select tests.authenticate_as_anon();
select throws_ok($$select public.get_own_workout_correction('90000000-0000-4000-8000-000000000001')$$,'42501',null,'anónimo rechazado');
select * from finish();
rollback;
