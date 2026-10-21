begin;
select no_plan();
select tests.setup_basic();
insert into public.exercises(id,name,muscle_group) values ('e0000000-0000-0000-0000-000000000001','Press','Pecho');
insert into public.programs(id,coach_id,name,weeks_count) values ('a1000000-0000-0000-0000-000000000001',tests.coach_id(),'Plan',4);
insert into public.program_sessions(id,program_id,week_number,label) select ('a2000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'a1000000-0000-0000-0000-000000000001',n,'A' from generate_series(1,3)n;
insert into public.session_exercises(program_session_id,exercise_id,position,sets,reps_min,reps_max) values ('a2000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',0,3,8,12);
select ok((select relrowsecurity from pg_class where oid='public.planning_mutations'::regclass),'recibos con RLS');
select isnt_definer('public','copy_program_weeks',array['uuid','uuid','jsonb'],'copia invoker');
select isnt_definer('public','assign_program_reviewed',array['uuid','uuid','jsonb'],'asignación invoker');
create temp table planning_input(value jsonb);
grant select,update on pg_temp.planning_input to authenticated;
insert into planning_input select jsonb_build_object('sourceWeek',1,'sourceSessions',public.routine_week_snapshot('a1000000-0000-0000-0000-000000000001',1),'targets',jsonb_build_array(
 jsonb_build_object('week',2,'replace',true,'sessions',public.routine_week_snapshot('a1000000-0000-0000-0000-000000000001',2)),
 jsonb_build_object('week',3,'replace',true,'sessions',public.routine_week_snapshot('a1000000-0000-0000-0000-000000000001',3))));
select tests.authenticate_as(tests.coach_id());
select lives_ok($$select public.copy_program_weeks('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',(select value from pg_temp.planning_input))$$,'lote completo');
select lives_ok($$select public.copy_program_weeks('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',(select value from pg_temp.planning_input))$$,'respuesta perdida confirma mismo lote');
select is((select count(*)::int from public.session_exercises),3,'cada destino recibe una copia');
select throws_ok($$select public.copy_program_weeks('a1000000-0000-0000-0000-000000000001',gen_random_uuid(),(select value from pg_temp.planning_input))$$,'40001',null,'revisión antigua rechazada');
-- Una excepción tardía tras copiar el primer destino revierte el lote entero.
update pg_temp.planning_input set value=jsonb_build_object('sourceWeek',1,'sourceSessions',public.routine_week_snapshot('a1000000-0000-0000-0000-000000000001',1),'targets',jsonb_build_array(
 jsonb_build_object('week',2,'replace',true,'sessions',public.routine_week_snapshot('a1000000-0000-0000-0000-000000000001',2)),
 jsonb_build_object('week',3,'replace',true,'sessions',public.routine_week_snapshot('a1000000-0000-0000-0000-000000000001',3))));
reset role;
create function tests.fail_third_destination() returns trigger language plpgsql as $$begin if new.week_number=3 then raise exception 'Fallo destino 3' using errcode='22023'; end if; return new; end;$$;
create trigger fail_third_destination before insert on public.program_sessions for each row execute function tests.fail_third_destination();
select tests.authenticate_as(tests.coach_id());
select throws_ok($$select public.copy_program_weeks('a1000000-0000-0000-0000-000000000001',gen_random_uuid(),(select value from pg_temp.planning_input))$$,'22023','Fallo destino 3','fallo después del primer destino');
select is(public.routine_week_snapshot('a1000000-0000-0000-0000-000000000001',2),(select value->'targets'->0->'sessions' from pg_temp.planning_input),'el primer destino sigue intacto');
select is((select count(*)::int from public.planning_mutations),1,'no crea recibo de lote fallido');
reset role;
drop trigger fail_third_destination on public.program_sessions;
drop function tests.fail_third_destination();
select tests.authenticate_as(tests.student_a_id());
select is((select count(*)::int from public.planning_mutations),0,'alumno no ve recibos');
select throws_ok($$select public.copy_program_weeks('a1000000-0000-0000-0000-000000000001',gen_random_uuid(),'{}')$$,'42501',null,'alumno no copia');
select throws_ok($$select public.assign_program_reviewed('a1000000-0000-0000-0000-000000000001',gen_random_uuid(),'{}')$$,'42501',null,'alumno no asigna');
reset role;
select tests.authenticate_as_anon();
select throws_ok($$select public.copy_program_weeks('a1000000-0000-0000-0000-000000000001',gen_random_uuid(),'{}')$$,'42501',null,'anónimo no copia');
select throws_ok($$select public.assign_program_reviewed('a1000000-0000-0000-0000-000000000001',gen_random_uuid(),'{}')$$,'42501',null,'anónimo no asigna');
reset role;
update public.profiles set is_active=false where id=tests.coach_id();
select tests.authenticate_as(tests.coach_id());
select throws_ok($$select public.copy_program_weeks('a1000000-0000-0000-0000-000000000001',gen_random_uuid(),'{}')$$,'42501',null,'coach inactivo no copia');
reset role;
delete from public.programs;
select is((select count(*)::int from public.planning_mutations),0,'recibos con cascada de programa');
select * from finish();
rollback;
