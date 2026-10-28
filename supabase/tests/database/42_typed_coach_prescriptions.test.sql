-- T219: canonical coach targets, old rows and direct-DML permissions.
begin;
select no_plan();
select tests.setup_basic();
create function tests.coach_typed_id(n bigint) returns uuid language sql immutable as $$
 select ('af219100-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function tests.coach_target(kind text) returns jsonb language sql immutable as $$
 select jsonb_build_object(
  'repsMin',case when kind is null or kind in ('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight') then 8 end,
  'repsMax',case when kind is null or kind in ('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight') then 12 end,
  'targetWeightKg',case when kind is null or kind in ('weight_reps','weighted_bodyweight','assisted_bodyweight','weight_duration','weight_distance') then 12.35 end,
  'targetDurationSeconds',case when kind in ('duration','weight_duration','distance_duration') then 65 end,
  'targetDistanceMeters',case when kind in ('distance_duration','weight_distance') then 45.55 end)
$$;
create function tests.coach_prescribed(kind text) returns jsonb language sql immutable as $$
 select jsonb_build_object('recordType',kind,'sets',2,'target',tests.coach_target(kind),'series',null)
$$;
insert into public.exercises(id,name,muscle_group,record_type)
 select tests.coach_typed_id(800+n),coalesce(kind,'Legado'),'Piernas',kind
 from unnest(array[null,'weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight',
  'duration','weight_duration','distance_duration','weight_distance']) with ordinality t(kind,n);
insert into public.programs(id,coach_id,name,weeks_count) values
 (tests.coach_typed_id(1),tests.coach_id(),'Base',4);
insert into public.programs(id,coach_id,student_id,name,weeks_count,start_date,ends_on) values
 (tests.coach_typed_id(2),tests.coach_id(),tests.student_a_id(),'Asignada',4,tests.current_monday(),tests.current_monday()+27);
insert into public.program_sessions(id,program_id,week_number,label) values
 (tests.coach_typed_id(10),tests.coach_typed_id(1),1,'A'),
 (tests.coach_typed_id(11),tests.coach_typed_id(2),1,'A'),
 (tests.coach_typed_id(12),tests.coach_typed_id(2),2,'A');
insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg)
 values(tests.coach_typed_id(100),tests.coach_typed_id(10),tests.coach_typed_id(801),0,3,8,12,60),
 (tests.coach_typed_id(110),tests.coach_typed_id(11),tests.coach_typed_id(801),0,3,8,12,60),
 (tests.coach_typed_id(120),tests.coach_typed_id(12),tests.coach_typed_id(801),0,3,8,12,60);
select has_column('public','session_exercises','typed_prescription','canonical session target');
select has_column('public','session_exercise_alternatives','typed_prescription','canonical alternatives');
select col_is_null('public','session_exercises','reps_min','duration has no fictitious min reps');
select col_is_null('public','session_exercises','reps_max','duration has no fictitious max reps');
select col_is_null('public','session_exercise_alternatives','reps_min','alternative min reps nullable');
select col_is_null('public','session_exercise_alternatives','reps_max','alternative max reps nullable');
select tests.authenticate_as(tests.coach_id());
select is((select target_weight_kg from public.session_exercises where id=tests.coach_typed_id(100)),60::numeric,'old target untouched');
select is(public.routine_training_prescription((select to_jsonb(e) from public.session_exercises e where id=tests.coach_typed_id(100))),
 jsonb_build_object('recordType',null,'sets',3,'target',jsonb_build_object('repsMin',8,'repsMax',12,'targetWeightKg',60,'targetDurationSeconds',null,'targetDistanceMeters',null),'series',null),
 'old projection preserves legacy kind and targets');
select lives_ok(format($q$insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max,typed_prescription)
 values(%L,%L,%L,%s,2,null,null,%L::jsonb)$q$,tests.coach_typed_id(200+n),tests.coach_typed_id(10),tests.coach_typed_id(800+n),n,tests.coach_prescribed(kind)),
 'direct insert canonical '||coalesce(kind,'legacy'))
 from unnest(array[null,'weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight',
  'duration','weight_duration','distance_duration','weight_distance']) with ordinality t(kind,n);
select is(public.routine_training_prescription(to_jsonb(e)),tests.coach_prescribed(x.record_type),'read targets '||coalesce(x.record_type,'legacy'))
 from public.session_exercises e join public.exercises x on x.id=e.exercise_id where e.id between tests.coach_typed_id(201) and tests.coach_typed_id(209);
create temporary table old_alternative_attempt as select revision as base from public.program_sessions where id=tests.coach_typed_id(10);
select lives_ok(format($$select public.configure_session_alternatives(%L,%L,%s,%L,'[]')$$,
 tests.coach_typed_id(10),tests.coach_typed_id(100),(select base from old_alternative_attempt),tests.coach_typed_id(400)),
 'real legacy receipt before typed alternatives');
select lives_ok($$insert into public.session_exercise_alternatives(id,session_exercise_id,exercise_id,position,sets,reps_min,reps_max,typed_prescription)
 values(tests.coach_typed_id(300),tests.coach_typed_id(100),tests.coach_typed_id(806),0,2,null,null,tests.coach_prescribed('duration'))$$,'alternative can prescribe time');
select is((select typed_prescription from public.session_exercise_alternatives where id=tests.coach_typed_id(300)),tests.coach_prescribed('duration'),'alternative preserved');
select is(public.configure_session_alternatives(tests.coach_typed_id(10),tests.coach_typed_id(100),
 (select base from old_alternative_attempt),tests.coach_typed_id(400),'[]'),
 (select revision from public.routine_mutations where id=tests.coach_typed_id(400)),'old receipt replay never clears newer alternatives');
select throws_ok(format($$select public.configure_session_alternatives(%L,%L,%s,%L,'[]')$$,
 tests.coach_typed_id(10),tests.coach_typed_id(100),(select revision from public.program_sessions where id=tests.coach_typed_id(10)),tests.coach_typed_id(401)),
 '0A000',null,'new legacy intent cannot erase a modern alternative');
select is((select count(*) from public.session_exercise_alternatives where id=tests.coach_typed_id(300)),1::bigint,'alternative remains after rejected old intent');
select throws_ok(format($$select public.mutate_routine_session(%L,%s,%L,%L::jsonb)$$,
 tests.coach_typed_id(10),(select revision from public.program_sessions where id=tests.coach_typed_id(10)),tests.coach_typed_id(402),
 jsonb_build_array(jsonb_build_object('id',tests.coach_typed_id(206),'exerciseId',tests.coach_typed_id(806),'fields',jsonb_build_array('sets'),'sets',3))),
 '0A000',null,'old scalar mutation cannot edit canonical targets');
select throws_ok($$update public.session_exercises set reps_min=1 where id=tests.coach_typed_id(206)$$,'23514',null,'no second source of targets');
select throws_ok($$update public.session_exercise_alternatives set reps_max=1 where id=tests.coach_typed_id(300)$$,'23514',null,'alternative has no second source');
select throws_ok($$update public.session_exercises set target_weight_kg=12 where id=tests.coach_typed_id(202)$$,'23514',null,'weight stays canonical');
select throws_ok($$update public.session_exercises set sets=3 where id=tests.coach_typed_id(206)$$,'23514',null,'set count matches target');
select throws_ok($$update public.session_exercises set typed_prescription='null' where id=tests.coach_typed_id(206)$$,'22023',null,'JSON null not a legacy target');
select throws_ok($$update public.session_exercises set typed_prescription=null,reps_min=8,reps_max=12 where id=tests.coach_typed_id(206)$$,'22023',null,'no downgrade to fake reps');
select throws_ok($$update public.session_exercises set typed_prescription=null,reps_min=8,reps_max=12 where id=tests.coach_typed_id(201)$$,'22023',null,'canonical legacy kind also cannot be erased');
select throws_ok($$update public.session_exercise_alternatives set typed_prescription=null,reps_min=8,reps_max=12 where id=tests.coach_typed_id(300)$$,'22023',null,'no alternative downgrade');
select throws_ok($$update public.session_exercises set exercise_id=tests.coach_typed_id(802) where id=tests.coach_typed_id(206)$$,'22023',null,'kind follows actual exercise');
select throws_ok($$update public.session_exercise_alternatives set exercise_id=tests.coach_typed_id(802) where id=tests.coach_typed_id(300)$$,'22023',null,'alternative kind follows exercise');
select throws_ok($$update public.session_exercises set reps_min=null where id=tests.coach_typed_id(100)$$,'23514',null,'old format still requires reps');
select throws_ok($$update public.session_exercises set typed_prescription=jsonb_set(typed_prescription,'{target,targetDurationSeconds}','65.5') where id=tests.coach_typed_id(206)$$,'23514',null,'seconds are integral');
select throws_ok($$update public.session_exercises set typed_prescription=jsonb_set(typed_prescription,'{target,targetWeightKg}','12.351') where id=tests.coach_typed_id(202)$$,'23514',null,'weight precision not rounded');
select throws_ok($$update public.session_exercises set typed_prescription=jsonb_set(typed_prescription,'{target,targetDistanceMeters}','45.551') where id=tests.coach_typed_id(209)$$,'23514',null,'distance precision not rounded');
select throws_ok($$update public.session_exercises set typed_prescription=jsonb_set(typed_prescription,'{target,repsMin}','8') where id=tests.coach_typed_id(206)$$,'23514',null,'inapplicable dimension rejected');
select throws_ok($$update public.session_exercises set typed_prescription=typed_prescription||'{"effort":8}' where id=tests.coach_typed_id(206)$$,'23514',null,'execution effort is not a target');
select lives_ok($$update public.session_exercises set typed_prescription=jsonb_set(tests.coach_prescribed('duration'),'{series}',jsonb_build_array(tests.coach_target('duration'),tests.coach_target('duration'))) where id=tests.coach_typed_id(206)$$,'ordered per-set targets allowed');
select throws_ok($$update public.session_exercises set typed_prescription=jsonb_set(typed_prescription,'{series,1,targetDurationSeconds}','70') where id=tests.coach_typed_id(206)$$,'23514',null,'different detail needs coherent common summary');
select lives_ok($$update public.session_exercises set typed_prescription=jsonb_set(jsonb_set(typed_prescription,'{series,1,targetDurationSeconds}','70'),'{target,targetDurationSeconds}','null') where id=tests.coach_typed_id(206)$$,'different per-set durations with nullable common summary');
select throws_ok($$update public.session_exercises set typed_prescription=jsonb_set(typed_prescription,'{sets}','2.5') where id=tests.coach_typed_id(206)$$,'23514',null,'canonical quantity never coerced');
select throws_ok($$update public.session_exercises set reps_min=9 where id=tests.coach_typed_id(110)$$,'55000',null,'current week old scalar writes blocked');
select throws_ok($$update public.session_exercises set typed_prescription=tests.coach_prescribed(null),reps_min=null,reps_max=null,target_weight_kg=null,sets=2 where id=tests.coach_typed_id(110)$$,'55000',null,'current week canonical conversion blocked');
select throws_ok($$insert into public.session_exercises(program_session_id,exercise_id,position,sets,reps_min,reps_max) values(tests.coach_typed_id(11),tests.coach_typed_id(801),1,3,8,12)$$,'55000',null,'current week insertion blocked');
select throws_ok($$delete from public.session_exercises where id=tests.coach_typed_id(110)$$,'55000',null,'current week direct removal blocked');
select throws_ok($$delete from public.program_sessions where id=tests.coach_typed_id(11)$$,'55000',null,'cannot erase targets through parent session');
select throws_ok($$update public.program_sessions set week_number=3 where id=tests.coach_typed_id(11)$$,'55000',null,'cannot unlock current session by moving it');
select throws_ok($$insert into public.program_sessions(program_id,week_number,label) values(tests.coach_typed_id(2),1,'B')$$,'55000',null,'cannot create another current-week session');
select throws_ok($$select public.copy_program_week(tests.coach_typed_id(2),3::smallint,1::smallint,true)$$,'55000',null,'empty source cannot wipe current week');
select is((select count(*) from public.session_exercises where id=tests.coach_typed_id(110)),1::bigint,'failed parent operations preserve prescribed target');
select throws_ok($$update public.programs set student_id=null,start_date=null,ends_on=null where id=tests.coach_typed_id(2)$$,'55000',null,'assigned program cannot become an editable template');
select throws_ok($$update public.programs set start_date=start_date+7,ends_on=ends_on+7 where id=tests.coach_typed_id(2)$$,'55000',null,'cannot unlock current week by changing calendar');
select throws_ok($$delete from public.programs where id=tests.coach_typed_id(2)$$,'55000',null,'cannot erase prescriptions through assigned program deletion');
select lives_ok($$update public.programs set name='Asignada renombrada' where id=tests.coach_typed_id(2)$$,'assigned name remains editable');
select lives_ok($$update public.session_exercises set reps_min=9 where id=tests.coach_typed_id(120)$$,'future week old targets remain editable');
select lives_ok($$update public.session_exercises set typed_prescription=tests.coach_prescribed(null),reps_min=null,reps_max=null,target_weight_kg=null,sets=2 where id=tests.coach_typed_id(120)$$,'future week can convert explicitly');
select lives_ok($$delete from public.session_exercises where id=tests.coach_typed_id(120)$$,'future week removal allowed');
select isnt_definer('public','routine_training_prescription',array['jsonb'],'pure reader invoker');
select isnt_definer('public','guard_routine_prescription',array[]::text[],'guard invoker');
select ok(not has_function_privilege('anon','public.routine_training_prescription(jsonb)','EXECUTE'),'anonymous cannot call projection');
select ok(not has_function_privilege('authenticated','public.guard_routine_prescription()','EXECUTE'),'guard not callable as RPC');
select ok(not exists(select 1 from pg_proc p,lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where p.oid in ('public.routine_training_prescription(jsonb)'::regprocedure,'public.guard_routine_prescription()'::regprocedure)
 and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC without execute');
select tests.authenticate_as(tests.student_a_id());
select is((select count(*) from public.session_exercises where program_session_id=tests.coach_typed_id(10)),0::bigint,'student cannot see template');
select is((select count(*) from public.session_exercises where program_session_id=tests.coach_typed_id(11)),1::bigint,'student sees own current session');
select lives_ok($$update public.session_exercises set reps_min=10 where id=tests.coach_typed_id(110)$$,'student update affects zero rows');
select is((select reps_min from public.session_exercises where id=tests.coach_typed_id(110)),8::smallint,'student cannot change targets');
select tests.authenticate_as(tests.student_b_id());
select is((select count(*) from public.session_exercises where program_session_id=tests.coach_typed_id(11)),0::bigint,'other student isolated');
reset role;
update public.profiles set is_active=false where id=tests.coach_id();
select tests.authenticate_as(tests.coach_id());
select is((select count(*) from public.session_exercises),0::bigint,'inactive coach isolated');
reset role;
select * from finish();
rollback;
