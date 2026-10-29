begin;
select no_plan();
select tests.setup_basic();
create function tests.coach_copy_id(n integer) returns uuid language sql immutable as $$
 select ('af219200-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function tests.coach_copy_target(kind text) returns jsonb language sql immutable as $$
 select jsonb_build_object('recordType',kind,'sets',2,'target',jsonb_build_object(
  'repsMin',null,'repsMax',null,'targetWeightKg',case when kind='weight_distance' then 12.35 end,
  'targetDurationSeconds',case when kind in ('duration','distance_duration') then 65 end,
  'targetDistanceMeters',case when kind in ('weight_distance','distance_duration') then 45.55 end),'series',null)
$$;
create function tests.coach_copy_content(s uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('exerciseId',i.exercise_id,'position',i.position,
  'prescribed',public.routine_training_prescription(to_jsonb(i)),'note',i.note,'rest',i.rest_seconds,
  'grouped',i.superset_id is not null,'groupRest',i.superset_rest_seconds,
  'alternatives',(select coalesce(jsonb_agg(jsonb_build_object('exerciseId',a.exercise_id,'position',a.position,
    'prescribed',public.routine_training_prescription(to_jsonb(a))) order by a.position),'[]'::jsonb)
   from public.session_exercise_alternatives a where a.session_exercise_id=i.id)) order by i.position),'[]'::jsonb)
 from public.session_exercises i where i.program_session_id=s
$$;
create function tests.coach_copy_program(p uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('week',s.week_number,'label',s.label,'title',s.title,'weekday',s.weekday,
  'content',tests.coach_copy_content(s.id)) order by s.week_number,s.label),'[]'::jsonb)
 from public.program_sessions s where s.program_id=p
$$;
insert into public.exercises(id,name,muscle_group,record_type) values
 (tests.coach_copy_id(800),'Plancha','Pecho','duration'),
 (tests.coach_copy_id(801),'Paseo','Piernas','weight_distance'),
 (tests.coach_copy_id(802),'Carrera','Piernas','distance_duration');
insert into public.programs(id,coach_id,name,weeks_count) values(tests.coach_copy_id(1),tests.coach_id(),'Mixta',4);
insert into public.program_sessions(id,program_id,week_number,label,title,weekday) values
 (tests.coach_copy_id(10),tests.coach_copy_id(1),1,'A','Fuerza y tiempo',2);
insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max,typed_prescription,note,rest_seconds,superset_id,superset_rest_seconds) values
 (tests.coach_copy_id(100),tests.coach_copy_id(10),tests.coach_copy_id(800),0,2,null,null,
  jsonb_set(jsonb_set(tests.coach_copy_target('duration'),'{series}',jsonb_build_array(
    tests.coach_copy_target('duration')->'target',jsonb_set(tests.coach_copy_target('duration')->'target','{targetDurationSeconds}','70'))),
    '{target,targetDurationSeconds}','null'),'Controlado',30,tests.coach_copy_id(900),90),
 (tests.coach_copy_id(101),tests.coach_copy_id(10),tests.coach_copy_id(801),1,2,null,null,
  tests.coach_copy_target('weight_distance'),'Paso firme',45,tests.coach_copy_id(900),90);
insert into public.session_exercise_alternatives(id,session_exercise_id,exercise_id,position,sets,reps_min,reps_max,typed_prescription) values
 (tests.coach_copy_id(200),tests.coach_copy_id(100),tests.coach_copy_id(802),0,2,null,null,tests.coach_copy_target('distance_duration'));
set constraints all immediate;
select tests.authenticate_as(tests.coach_id());
select lives_ok($$select public.duplicate_routine_item(tests.coach_copy_id(10),tests.coach_copy_id(500),tests.coach_copy_id(100))$$,'individual copy preserves canonical target');
select is((select typed_prescription from public.session_exercises where id=tests.coach_copy_id(500)),
 (select typed_prescription from public.session_exercises where id=tests.coach_copy_id(100)),'individual detail identical');
select is((select superset_id from public.session_exercises where id=tests.coach_copy_id(500)),null::uuid,'individual outside group');
select is((select typed_prescription from public.session_exercise_alternatives where session_exercise_id=tests.coach_copy_id(500)),
 tests.coach_copy_target('distance_duration'),'individual alternative retains both metrics');
select ok((select id<>tests.coach_copy_id(200) from public.session_exercise_alternatives where session_exercise_id=tests.coach_copy_id(500)),'individual alternative gets independent id');
select is(public.duplicate_routine_item(tests.coach_copy_id(10),tests.coach_copy_id(500),tests.coach_copy_id(100)),tests.coach_copy_id(500),'individual lost-response retry');
select is((select count(*) from public.session_exercises where id=tests.coach_copy_id(500)),1::bigint,'no duplicate item');
set constraints all deferred;
select lives_ok($$select public.duplicate_routine_item(tests.coach_copy_id(10),tests.coach_copy_id(501))$$,'session copy preserves all targets');
set constraints all immediate;
select is(tests.coach_copy_content(tests.coach_copy_id(501)),tests.coach_copy_content(tests.coach_copy_id(10)),'session content, alternatives, notes and rests identical');
select is((select title from public.program_sessions where id=tests.coach_copy_id(501)),'Fuerza y tiempo','session title retained');
select is((select weekday from public.program_sessions where id=tests.coach_copy_id(501)),2::smallint,'session weekday retained');
select ok((select bool_and(superset_id<>tests.coach_copy_id(900)) from public.session_exercises where program_session_id=tests.coach_copy_id(501) and superset_id is not null),'session group ids independent');
select is(public.duplicate_routine_item(tests.coach_copy_id(10),tests.coach_copy_id(501)),tests.coach_copy_id(501),'session retry stable');
set constraints all deferred;
select lives_ok($$select public.copy_program_week(tests.coach_copy_id(1),1::smallint,2::smallint)$$,'copy week supports canonical targets');
set constraints all immediate;
select is((select count(*) from public.program_sessions where program_id=tests.coach_copy_id(1) and week_number=2),2::bigint,'both sessions copied');
select is((select tests.coach_copy_content(id) from public.program_sessions where program_id=tests.coach_copy_id(1) and week_number=2 and label='A'),
 tests.coach_copy_content(tests.coach_copy_id(10)),'week copy complete');
select ok(not exists(select 1 from public.session_exercises c join public.program_sessions s on s.id=c.program_session_id
 where s.program_id=tests.coach_copy_id(1) and s.week_number=2 and c.superset_id=tests.coach_copy_id(900)),'week group ids independent');
select throws_ok($$select public.copy_program_week(tests.coach_copy_id(1),1::smallint,2::smallint)$$,'P0001',null,'replacement remains explicit');
set constraints all deferred;
select lives_ok($$select public.duplicate_program(tests.coach_copy_id(1),tests.coach_copy_id(600),'Copia')$$,'program copy supports canonical targets');
set constraints all immediate;
select is(tests.coach_copy_program(tests.coach_copy_id(600)),tests.coach_copy_program(tests.coach_copy_id(1)),'program snapshot complete');
select is(public.duplicate_program(tests.coach_copy_id(1),tests.coach_copy_id(600),'Copia'),tests.coach_copy_id(600),'program receipt replay stable');
select throws_ok($$select public.duplicate_program(tests.coach_copy_id(1),tests.coach_copy_id(600),'Otro')$$,'22023',null,'receipt cannot change content');
-- A reviewed multi-destination request retains the exact old receipt contract.
create temporary table copy_request as select jsonb_build_object('sourceWeek',1,
 'sourceSessions',public.routine_week_snapshot(tests.coach_copy_id(1),1),
 'targets',jsonb_build_array(jsonb_build_object('week',3,'replace',false,'sessions','[]'::jsonb),
  jsonb_build_object('week',4,'replace',false,'sessions','[]'::jsonb))) as body;
reset role;
create function tests.reject_typed_copy_target() returns trigger language plpgsql as $$
begin
 if new.program_id=tests.coach_copy_id(1) and new.week_number=4 then
   raise exception 'Fallo simulado al copiar último destino' using errcode='23514';
 end if;
 return new;
end;
$$;
create trigger reject_typed_copy_target before insert on public.program_sessions
 for each row execute function tests.reject_typed_copy_target();
select tests.authenticate_as(tests.coach_id());
set constraints all deferred;
select throws_ok($$select public.copy_program_weeks(tests.coach_copy_id(1),tests.coach_copy_id(700),(select body from copy_request))$$,'23514',null,'late target failure rolls back complete batch');
select is((select count(*) from public.program_sessions where program_id=tests.coach_copy_id(1) and week_number in (3,4)),0::bigint,'no earlier destination remains after late failure');
select is((select count(*) from public.planning_mutations where id=tests.coach_copy_id(700)),0::bigint,'failed batch leaves no receipt');
reset role;
drop trigger reject_typed_copy_target on public.program_sessions;
select tests.authenticate_as(tests.coach_id());
select is(public.copy_program_weeks(tests.coach_copy_id(1),tests.coach_copy_id(700),(select body from copy_request)),4,'reviewed copy confirms entire batch');
set constraints all immediate;
select is((select tests.coach_copy_content(id) from public.program_sessions where program_id=tests.coach_copy_id(1) and week_number=4 and label='A'),
 tests.coach_copy_content(tests.coach_copy_id(10)),'last target retained every dimension');
select is(public.copy_program_weeks(tests.coach_copy_id(1),tests.coach_copy_id(700),(select body from copy_request)),4,'multi-destination receipt replay before revisions');
select throws_ok($$select public.copy_program_weeks(tests.coach_copy_id(1),tests.coach_copy_id(701),(select body from copy_request))$$,'40001',null,'new stale intent rejected');
set constraints all deferred;
select lives_ok(format($$select public.assign_program(%L,%L,%L)$$,tests.coach_copy_id(1),tests.student_a_id(),tests.current_monday()),'current-week assignment authorized');
select lives_ok(format($$select public.assign_program(%L,%L,%L)$$,tests.coach_copy_id(1),tests.coach_id(),tests.current_monday()),'coach can train with own typed program');
set constraints all immediate;
select is(tests.coach_copy_program((select id from public.programs where student_id=tests.student_a_id())),tests.coach_copy_program(tests.coach_copy_id(1)),'assigned target snapshot complete');
select ok(not exists(select 1 from public.session_exercises c join public.program_sessions s on s.id=c.program_session_id
 join public.programs p on p.id=s.program_id where p.student_id is not null and c.superset_id=tests.coach_copy_id(900)),'assigned group ids independent');
select tests.authenticate_as(tests.student_a_id());
select is((select count(*) from public.session_exercises e join public.program_sessions s on s.id=e.program_session_id
 join public.programs p on p.id=s.program_id where p.student_id=tests.student_a_id()),24::bigint,'student reads own complete assignment');
select throws_ok($$select public.duplicate_program(tests.coach_copy_id(1),tests.coach_copy_id(601),'Ajena')$$,'42501',null,'student cannot copy shared programs');
select tests.authenticate_as(tests.student_b_id());
select is((select count(*) from public.session_exercises),0::bigint,'unassigned student isolated');
reset role;
select * from finish();
rollback;
