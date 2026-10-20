begin;
select no_plan();
select tests.setup_basic();
insert into public.exercises(id,name,muscle_group) values
 ('e0000000-0000-0000-0000-000000000001','Original','Piernas'),
 ('e0000000-0000-0000-0000-000000000002','Alternativa 1','Piernas'),
 ('e0000000-0000-0000-0000-000000000003','Alternativa 2','Piernas'),
 ('e0000000-0000-0000-0000-000000000004','Alternativa 3','Piernas'),
 ('e0000000-0000-0000-0000-000000000005','Alternativa 4','Piernas');
insert into public.programs(id,coach_id,name,weeks_count) values
 ('a1000000-0000-0000-0000-000000000001',tests.coach_id(),'Alternativas',2);
insert into public.program_sessions(id,program_id,week_number,label) values
 ('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',1,'A');
insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max) values
 ('a3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',0,3,8,12);
select ok((select relrowsecurity from pg_class where oid='public.session_exercise_alternatives'::regclass),'RLS activada');
select isnt_definer('public','configure_session_alternatives',array['uuid','uuid','integer','uuid','jsonb'],'RPC invoker');
select tests.authenticate_as(tests.coach_id());
select lives_ok($$insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max)
 select 'a3000000-0000-0000-0000-000000000001',id,n-2,2,6,10 from public.exercises
 cross join lateral (select right(id::text,1)::int n) r where id::text like 'e0000000-0000-0000-0000-%' and n between 2 and 4$$,'coach prescribe tres alternativas');
select is((select count(*)::int from public.session_exercise_alternatives),3,'tres alternativas visibles al coach');
select throws_ok($$insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max)
 values('a3000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000005',3,2,6,10)$$,'23514',null,'cuarta alternativa rechazada');
select throws_ok($$update public.session_exercise_alternatives set exercise_id='e0000000-0000-0000-0000-000000000001' where position=0$$,'23514',null,'autorreferencia rechazada');
select throws_ok($$update public.session_exercises set exercise_id='e0000000-0000-0000-0000-000000000002' where id='a3000000-0000-0000-0000-000000000001'$$,'23514',null,'cambiar original no puede crear autorreferencia');
select throws_ok($$update public.session_exercise_alternatives set exercise_id='e0000000-0000-0000-0000-000000000002' where position=1$$,'23505',null,'duplicados rechazados también en tabla');
select throws_ok($$update public.session_exercise_alternatives set reps_min=11 where position=0$$,'23514',null,'rango inválido rechazado también en tabla');
reset role;
update public.exercises set archived_at=now() where id='e0000000-0000-0000-0000-000000000005';
select tests.authenticate_as(tests.coach_id());
select throws_ok($$update public.session_exercise_alternatives set exercise_id='e0000000-0000-0000-0000-000000000005' where position=0$$,'23514',null,'alternativa archivada rechazada');
select lives_ok($$select public.assign_program('a1000000-0000-0000-0000-000000000001',tests.student_a_id(),tests.current_monday())$$,'asigna copia de alternativas');
reset role;
select tests.authenticate_as(tests.student_a_id());
select is((select count(*)::int from public.session_exercise_alternatives),3,'alumno ve solo sus alternativas asignadas');
with changed as(delete from public.session_exercise_alternatives returning id) select is((select count(*)::int from changed),0,'alumno no elimina alternativas');
select throws_ok($$select public.configure_session_alternatives('a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001',0,gen_random_uuid(),'[]')$$,'42501',null,'alumno no invoca escritura');
reset role;
select tests.authenticate_as(tests.student_b_id());
select is((select count(*)::int from public.session_exercise_alternatives),0,'otro alumno no ve alternativas');
reset role;
select tests.authenticate_as_anon();
select throws_ok($$select * from public.session_exercise_alternatives$$,'42501',null,'anónimo sin lectura');
reset role;
select tests.authenticate_as(tests.coach_id());
with changed as(update public.session_exercise_alternatives set sets=4 where session_exercise_id<>'a3000000-0000-0000-0000-000000000001' returning id) select is((select count(*)::int from changed),0,'semana actual bloqueada también en escritura directa');
reset role;
select * from finish();
rollback;
