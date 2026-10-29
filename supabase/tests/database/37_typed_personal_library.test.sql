begin;
select no_plan();
select tests.setup_basic();
create function tests.library_typed_id(n integer) returns uuid language sql immutable as $$select ('af215100-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.exercises(id,name,muscle_group,record_type) values(tests.library_typed_id(800),'Plancha','Pecho','duration');
create function tests.library_typed_item() returns jsonb language sql immutable as $$
 select jsonb_build_object('id',tests.library_typed_id(100),'exerciseId',tests.library_typed_id(800),
 'prescribed',jsonb_build_object('recordType','duration','sets',2,'target',jsonb_build_object('repsMin',null,'repsMax',null,'targetWeightKg',null,'targetDurationSeconds',60,'targetDistanceMeters',null),'series',null),
 'note','Indicación','restSeconds',90,'supersetId',null,'supersetRestSeconds',null)
$$;
create function tests.library_typed_data() returns jsonb language sql immutable as $$
 select jsonb_build_object('name','Tiempo','folderId',null,'items',jsonb_build_array(tests.library_typed_item()))
$$;
select has_column('public','personal_routine_items','typed_prescription','prescripción canónica nullable');
select col_is_null('public','personal_routine_items','reps_min','tiempo no requiere reps ficticias');
select isnt_definer('public','get_training_library',array[]::text[],'lector invoker');
select isnt_definer('public','mutate_training_library',array['uuid','text','uuid','integer','jsonb','integer'],'mutación invoker');
select isnt_definer('public','mutate_personal_library',array['uuid','text','uuid','integer','jsonb'],'puente anterior invoker');
select ok(not has_function_privilege('anon','public.get_training_library()','EXECUTE'),'anónimo sin lectura');
select ok(not has_function_privilege('anon','public.mutate_training_library(uuid,text,uuid,integer,jsonb,integer)','EXECUTE'),'anónimo sin mutación');
select ok(not exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid in ('public.get_training_library()'::regprocedure,'public.mutate_training_library(uuid,text,uuid,integer,jsonb,integer)'::regprocedure,'public.personal_training_prescription(jsonb)'::regprocedure) and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC sin execute');
select ok((select bool_and('search_path=""'=any(p.proconfig)) from pg_proc p where p.oid in ('public.get_training_library()'::regprocedure,'public.mutate_training_library(uuid,text,uuid,integer,jsonb,integer)'::regprocedure)),'search_path cerrado');
select tests.authenticate_as(tests.student_a_id());
select is(public.get_training_library()->>'version','2','snapshot2');
select is(public.mutate_training_library(tests.library_typed_id(1),'routine_create',tests.library_typed_id(2),0,tests.library_typed_data(),2)->>'status','created','crea tipada con rol real');
select is((select reps_min from public.personal_routine_items where id=tests.library_typed_id(100)),null::smallint,'reps mínimas null');
select is((select reps_max from public.personal_routine_items where id=tests.library_typed_id(100)),null::smallint,'reps máximas null');
select is((select typed_prescription->'target'->>'targetDurationSeconds' from public.personal_routine_items where id=tests.library_typed_id(100)),'60','tiempo canónico');
select is(public.get_training_library()->'routines'->0->'items'->0->'prescribed',tests.library_typed_item()->'prescribed','lectura sin pérdida');
select throws_ok($$select public.get_personal_library()$$,'0A000',null,'lector anterior no omite objetivos');
select is(public.mutate_training_library(tests.library_typed_id(1),'routine_create',tests.library_typed_id(2),0,tests.library_typed_data(),2)->>'duplicate','true','replay exacto antes de revisión');
select throws_ok($$select public.mutate_training_library(tests.library_typed_id(1),'routine_create',tests.library_typed_id(2),0,tests.library_typed_data(),1)$$,'22023',null,'hash incluye versión2');
select throws_ok($$select public.mutate_training_library(tests.library_typed_id(3),'routine_create',tests.library_typed_id(4),0,jsonb_set(tests.library_typed_data(),'{items,0,prescribed,target,repsMin}','8'),2)$$,'22023',null,'dimensión incorrecta rechazada');
select is((select count(*) from public.personal_routines where id=tests.library_typed_id(4)),0::bigint,'cabecera inválida ausente');
select throws_ok($$update public.personal_routine_items set reps_min=1 where id=tests.library_typed_id(100)$$,'23514',null,'DML sin doble fuente');
select throws_ok($$update public.personal_routine_items set sets=3 where id=tests.library_typed_id(100)$$,'23514',null,'DML cantidad coherente');
select throws_ok($$update public.personal_routine_items set typed_prescription=jsonb_set(typed_prescription,'{recordType}','"weight_reps"') where id=tests.library_typed_id(100)$$,'22023',null,'DML tipo real del ejercicio');
select throws_ok($$update public.personal_routine_items set typed_prescription='null' where id=tests.library_typed_id(100)$$,'22023',null,'JSON null no es prescripción legada');
select throws_ok($$update public.personal_routine_items set typed_prescription=null where id=tests.library_typed_id(100)$$,'22023',null,'sin downgrade a reps para tiempo');
select throws_ok($$update public.personal_routine_items set typed_prescription=jsonb_set(typed_prescription,'{sets}','2.5') where id=tests.library_typed_id(100)$$,'23514',null,'DML no redondea cantidades');
select lives_ok($$select public.mutate_training_library(tests.library_typed_id(5),'routine_copy',tests.library_typed_id(6),0,jsonb_build_object('sourceId',tests.library_typed_id(2),'sourceRevision',(select revision from public.personal_routines where id=tests.library_typed_id(2)),'name','Copia','folderId',null),2)$$,'copia canónica independiente');
select is((select count(*) from public.personal_routine_items where routine_id=tests.library_typed_id(6) and id<>tests.library_typed_id(100)),1::bigint,'nueva fila al copiar');
select tests.authenticate_as(tests.student_b_id());
select is(public.get_training_library()->'routines','[]'::jsonb,'otra cuenta sin bases');
select is((select count(*) from public.personal_routine_items where routine_id=tests.library_typed_id(2)),0::bigint,'RLS directo');
select tests.authenticate_as(tests.coach_id());
select is(public.get_training_library()->'routines','[]'::jsonb,'coach no recibe bases privadas ajenas');
select tests.authenticate_as(tests.student_a_id());
delete from public.personal_routines where id=tests.library_typed_id(2);
select is(public.mutate_training_library(tests.library_typed_id(1),'routine_create',tests.library_typed_id(2),0,tests.library_typed_data(),2)->>'status','removed','tombstone conserva eliminación');
select throws_ok($$select public.mutate_personal_library(tests.library_typed_id(7),'routine_create',tests.library_typed_id(2),0,'{"name":"Anterior","folderId":null,"items":[]}')$$,'23505',null,'cliente anterior no resucita');
reset role;
select * from finish();
rollback;
