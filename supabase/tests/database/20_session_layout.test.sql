begin;
select no_plan();
select tests.setup_basic();
insert into public.exercises(id,name,muscle_group) values ('e0000000-0000-0000-0000-000000000001','Press','Pecho');
insert into public.programs(id,coach_id,name,weeks_count) values ('a1000000-0000-0000-0000-000000000001',tests.coach_id(),'Layout',2);
insert into public.program_sessions(id,program_id,week_number,label) values ('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',1,'A');
insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max)
 select ('a3000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'a2000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',n-1,3,8,12 from generate_series(1,2) n;
select isnt_definer('public','configure_session_layout',array['uuid','integer','uuid','jsonb'],'layout invoker');
select tests.authenticate_as(tests.coach_id());
select lives_ok($$select public.configure_session_layout('a2000000-0000-0000-0000-000000000001',2,'a5000000-0000-0000-0000-000000000001',
 '[{"id":"a3000000-0000-0000-0000-000000000001","restSeconds":60,"supersetId":"a4000000-0000-0000-0000-000000000001","supersetRestSeconds":120},{"id":"a3000000-0000-0000-0000-000000000002","restSeconds":90,"supersetId":"a4000000-0000-0000-0000-000000000001","supersetRestSeconds":120}]')$$,'forma grupo atómico');
select lives_ok($$set constraints all immediate$$,'grupo final válido');
select is((select count(*)::int from public.session_exercises where superset_id is not null),2,'grupo completo');
select throws_ok($$select public.configure_session_layout('a2000000-0000-0000-0000-000000000001',2,gen_random_uuid(),'[]')$$,'40001',null,'rechaza revisión antigua');
select throws_ok($$select public.configure_session_layout('a2000000-0000-0000-0000-000000000001',4,gen_random_uuid(),'[]')$$,'22023',null,'rechaza omisiones');
reset role;
update public.programs set student_id=tests.student_a_id(),start_date=tests.current_monday(),ends_on=tests.current_monday()+13;
select tests.authenticate_as(tests.coach_id());
select throws_ok($$select public.configure_session_layout('a2000000-0000-0000-0000-000000000001',4,gen_random_uuid(),'[]')$$,'55000',null,'semana actual bloqueada');
reset role;
select tests.authenticate_as(tests.student_a_id());
select throws_ok($$select public.configure_session_layout('a2000000-0000-0000-0000-000000000001',4,gen_random_uuid(),'[]')$$,'42501',null,'alumno no configura');
reset role;
select tests.authenticate_as_anon();
select throws_ok($$select public.configure_session_layout('a2000000-0000-0000-0000-000000000001',4,gen_random_uuid(),'[]')$$,'42501',null,'anónimo sin permiso');
reset role;
select * from finish();
rollback;
