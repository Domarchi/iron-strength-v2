begin;
select no_plan();
select tests.setup_basic();
create function tests.coach_mutation_id(n bigint) returns uuid language sql immutable as $$
 select ('af219300-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
select tests.create_profile(tests.coach_mutation_id(999),'student','Tercero',tests.coach_id());
insert into public.exercises(id,coach_id,name,muscle_group,record_type)
 select tests.coach_mutation_id(800+n),tests.coach_id(),coalesce(kind,'Legado'),'Core',kind
 from unnest(array[null,'weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration','weight_duration','distance_duration','weight_distance']) with ordinality t(kind,n);
insert into public.exercises(id,personal_owner_id,name,muscle_group,record_type)
 values(tests.coach_mutation_id(900),tests.coach_id(),'Privado','Core','duration');
insert into public.programs(id,coach_id,name,weeks_count) values(tests.coach_mutation_id(1),tests.coach_id(),'Base',4);
insert into public.programs(id,coach_id,student_id,name,weeks_count,start_date,ends_on) values
 (tests.coach_mutation_id(2),tests.coach_id(),tests.student_a_id(),'Asignada',4,tests.current_monday(),tests.current_monday()+27);
insert into public.program_sessions(id,program_id,week_number,label) values
 (tests.coach_mutation_id(10),tests.coach_mutation_id(1),1,'A'),
 (tests.coach_mutation_id(11),tests.coach_mutation_id(1),1,'B'),
 (tests.coach_mutation_id(12),tests.coach_mutation_id(2),1,'A'),
 (tests.coach_mutation_id(13),tests.coach_mutation_id(2),2,'A');
insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,note) values
 (tests.coach_mutation_id(100),tests.coach_mutation_id(10),tests.coach_mutation_id(801),0,2,8,12,60,'Anterior'),
 (tests.coach_mutation_id(110),tests.coach_mutation_id(11),tests.coach_mutation_id(801),0,2,8,12,60,'Otra'),
 (tests.coach_mutation_id(120),tests.coach_mutation_id(12),tests.coach_mutation_id(801),0,2,8,12,60,'Actual'),
 (tests.coach_mutation_id(130),tests.coach_mutation_id(13),tests.coach_mutation_id(801),0,2,8,12,60,'Futura');
create function tests.coach_request(n integer,op text,data jsonb,s uuid default tests.coach_mutation_id(10),rev integer default null) returns jsonb
 language sql stable security invoker as $$
 select jsonb_build_object('version',2,'id',tests.coach_mutation_id(n),'revision',coalesce(rev,(select revision from public.program_sessions where id=s),0),'operation',op,'data',data)
$$;
create function tests.coach_call(n integer,op text,data jsonb,s uuid default tests.coach_mutation_id(10),rev integer default null) returns jsonb
 language sql volatile security invoker as $$
 select public.mutate_coach_session(s,tests.coach_request(n,op,data,s,rev))
$$;
select has_table('public','coach_training_receipts','private durable intent receipts');
select isnt_definer('public','mutate_coach_session',array['uuid','jsonb'],'mutation invoker');
select ok(not has_function_privilege('anon','public.mutate_coach_session(uuid,jsonb)','EXECUTE'),'anonymous has no RPC');
select ok((select relrowsecurity from pg_class where oid='public.coach_training_receipts'::regclass),'receipts RLS');
select tests.authenticate_as(tests.coach_id());
select is(public.valid_coach_session_request(tests.coach_request(70,op,body)),false,label) from (values
 ('add','{"items":null}'::jsonb,'add requires an array'),
 ('add','{"items":[null]}'::jsonb,'add member requires an object'),
 ('add','{"items":[{"id":"af219300-0000-4000-8000-000000000200","exerciseId":false}]}'::jsonb,'exercise identity is UUID string'),
 ('prescribe','{"rows":[{"id":"af219300-0000-4000-8000-000000000100","exerciseId":"af219300-0000-4000-8000-000000000801","changes":{}}]}'::jsonb,'empty changes invalid'),
 ('prescribe','{"rows":[{"id":"af219300-0000-4000-8000-000000000100","exerciseId":"af219300-0000-4000-8000-000000000801","changes":{"sets":"3"}}]}'::jsonb,'no scalar string coercion'),
 ('prescribe','{"rows":[],"title":null}'::jsonb,'title must be a string'),
 ('prescribe','{"rows":[],"weekday":1.5}'::jsonb,'weekday integral'),
 ('alternatives','{"rowId":"af219300-0000-4000-8000-000000000100","alternatives":{}}'::jsonb,'alternatives require an array'),
 ('alternatives','{"rowId":"af219300-0000-4000-8000-000000000100","alternatives":[{"exerciseId":"af219300-0000-4000-8000-000000000806","prescribed":null}]}'::jsonb,'alternative target is complete'),
 ('order','{"ids":["af219300-0000-4000-8000-000000000100","AF219300-0000-4000-8000-000000000100"]}'::jsonb,'UUID case cannot bypass uniqueness'),
 ('layout','{"items":[{"id":"af219300-0000-4000-8000-000000000100","restSeconds":1,"supersetId":null,"supersetRestSeconds":null}]}'::jsonb,'rest bounds'),
 ('layout','{"items":[{"id":"af219300-0000-4000-8000-000000000100","restSeconds":0,"supersetId":null,"supersetRestSeconds":60}]}'::jsonb,'group rest requires group'),
 ('remove','{"rowId":null}'::jsonb,'remove requires identity'),
 ('duplicate','{"copyId":"af219300-0000-4000-8000-000000000500"}'::jsonb,'copy scope explicit')
) matrix(op,body,label);
select is(public.valid_coach_session_request(jsonb_set(tests.coach_request(70,'remove',jsonb_build_object('rowId',tests.coach_mutation_id(100))),'{revision}','1.5')),false,'revision never rounded');
select is(public.valid_coach_session_request(tests.coach_request(70,'remove',jsonb_build_object('rowId',tests.coach_mutation_id(100)))||jsonb_build_object('ownerId',tests.coach_id())),false,'actor never supplied in request');
create temporary table saved_requests(name text primary key,body jsonb);
insert into saved_requests values('add',tests.coach_request(1,'add',jsonb_build_object('items',(
 select jsonb_agg(jsonb_build_object('id',tests.coach_mutation_id(200+n),'exerciseId',tests.coach_mutation_id(800+n)) order by n) from generate_series(1,9) n))));
select is(public.mutate_coach_session(tests.coach_mutation_id(10),(select body from saved_requests where name='add'))->>'status','applied','atomic typed add');
select is((select count(*) from public.session_exercises where program_session_id=tests.coach_mutation_id(10)),10::bigint,'all selected rows added');
select ok((select bool_and(sets=3 and reps_min is null and reps_max is null and target_weight_kg is null and typed_prescription->>'recordType' is not distinct from e.record_type)
 from public.session_exercises s join public.exercises e on e.id=s.exercise_id where s.id between tests.coach_mutation_id(201) and tests.coach_mutation_id(209)),'all nine canonical types match metadata');
select is((select typed_prescription->'target'->'repsMin' from public.session_exercises where id=tests.coach_mutation_id(206)),'null'::jsonb,'duration does not receive fake reps');
select is((select typed_prescription->'target'->'targetWeightKg' from public.session_exercises where id=tests.coach_mutation_id(202)),'null'::jsonb,'no fabricated prescribed weight');
select is((select typed_prescription->'target'->'repsMin' from public.session_exercises where id=tests.coach_mutation_id(202)),'8'::jsonb,'rep default applies only to rep types');
select is(public.mutate_coach_session(tests.coach_mutation_id(10),(select body from saved_requests where name='add'))->>'status','duplicate','lost response replay before revision');
select is((select count(*) from public.coach_training_receipts),1::bigint,'one durable receipt');
select throws_ok($$select public.mutate_coach_session(tests.coach_mutation_id(10),jsonb_set((select body from saved_requests where name='add'),'{data,items,0,id}',to_jsonb(tests.coach_mutation_id(400)::text)))$$,'22023',null,'nonce cannot change content');
select throws_ok($$select public.mutate_coach_session(tests.coach_mutation_id(11),(select body from saved_requests where name='add'))$$,'22023',null,'nonce cannot change source session');
select throws_ok($$select public.mutate_coach_session(tests.coach_mutation_id(10),jsonb_set((select body from saved_requests where name='add'),'{id}',to_jsonb(tests.coach_mutation_id(2)::text)))$$,'40001',null,'new stale request cannot overwrite');
select is(tests.coach_call(3,'prescribe',jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('id',tests.coach_mutation_id(100),'exerciseId',tests.coach_mutation_id(801),'changes',jsonb_build_object('note','Solo nota')))))->>'status','applied','metadata-only patch on legacy row');
select is((select typed_prescription from public.session_exercises where id=tests.coach_mutation_id(100)),null::jsonb,'note-only does not rewrite old targets');
select is((select target_weight_kg from public.session_exercises where id=tests.coach_mutation_id(100)),60::numeric,'unselected old weight retained');
select is(tests.coach_call(4,'prescribe',jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('id',tests.coach_mutation_id(100),'exerciseId',tests.coach_mutation_id(801),'changes',jsonb_build_object('sets',4)))))->>'status','applied','selected target converts explicitly to canonical legacy kind');
select is((select typed_prescription->'target'->'targetWeightKg' from public.session_exercises where id=tests.coach_mutation_id(100)),'60'::jsonb,'unselected weight retained after conversion');
select is((select note from public.session_exercises where id=tests.coach_mutation_id(100)),'Solo nota','unselected note retained');
select throws_ok($$select tests.coach_call(5,'prescribe','{"rows":[{"id":"af219300-0000-4000-8000-000000000203","exerciseId":"af219300-0000-4000-8000-000000000803","changes":{"targetWeightKg":null}}]}')$$,'22023',null,'inapplicable dimension rejected even null');
select throws_ok($$select tests.coach_call(6,'prescribe','{"rows":[{"id":"af219300-0000-4000-8000-000000000110","exerciseId":"af219300-0000-4000-8000-000000000801","changes":{"note":"Ajena"}}]}')$$,'P0002',null,'row from another session rejected');
select throws_ok($$select tests.coach_call(7,'prescribe','{"rows":[{"id":"af219300-0000-4000-8000-000000000100","exerciseId":"af219300-0000-4000-8000-000000000801","changes":{"note":"Parcial"}},{"id":"af219300-0000-4000-8000-000000000206","exerciseId":"af219300-0000-4000-8000-000000000806","changes":{"repsMin":8}}]}')$$,'22023',null,'late invalid patch rolls back prior note');
select is((select note from public.session_exercises where id=tests.coach_mutation_id(100)),'Solo nota','no partial patch');
select is((select count(*) from public.coach_training_receipts where request_id=tests.coach_mutation_id(7)),0::bigint,'failed patch has no receipt');
select throws_ok($$select tests.coach_call(8,'add','{"items":[{"id":"af219300-0000-4000-8000-000000000300","exerciseId":"af219300-0000-4000-8000-000000000802"},{"id":"af219300-0000-4000-8000-000000000301","exerciseId":"af219300-0000-4000-8000-000000000900"}]}')$$,'22023',null,'private personal exercise invalidates entire add');
select is((select count(*) from public.session_exercises where id=tests.coach_mutation_id(300)),0::bigint,'no partial add');
select throws_ok($$select tests.coach_call(60,'add',jsonb_build_object('items',(select jsonb_agg(jsonb_build_object('id',tests.coach_mutation_id(600+n),'exerciseId',tests.coach_mutation_id(800+n))) from generate_series(1,6)n)))$$,'23514',null,'new add retains fifteen-item capacity');
select is(tests.coach_call(9,'prescribe','{"rows":[],"title":" Nueva ","weekday":-1}')->>'status','applied','title/day metadata-only operation');
select is((select title from public.program_sessions where id=tests.coach_mutation_id(10)),'Nueva','title normalized only on persistence');
select throws_ok($$select tests.coach_call(10,'prescribe','{"rows":[]}')$$,'22023',null,'empty metadata rejected');
select throws_ok($$select tests.coach_call(11,'remove',jsonb_build_object('rowId',tests.coach_mutation_id(120)),tests.coach_mutation_id(12))$$,'55000',null,'current assigned week cannot mutate');
insert into saved_requests values('future',tests.coach_request(12,'prescribe',jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('id',tests.coach_mutation_id(130),'exerciseId',tests.coach_mutation_id(801),'changes',jsonb_build_object('targetWeightKg',0)))),tests.coach_mutation_id(13)));
select is(public.mutate_coach_session(tests.coach_mutation_id(13),(select body from saved_requests where name='future'))->>'status','applied','future week permits prescribed zero');
select is((select typed_prescription->'target'->'targetWeightKg' from public.session_exercises where id=tests.coach_mutation_id(130)),'0'::jsonb,'zero not absence');
-- Canonical alternative of a different type.
select is(tests.coach_call(13,'alternatives',jsonb_build_object('rowId',tests.coach_mutation_id(100),'alternatives',jsonb_build_array(jsonb_build_object('exerciseId',tests.coach_mutation_id(806),'prescribed',(select typed_prescription from public.session_exercises where id=tests.coach_mutation_id(206))))))->>'status','applied','alternative has independent canonical target');
select is((select typed_prescription from public.session_exercise_alternatives where session_exercise_id=tests.coach_mutation_id(100)),(select typed_prescription from public.session_exercises where id=tests.coach_mutation_id(206)),'alternative target exact');
select throws_ok($$select tests.coach_call(14,'alternatives',jsonb_build_object('rowId',tests.coach_mutation_id(100),'alternatives',jsonb_build_array(jsonb_build_object('exerciseId',tests.coach_mutation_id(801),'prescribed',(select typed_prescription from public.session_exercises where id=tests.coach_mutation_id(201))))))$$,'23514',null,'self alternative rejected atomically');
select is((select count(*) from public.session_exercise_alternatives where session_exercise_id=tests.coach_mutation_id(100)),1::bigint,'old alternative survives rejected replacement');
-- Selected dimensions preserve per-set targets and notes.
create temporary table differing_target as select jsonb_build_object('recordType','weight_reps','sets',2,
 'target',jsonb_build_object('repsMin',6,'repsMax',12,'targetWeightKg',null,'targetDurationSeconds',null,'targetDistanceMeters',null),
 'series',jsonb_build_array(jsonb_build_object('repsMin',6,'repsMax',8,'targetWeightKg',80,'targetDurationSeconds',null,'targetDistanceMeters',null),
 jsonb_build_object('repsMin',10,'repsMax',12,'targetWeightKg',70,'targetDurationSeconds',null,'targetDistanceMeters',null))) as body;
select lives_ok($$select tests.coach_call(15,'prescribe',jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('id',tests.coach_mutation_id(202),'exerciseId',tests.coach_mutation_id(802),'changes',jsonb_build_object('prescribed',(select body from differing_target))))))$$,'whole per-set prescription accepted');
select lives_ok($$select tests.coach_call(16,'prescribe',jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('id',tests.coach_mutation_id(202),'exerciseId',tests.coach_mutation_id(802),'changes',jsonb_build_object('sets',3,'targetWeightKg',0)))))$$,'resize and scalar patch');
select is((select typed_prescription->'series'->2->'repsMin' from public.session_exercises where id=tests.coach_mutation_id(202)),'10'::jsonb,'resize repeats last distinct rep range');
select is((select typed_prescription->'series'->0->'targetWeightKg' from public.session_exercises where id=tests.coach_mutation_id(202)),'0'::jsonb,'first weight patched');
select is((select typed_prescription->'series'->2->'targetWeightKg' from public.session_exercises where id=tests.coach_mutation_id(202)),'0'::jsonb,'last weight patched');
select is((select typed_prescription->'target'->'repsMin' from public.session_exercises where id=tests.coach_mutation_id(202)),'6'::jsonb,'coherent summary retains unselected dimensions');
-- Layout and order operate on the same complete session.
create temporary table original_layout as select jsonb_agg(jsonb_build_object('id',id,'restSeconds',rest_seconds,'supersetId',null,'supersetRestSeconds',null) order by position,id) as items
 from public.session_exercises where program_session_id=tests.coach_mutation_id(10);
select lives_ok($$select tests.coach_call(17,'layout',jsonb_build_object('items',jsonb_set(jsonb_set(jsonb_set(jsonb_set((select items from original_layout),'{0,supersetId}',to_jsonb(tests.coach_mutation_id(950)::text)),'{1,supersetId}',to_jsonb(tests.coach_mutation_id(950)::text)),'{0,supersetRestSeconds}','60'),'{1,supersetRestSeconds}','60')))$$,'group two consecutive items');
select throws_ok($$select tests.coach_call(18,'prescribe',jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('id',tests.coach_mutation_id(100),'exerciseId',tests.coach_mutation_id(801),'changes',jsonb_build_object('supersetRestSeconds',60)))))$$,'22023',null,'group rest requires all members even same value');
select lives_ok($$select tests.coach_call(19,'prescribe',jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('id',tests.coach_mutation_id(100),'exerciseId',tests.coach_mutation_id(801),'changes',jsonb_build_object('supersetRestSeconds',90)),jsonb_build_object('id',tests.coach_mutation_id(201),'exerciseId',tests.coach_mutation_id(801),'changes',jsonb_build_object('supersetRestSeconds',90)))))$$,'whole group rest changes together');
select throws_ok($$select tests.coach_call(20,'order',jsonb_build_object('ids',jsonb_build_array(tests.coach_mutation_id(100),tests.coach_mutation_id(202),tests.coach_mutation_id(201))||(select jsonb_agg(to_jsonb(tests.coach_mutation_id(200+n)::text) order by n) from generate_series(3,9)n)))$$,'23514',null,'cannot split group with order');
select is((select position from public.session_exercises where id=tests.coach_mutation_id(201)),1::smallint,'invalid order rolled back');
select lives_ok($$select tests.coach_call(28,'order',jsonb_build_object('ids',(select jsonb_agg(to_jsonb(tests.coach_mutation_id(200+n)::text) order by n) from generate_series(2,9)n)||jsonb_build_array(tests.coach_mutation_id(100),tests.coach_mutation_id(201))))$$,'whole group can move to end');
select is((select position from public.session_exercises where id=tests.coach_mutation_id(100)),8::smallint,'group move persisted');
select throws_ok($$select tests.coach_call(29,'layout',jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id',tests.coach_mutation_id(100),'restSeconds',null,'supersetId',null,'supersetRestSeconds',null))))$$,'40001',null,'layout cannot omit session members');
-- Source row identity is part of the intent, even with the same exercise twice.
insert into saved_requests values('copy_item',tests.coach_request(21,'duplicate',jsonb_build_object('copyId',tests.coach_mutation_id(500),'rowId',tests.coach_mutation_id(100))));
select is(public.mutate_coach_session(tests.coach_mutation_id(10),(select body from saved_requests where name='copy_item'))->>'status','applied','individual copy has new durable receipt');
select is((select superset_id from public.session_exercises where id=tests.coach_mutation_id(500)),null::uuid,'individual copy outside group');
select throws_ok($$select public.mutate_coach_session(tests.coach_mutation_id(10),jsonb_set((select body from saved_requests where name='copy_item'),'{data,rowId}',to_jsonb(tests.coach_mutation_id(201)::text)))$$,'22023',null,'same actual exercise from another source is a different intent');
select lives_ok($$select tests.coach_call(22,'remove',jsonb_build_object('rowId',tests.coach_mutation_id(500)))$$,'remove copied item');
select is(public.mutate_coach_session(tests.coach_mutation_id(10),(select body from saved_requests where name='copy_item'))->>'status','removed','old copy receipt does not resurrect target');
select is((select count(*) from public.session_exercises where id=tests.coach_mutation_id(500)),0::bigint,'target remains deleted');
insert into saved_requests values('copy_session',tests.coach_request(23,'duplicate',jsonb_build_object('copyId',tests.coach_mutation_id(501),'rowId',null)));
select is(public.mutate_coach_session(tests.coach_mutation_id(10),(select body from saved_requests where name='copy_session'))->>'copyKind','session','session copy confirmed');
select ok(exists(select 1 from public.session_exercise_alternatives a join public.session_exercises e on e.id=a.session_exercise_id where e.program_session_id=tests.coach_mutation_id(501) and a.typed_prescription->>'recordType'='duration'),'session copy keeps typed alternatives');
select throws_ok($$select tests.coach_call(61,'duplicate',jsonb_build_object('copyId',tests.coach_mutation_id(501),'rowId',null))$$,'22023',null,'new copy intent cannot adopt existing target');
select throws_ok($$insert into public.coach_training_receipts(owner_id,request_id,session_id,operation,request_hash,result) values(tests.coach_id(),tests.coach_mutation_id(62),tests.coach_mutation_id(10),'remove',repeat('a',64),jsonb_build_object('version',2,'id',tests.coach_mutation_id(62),'sessionId',tests.coach_mutation_id(10),'revision',0,'status','duplicate'))$$,'23514',null,'stored receipt can only be an original applied confirmation');
-- Cross-version reuse must not create a second interpretation of one intent.
create temporary table legacy_request as select revision as base from public.program_sessions where id=tests.coach_mutation_id(11);
select lives_ok($$select public.mutate_routine_session(tests.coach_mutation_id(11),(select base from legacy_request),tests.coach_mutation_id(40),jsonb_build_array(jsonb_build_object('id',tests.coach_mutation_id(110),'exerciseId',tests.coach_mutation_id(801),'fields',jsonb_build_array('note'),'note','Previa')))$$,'legacy contract still confirms its own intent');
select throws_ok($$select tests.coach_call(40,'prescribe',jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('id',tests.coach_mutation_id(110),'exerciseId',tests.coach_mutation_id(801),'changes',jsonb_build_object('note','Otra')))),tests.coach_mutation_id(11))$$,'22023',null,'new contract cannot reinterpret old nonce');
select lives_ok($$select public.mutate_routine_session(tests.coach_mutation_id(11),(select base from legacy_request),tests.coach_mutation_id(40),jsonb_build_array(jsonb_build_object('id',tests.coach_mutation_id(110),'exerciseId',tests.coach_mutation_id(801),'fields',jsonb_build_array('note'),'note','Previa')))$$,'legacy receipt replays without adding version keys');
select throws_ok($$select public.mutate_routine_session(tests.coach_mutation_id(11),(select revision from public.program_sessions where id=tests.coach_mutation_id(11)),tests.coach_mutation_id(23),jsonb_build_array(jsonb_build_object('id',tests.coach_mutation_id(110),'exerciseId',tests.coach_mutation_id(801),'fields',jsonb_build_array('note'),'note','Otra')))$$,'22023',null,'old patch cannot reuse canonical nonce');
select throws_ok($$select public.add_routine_exercises(tests.coach_mutation_id(11),(select revision from public.program_sessions where id=tests.coach_mutation_id(11)),tests.coach_mutation_id(1),jsonb_build_array(jsonb_build_object('id',tests.coach_mutation_id(310),'exerciseId',tests.coach_mutation_id(801))))$$,'22023',null,'old add cannot reuse canonical nonce');
select throws_ok($$select public.configure_session_alternatives(tests.coach_mutation_id(11),tests.coach_mutation_id(110),(select revision from public.program_sessions where id=tests.coach_mutation_id(11)),tests.coach_mutation_id(13),'[]')$$,'22023',null,'old alternatives cannot reuse canonical nonce');
select throws_ok($$select public.configure_session_layout(tests.coach_mutation_id(11),(select revision from public.program_sessions where id=tests.coach_mutation_id(11)),tests.coach_mutation_id(17),jsonb_build_array(jsonb_build_object('id',tests.coach_mutation_id(110),'restSeconds',null,'supersetId',null,'supersetRestSeconds',null)))$$,'22023',null,'old layout cannot reuse canonical nonce');
select throws_ok($$update public.coach_training_receipts set result='{}' where request_id=tests.coach_mutation_id(23)$$,'42501',null,'receipt immutable to caller');
select throws_ok($$delete from public.coach_training_receipts where request_id=tests.coach_mutation_id(23)$$,'42501',null,'receipt cannot be deleted by caller');
-- Removing source preserves the copy receipt and its independent target.
delete from public.program_sessions where id=tests.coach_mutation_id(10);
select is(public.mutate_coach_session(tests.coach_mutation_id(10),(select body from saved_requests where name='copy_session'))->>'status','duplicate','copy replay survives source deletion');
select is(public.mutate_coach_session(tests.coach_mutation_id(10),(select body from saved_requests where name='add'))->>'status','removed','mutation replay reports deleted source');
select is((select count(*) from public.session_exercises where program_session_id=tests.coach_mutation_id(10)),0::bigint,'old add does not recreate source');
reset role;
update public.programs set start_date=start_date-7,ends_on=ends_on-7 where id=tests.coach_mutation_id(2);
select tests.authenticate_as(tests.coach_id());
select is(public.mutate_coach_session(tests.coach_mutation_id(13),(select body from saved_requests where name='future'))->>'status','duplicate','confirmed intent replays after week locks');
select throws_ok($$select public.mutate_coach_session(tests.coach_mutation_id(13),jsonb_set((select body from saved_requests where name='future'),'{id}',to_jsonb(tests.coach_mutation_id(27)::text)))$$,'55000',null,'new intent cannot reuse old edit window');
select tests.authenticate_as(tests.student_a_id());
select is((select count(*) from public.coach_training_receipts),0::bigint,'student cannot see technical receipts');
select throws_ok($$select tests.coach_call(24,'remove',jsonb_build_object('rowId',tests.coach_mutation_id(120)),tests.coach_mutation_id(12))$$,'42501',null,'student owner cannot mutate program');
select tests.authenticate_as(tests.student_b_id());
select throws_ok($$select tests.coach_call(25,'remove',jsonb_build_object('rowId',tests.coach_mutation_id(130)),tests.coach_mutation_id(13))$$,'42501',null,'foreign student cannot mutate');
select tests.authenticate_as(tests.coach_mutation_id(999));
select is((select count(*) from public.coach_training_receipts),0::bigint,'third student isolated');
select throws_ok($$insert into public.coach_training_receipts(owner_id,request_id,session_id,operation,request_hash,result) values(tests.coach_mutation_id(999),tests.coach_mutation_id(31),tests.coach_mutation_id(11),'remove',repeat('a',64),jsonb_build_object('version',2,'id',tests.coach_mutation_id(31),'sessionId',tests.coach_mutation_id(11),'revision',0,'status','applied'))$$,'42501',null,'student cannot forge its own technical receipt');
select tests.authenticate_as_anon();
select throws_ok($$select public.mutate_coach_session(tests.coach_mutation_id(11),'{}')$$,'42501',null,'anonymous denied');
reset role;
update public.profiles set is_active=false where id=tests.coach_id();
select tests.authenticate_as(tests.coach_id());
select throws_ok($$select tests.coach_call(26,'remove',jsonb_build_object('rowId',tests.coach_mutation_id(110)),tests.coach_mutation_id(11))$$,'42501',null,'inactive coach denied');
select is((select count(*) from public.coach_training_receipts),0::bigint,'inactive coach cannot read receipts');
reset role;
-- Account cascade owns the technical receipts, rather than the removed source.
delete from public.programs where coach_id=tests.coach_id();
select ok((select count(*)>0 from public.coach_training_receipts),'program deletion retains technical confirmations');
delete from auth.users where id in (tests.student_a_id(),tests.student_b_id(),tests.coach_mutation_id(999));
delete from auth.users where id=tests.coach_id();
select is((select count(*) from public.coach_training_receipts),0::bigint,'owner deletion cascades receipts');
select * from finish();
rollback;
