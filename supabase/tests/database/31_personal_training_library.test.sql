-- T211: propiedad, mutaciones completas, recibos y lectura de la biblioteca personal.
begin;
select no_plan();
select tests.setup_basic();
create function tests.personal_id(n integer) returns uuid language sql immutable as $$
 select ('ab210000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function tests.personal_item(n integer,ex uuid,grp uuid default null) returns jsonb language sql immutable as $$
 select jsonb_build_object('id',tests.personal_id(n),'exerciseId',ex,'sets',2,'repsMin',8,'repsMax',12,
 'targetWeightKg',30,'note','Nota privada','restSeconds',90,'supersetId',grp,
 'supersetRestSeconds',case when grp is null then null else 60 end,'series',null)
$$;
create function tests.personal_rev(target uuid) returns integer language plpgsql stable as $$
 begin return (select revision from public.personal_routines where id=target); end
$$;
create temp table personal_attempts(key text primary key,data jsonb);
grant select,insert on personal_attempts to authenticated;
select tests.create_profile(tests.personal_id(900),'student','Alumno C',tests.coach_id());
insert into public.exercises(id,name,muscle_group) values(tests.personal_id(800),'Press privado','Pecho'),(tests.personal_id(801),'Remo privado','Espalda');
select has_table('public','personal_folders','carpetas independientes');
select has_table('public','personal_routines','rutinas independientes');
select has_table('public','personal_routine_items','filas independientes');
select has_table('public','personal_training_receipts','recibos independientes');
select isnt_definer('public','mutate_personal_library',array['uuid','text','uuid','integer','jsonb'],'mutar no salta RLS');
select isnt_definer('public','get_personal_library',array[]::text[],'snapshot no salta RLS');
select tests.authenticate_as_anon();
select throws_ok($$select public.get_personal_library()$$,'42501',null,'visitante no consulta');
select throws_ok($$select public.mutate_personal_library(tests.personal_id(100),'folder_create',tests.personal_id(1),0,'{"name":"A"}')$$,'42501',null,'visitante no escribe');
reset role;
select tests.authenticate_as(tests.student_a_id());
select is(public.get_personal_library()->>'userId',tests.student_a_id()::text,'snapshot identidad propia');
select is(public.get_personal_library()->'folders','[]'::jsonb,'biblioteca vacía real');
select is(public.mutate_personal_library(tests.personal_id(100),'folder_create',tests.personal_id(1),0,'{"name":"Fuerza"}')->>'status','created','A crea carpeta');
select is(public.mutate_personal_library(tests.personal_id(100),'folder_create',tests.personal_id(1),0,'{"name":"Fuerza"}')->>'duplicate','true','mismo intento confirma');
select throws_ok($$select public.mutate_personal_library(tests.personal_id(100),'folder_create',tests.personal_id(1),0,'{"name":"Otro"}')$$,'22023',null,'request no cambia de contenido');
select is(public.mutate_personal_library(tests.personal_id(101),'routine_create',tests.personal_id(10),0,jsonb_build_object('name','A','folderId',tests.personal_id(1),'items',jsonb_build_array(tests.personal_item(20,tests.personal_id(800)),tests.personal_item(21,tests.personal_id(801)))))->>'status','created','crea rutina completa');
select is(jsonb_array_length(public.get_personal_library()->'routines'->0->'items'),2,'snapshot con todos los items');
select is(public.get_personal_library()->'routines'->0->'items'->0->>'name','Press privado','metadatos reales del catálogo');
select is(public.get_personal_library()->'routines'->0->'items'->0->>'note','Nota privada','nota conservada');
select throws_ok($$select public.mutate_personal_library(tests.personal_id(102),'routine_save',tests.personal_id(10),-1,'{"name":"Perdido","items":[]}')$$,'40001',null,'revisión obsoleta falla');
select throws_ok($$select public.mutate_personal_library(tests.personal_id(103),'routine_save',tests.personal_id(10),tests.personal_rev(tests.personal_id(10)),jsonb_build_object('name','Perdido','items',jsonb_build_array(tests.personal_item(20,tests.personal_id(800)),tests.personal_item(22,tests.personal_id(999)))))$$,'22023',null,'fila inválida revierte cabecera y filas');
select is((select name from public.personal_routines where id=tests.personal_id(10)),'A','no hubo guardado parcial');
select is((select count(*)::int from public.personal_routine_items where routine_id=tests.personal_id(10)),2,'no hubo pérdida parcial');
select lives_ok($$select public.mutate_personal_library(tests.personal_id(104),'routine_save',tests.personal_id(10),tests.personal_rev(tests.personal_id(10)),jsonb_build_object('name','A editada','items',jsonb_build_array(tests.personal_item(20,tests.personal_id(800)),tests.personal_item(21,tests.personal_id(801)))))$$,'guarda con ids estables');
select is((select id from public.personal_routine_items where routine_id=tests.personal_id(10) and position=0),tests.personal_id(20),'conserva identidad de item');
insert into personal_attempts values('copy',jsonb_build_object('sourceId',tests.personal_id(10),'sourceRevision',tests.personal_rev(tests.personal_id(10)),'name','Copia','folderId',null));
select lives_ok($$select public.mutate_personal_library(tests.personal_id(105),'routine_copy',tests.personal_id(11),0,(select data from personal_attempts where key='copy'))$$,'copia a raíz');
select is((select count(*)::int from public.personal_routine_items where routine_id=tests.personal_id(11)),2,'copia todas las filas');
select is((select count(*)::int from public.personal_routine_items where routine_id=tests.personal_id(11) and id in(tests.personal_id(20),tests.personal_id(21))),0,'copia regenera ids');
select is(public.mutate_personal_library(tests.personal_id(106),'routine_create',tests.personal_id(12),0,'{"name":"Vacía","folderId":null,"items":[]}')->>'status','created','editor admite rutina vacía');
select lives_ok($$select public.mutate_personal_library(tests.personal_id(107),'routines_reorder',tests.student_a_id(),null,jsonb_build_object('folderId',null,'entries',jsonb_build_array(jsonb_build_object('id',tests.personal_id(12),'revision',tests.personal_rev(tests.personal_id(12))),jsonb_build_object('id',tests.personal_id(11),'revision',tests.personal_rev(tests.personal_id(11))))))$$,'ordena lista completa de raíz');
select is((select position::int from public.personal_routines where id=tests.personal_id(12)),0,'orden aplicado');
select throws_ok($$select public.mutate_personal_library(tests.personal_id(108),'routines_reorder',tests.student_a_id(),null,jsonb_build_object('folderId',null,'entries','[]'::jsonb))$$,'40001',null,'no omite miembros de colección');
select lives_ok($$select public.mutate_personal_library(tests.personal_id(109),'folder_delete',tests.personal_id(1),(select revision from public.personal_folders where id=tests.personal_id(1)),'{}')$$,'borra carpeta');
select is((select folder_id from public.personal_routines where id=tests.personal_id(10)),null::uuid,'carpeta mueve rutina a raíz');
select is((select position::int from public.personal_routines where id=tests.personal_id(10)),2,'rutina movida al final de raíz');
select is((select count(*)::int from public.personal_routine_items where routine_id=tests.personal_id(10)),2,'borrar carpeta conserva filas');
insert into personal_attempts values('delete',to_jsonb(tests.personal_rev(tests.personal_id(11))));
select lives_ok($$select public.mutate_personal_library(tests.personal_id(110),'routine_delete',tests.personal_id(11),(select data::text::integer from personal_attempts where key='delete'),'{}')$$,'borra copia');
select is(public.mutate_personal_library(tests.personal_id(110),'routine_delete',tests.personal_id(11),(select data::text::integer from personal_attempts where key='delete'),'{}')->>'status','deleted','replay delete conserva confirmación');
select is(public.mutate_personal_library(tests.personal_id(105),'routine_copy',tests.personal_id(11),0,(select data from personal_attempts where key='copy'))->>'status','removed','replay copia borrada no resucita');
select throws_ok($$select public.mutate_personal_library(tests.personal_id(111),'routine_create',tests.personal_id(11),0,'{"name":"Resucitada","folderId":null,"items":[]}')$$,'23505',null,'no recicla id con otra petición');
select is((select count(*)::int from public.personal_routines where id=tests.personal_id(11)),0,'sigue borrada');
select ok(not exists(select 1 from public.personal_training_receipts where result::text like '%Nota privada%' or result::text like '%A editada%'),'recibos no duplican notas/nombres');
select throws_ok($$delete from public.personal_training_receipts$$,'42501',null,'recibos no se borran con API ordinaria');
select throws_ok($$update public.personal_routines set owner_id=tests.student_b_id() where id=tests.personal_id(10)$$,'42501',null,'propietario inmutable');
select throws_ok($$update public.personal_routines set id=tests.personal_id(99) where id=tests.personal_id(10)$$,'42501',null,'id inmutable');
select throws_ok($$update public.personal_routine_items set sets=0 where id=tests.personal_id(20)$$,'23514',null,'DML directo valida series');
select throws_ok($$update public.personal_routine_items set prescription_sets='[{"repsMin":8,"repsMax":12}]' where id=tests.personal_id(20)$$,'23514',null,'DML directo valida detalle coherente');
reset role;
-- B y C, y coach, solo acceden a su biblioteca personal (no la de A).
select tests.authenticate_as(tests.student_b_id());
select is(jsonb_array_length(public.get_personal_library()->'routines'),0,'B no ve bases A');
select throws_ok($$select public.mutate_personal_library(tests.personal_id(201),'routine_save',tests.personal_id(10),0,'{"name":"Ajena","items":[]}')$$,'P0002',null,'B no edita base A');
select lives_ok($$select public.mutate_personal_library(tests.personal_id(202),'routine_create',tests.personal_id(30),0,'{"name":"Base B","folderId":null,"items":[]}')$$,'B puede crear propia');
reset role;
select tests.authenticate_as(tests.personal_id(900));
select is(jsonb_array_length(public.get_personal_library()->'routines'),0,'C no ve otras bases');
reset role;
select tests.authenticate_as(tests.coach_id());
select is(jsonb_array_length(public.get_personal_library()->'routines'),0,'coach no ve bases privadas del alumno');
select lives_ok($$select public.mutate_personal_library(tests.personal_id(203),'routine_create',tests.personal_id(31),0,'{"name":"Base coach","folderId":null,"items":[]}')$$,'coach tiene propia biblioteca');
reset role;
-- Un archivado sigue visible únicamente por una referencia propia anterior.
update public.exercises set archived_at=now() where id=tests.personal_id(800);
select tests.authenticate_as(tests.student_a_id());
select is((select name from public.exercises where id=tests.personal_id(800)),'Press privado','A lee archivado ya referenciado');
select lives_ok($$select public.mutate_personal_library(tests.personal_id(204),'routine_copy',tests.personal_id(32),0,jsonb_build_object('sourceId',tests.personal_id(10),'sourceRevision',tests.personal_rev(tests.personal_id(10)),'name','Archivado propio','folderId',null))$$,'copia referencia archivada propia');
reset role;
select tests.authenticate_as(tests.student_b_id());
select is((select count(*)::int from public.exercises where id=tests.personal_id(800)),0,'B no descubre archivado ajeno');
select throws_ok($$select public.mutate_personal_library(tests.personal_id(205),'routine_create',tests.personal_id(33),0,jsonb_build_object('name','Archivado ajeno','folderId',null,'items',jsonb_build_array(tests.personal_item(40,tests.personal_id(800)))))$$,'22023',null,'no se autoautoriza archivado nuevo');
reset role;
-- Borrado de cuenta retira las cuatro tablas de A sin tocar B ni coach.
select tests.authenticate_as(tests.student_a_id());
select lives_ok($$select public.delete_my_account()$$,'borrado Auth no rompe triggers invoker');
reset role;
select is((select count(*)::int from public.personal_folders where owner_id=tests.student_a_id()),0,'sin carpetas A');
select is((select count(*)::int from public.personal_routines where owner_id=tests.student_a_id()),0,'sin rutinas A');
select is((select count(*)::int from public.personal_routine_items where owner_id=tests.student_a_id()),0,'sin items A');
select is((select count(*)::int from public.personal_training_receipts where owner_id=tests.student_a_id()),0,'sin recibos A');
select is((select count(*)::int from public.personal_routines where owner_id=tests.student_b_id()),1,'B conservado');
select is((select count(*)::int from public.personal_routines where owner_id=tests.coach_id()),1,'coach conservado');
select * from finish();
rollback;
