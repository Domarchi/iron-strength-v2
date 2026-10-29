begin;
select no_plan();
select tests.setup_basic();
select has_function('public','get_own_workout_removal',array['uuid'],'instantánea ligera de eliminación');
select has_function('public','remove_own_workout',array['jsonb'],'borrado completo con recibo');
select isnt_definer('public','get_own_workout_removal',array['uuid'],'consulta invoker');
select isnt_definer('public','remove_own_workout',array['jsonb'],'eliminación invoker');
select volatility_is('public','get_own_workout_removal',array['uuid'],'stable','conteos de una instantánea');
select ok(not has_function_privilege('anon','public.remove_own_workout(jsonb)','EXECUTE'),'sin borrado anónimo');
insert into public.exercises(id,name,muscle_group) values('e0000000-0000-4000-8000-000000000041','Eliminar','Piernas');
insert into public.workouts(id,student_id,started_at,finished_at,duration_seconds) values
 ('91000000-0000-4000-8000-000000000001',tests.student_a_id(),now()-interval '1 day',now()-interval '1 day'+interval '1 hour',3600),
 ('91000000-0000-4000-8000-000000000002',tests.student_b_id(),now()-interval '1 day',now()-interval '1 day'+interval '1 hour',3600),
 ('91000000-0000-4000-8000-000000000003',tests.coach_id(),now()-interval '1 day',now()-interval '1 day'+interval '1 hour',3600),
 ('91000000-0000-4000-8000-000000000007',tests.student_a_id(),((now() at time zone 'America/Santiago')::date-7+time '12:00') at time zone 'America/Santiago',((now() at time zone 'America/Santiago')::date-7+time '13:00') at time zone 'America/Santiago',3600),
 ('91000000-0000-4000-8000-000000000008',tests.student_a_id(),((now() at time zone 'America/Santiago')::date-8+time '12:00') at time zone 'America/Santiago',((now() at time zone 'America/Santiago')::date-8+time '13:00') at time zone 'America/Santiago',3600);
insert into public.workout_sets(workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps)
 select id,student_id,'e0000000-0000-4000-8000-000000000041','Eliminar',0,1,60,8 from public.workouts where id in('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003');
insert into public.comments(workout_id,author_id,body) values
 ('91000000-0000-4000-8000-000000000001',tests.student_a_id(),'Nota del alumno'),
 ('91000000-0000-4000-8000-000000000001',tests.coach_id(),'Respuesta del coach');
create function tests.removal_input(wid uuid,rid uuid) returns jsonb language sql stable as $$
 select jsonb_build_object('version',1,'requestId',rid,'workoutId',wid,'expectedRevision',edit_revision) from public.workouts where id=wid;
$$;
select tests.authenticate_as(tests.student_a_id());
select is(public.get_own_workout_removal('91000000-0000-4000-8000-000000000001')->>'userId',tests.student_a_id()::text,'identidad propia');
select is(public.get_own_workout_removal('91000000-0000-4000-8000-000000000001')->'workout'->>'setCount','1','conteo completo');
select is(public.get_own_workout_removal('91000000-0000-4000-8000-000000000001')->'workout'->>'commentCount','2','incluye comentarios del alumno y coach');
select is(public.get_own_workout_removal('91000000-0000-4000-8000-000000000002'),null::jsonb,'sin consulta ajena');
do $$ begin perform set_config('tests.removal',tests.removal_input('91000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001')::text,true); end $$;
select throws_ok($$select public.remove_own_workout(jsonb_set(current_setting('tests.removal')::jsonb,'{workoutId}','"91000000-0000-4000-8000-000000000002"'))$$,'P0002',null,'sin borrado ajeno');
select throws_ok($$select public.remove_own_workout(current_setting('tests.removal')::jsonb||'{"confirmed":true}')$$,'22023',null,'contrato cerrado');
select throws_ok($$select public.remove_own_workout(jsonb_set(current_setting('tests.removal')::jsonb,'{expectedRevision}','-1'))$$,'22023',null,'revisión no negativa');
select throws_ok($$select public.remove_own_workout(jsonb_set(current_setting('tests.removal')::jsonb,'{expectedRevision}','0'))$$,'40001',null,'revisión antigua no elimina');
reset role;
create function tests.fail_removal_receipt() returns trigger language plpgsql as $$ begin raise exception 'receipt_failure'; end $$;
create trigger fail_removal_receipt before insert on public.workout_correction_receipts for each row execute function tests.fail_removal_receipt();
select tests.authenticate_as(tests.student_a_id());
select throws_ok($$select public.remove_own_workout(current_setting('tests.removal')::jsonb)$$,'P0001','receipt_failure','fallo tardío revierte borrado');
select is((select count(*)::int from public.workouts where id='91000000-0000-4000-8000-000000000001'),1,'resultado conservado');
select is((select count(*)::int from public.workout_sets where workout_id='91000000-0000-4000-8000-000000000001'),1,'series conservadas');
select is((select count(*)::int from public.comments where workout_id='91000000-0000-4000-8000-000000000001'),2,'comentarios conservados después del fallo');
reset role;
drop trigger fail_removal_receipt on public.workout_correction_receipts;
select tests.authenticate_as(tests.student_a_id());
select is(public.remove_own_workout(current_setting('tests.removal')::jsonb)->>'status','deleted','borrado confirmado');
select is((select count(*)::int from public.workouts where id='91000000-0000-4000-8000-000000000001'),0,'resultado eliminado');
select is((select count(*)::int from public.workout_sets where workout_id='91000000-0000-4000-8000-000000000001'),0,'series eliminadas');
select is((select count(*)::int from public.comments where workout_id='91000000-0000-4000-8000-000000000001'),0,'comentarios eliminados con el resultado');
select is((select count(*)::int from public.workout_correction_receipts where workout_id='91000000-0000-4000-8000-000000000001'),1,'recibo independiente conservado');
select is(public.remove_own_workout(current_setting('tests.removal')::jsonb)->>'status','duplicate','respuesta perdida reconoce mismo intento');
select throws_ok($$select public.remove_own_workout(jsonb_set(current_setting('tests.removal')::jsonb,'{expectedRevision}','99'))$$,'22023',null,'mismo ID con otro contenido rechazado');
select throws_ok($$insert into public.workouts(id,student_id,started_at,finished_at,duration_seconds) values('91000000-0000-4000-8000-000000000001',tests.student_a_id(),now(),now(),0)$$,'23505',null,'cierre nuevo no resucita ID borrado');
do $$ declare v jsonb; begin
 v:=tests.removal_input('91000000-0000-4000-8000-000000000007','71000000-0000-4000-8000-000000000099');
 perform set_config('tests.forged_removal',v::text,true);
 insert into public.workout_correction_receipts(owner_id,request_id,workout_id,payload_hash,revision)
 values(tests.student_a_id(),'71000000-0000-4000-8000-000000000099','91000000-0000-4000-8000-000000000007',
 encode(extensions.digest(jsonb_build_object('operation','delete','request',v)::text,'sha256'),'hex'),1);
end $$;
select throws_ok($$select public.remove_own_workout(current_setting('tests.forged_removal')::jsonb)$$,'40001',null,'un recibo manual no acredita borrado de un resultado existente');
reset role;
delete from public.workout_correction_receipts where request_id='71000000-0000-4000-8000-000000000099';
select tests.authenticate_as(tests.student_a_id());
select lives_ok($$select public.remove_own_workout(tests.removal_input('91000000-0000-4000-8000-000000000007','71000000-0000-4000-8000-000000000007'))$$,'día7 Santiago permite eliminar incluso sin series');
select throws_ok($$select public.remove_own_workout(tests.removal_input('91000000-0000-4000-8000-000000000008','71000000-0000-4000-8000-000000000008'))$$,'55000',null,'día8 bloquea');
reset role;
select tests.authenticate_as(tests.coach_id());
select is(public.get_own_workout_removal('91000000-0000-4000-8000-000000000008'),null::jsonb,'coach no borra resultados de alumno');
select lives_ok($$select public.remove_own_workout(tests.removal_input('91000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000003'))$$,'coach elimina entrenamiento propio');
select is((select count(*)::int from public.workout_correction_receipts),1,'recibo privado del coach');
reset role;
update public.profiles set is_active=false where id=tests.student_a_id();
select tests.authenticate_as(tests.student_a_id());
select throws_ok($$select public.remove_own_workout(current_setting('tests.removal')::jsonb)$$,'42501',null,'inactivo no reconcilia recibos');
reset role;
select * from finish();
rollback;
