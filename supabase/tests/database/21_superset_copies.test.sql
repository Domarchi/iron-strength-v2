begin;
select no_plan();
select tests.setup_basic();
insert into public.exercises(id,name,muscle_group) values
 ('e0000000-0000-0000-0000-000000000001','Grupo prueba','Piernas');
insert into public.programs(id,coach_id,name,weeks_count) values
 ('a1000000-0000-0000-0000-000000000001',tests.coach_id(),'Grupo plantilla',2);
insert into public.program_sessions(id,program_id,week_number,label) values
 ('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',1,'A');
insert into public.session_exercises(program_session_id,exercise_id,position,sets,reps_min,reps_max,rest_seconds,superset_id,superset_rest_seconds)
 select 'a2000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',n,3,8,12,45,'b1000000-0000-0000-0000-000000000001',120 from generate_series(0,1) n;
set constraints all immediate;
set constraints all deferred;
select tests.authenticate_as(tests.coach_id());
select lives_ok($$select public.duplicate_routine_item('a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002')$$,'duplica sesión agrupada');
select is((select count(distinct superset_id)::int from public.session_exercises),2,'genera otro grupo');
select is((select count(*)::int from public.session_exercises where rest_seconds=45 and superset_rest_seconds=120),4,'conserva descansos');
select lives_ok($$select public.copy_program_week('a1000000-0000-0000-0000-000000000001',1::smallint,2::smallint)$$,'copia semana agrupada');
select is((select count(distinct superset_id)::int from public.session_exercises),4,'identidad por cada sesión copiada');
select lives_ok($$select public.assign_program('a1000000-0000-0000-0000-000000000001',tests.student_a_id(),tests.current_monday())$$,'asigna grupos al alumno');
select is((select count(distinct superset_id)::int from public.session_exercises),8,'asignación independiente');
select isnt_definer('public','copy_program_week',array['uuid','smallint','smallint','boolean'],'copiar conserva RLS');
select isnt_definer('public','duplicate_routine_item',array['uuid','uuid','uuid'],'duplicar conserva RLS');
reset role;
select tests.authenticate_as(tests.student_a_id());
select throws_ok($$select public.copy_program_week('a1000000-0000-0000-0000-000000000001',1::smallint,2::smallint)$$,'P0002',null,'alumno no puede copiar semanas');
reset role;
set constraints all immediate;
select * from finish();
rollback;
