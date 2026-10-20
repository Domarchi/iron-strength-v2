begin;
select no_plan();
select tests.setup_basic();
insert into public.exercises(id,name,muscle_group) values ('e0000000-0000-0000-0000-000000000001','Press','Pecho');
insert into public.programs(id,coach_id,name,weeks_count) values ('a1000000-0000-0000-0000-000000000001',tests.coach_id(),'Superseries',2);
insert into public.program_sessions(id,program_id,week_number,label) values
 ('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',1,'A'),
 ('a2000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001',1,'B');
insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max)
 select ('a3000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'a2000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',n-1,3,8,12 from generate_series(1,5) n;
select tests.authenticate_as(tests.coach_id());
select lives_ok($$update public.session_exercises set superset_id='a4000000-0000-0000-0000-000000000001',superset_rest_seconds=90 where position in (0,1); set constraints all immediate$$,'grupo de dos válido');
select is((select count(*)::int from public.session_exercises where superset_id is not null),2,'dos miembros');
select throws_ok($$update public.session_exercises set superset_rest_seconds=60 where position=0$$,'23514',null,'no admite descansos distintos');
select throws_ok($$update public.session_exercises set superset_id=null,superset_rest_seconds=null where position=0$$,'23514',null,'no deja grupo de uno');
select throws_ok($$update public.session_exercises set position=4 where position=0$$,'23514',null,'no permite partir grupo al ordenar');
select throws_ok($$update public.session_exercises set superset_id='a4000000-0000-0000-0000-000000000001',superset_rest_seconds=90 where position in (2,3,4)$$,'23514',null,'máximo cuatro');
select throws_ok($$update public.session_exercises set rest_seconds=14 where position=3$$,'23514',null,'descanso no admite 14 segundos');
select lives_ok($$update public.session_exercises set rest_seconds=0 where position=3$$,'descanso desactivado permitido');
select throws_ok($$update public.session_exercises set rest_seconds=601 where position=3$$,'23514',null,'máximo diez minutos');
set constraints all deferred;
delete from public.session_exercises where position=0;
set constraints all immediate;
select is((select count(*)::int from public.session_exercises where superset_id is not null),0,'quitar un miembro disuelve el grupo restante de uno');
reset role;
select tests.authenticate_as(tests.student_a_id());
select is((select count(*)::int from public.session_exercises),0,'alumno no ve plantilla');
reset role;
select * from finish();
rollback;
