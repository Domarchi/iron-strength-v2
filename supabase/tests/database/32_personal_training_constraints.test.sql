-- T211: límites también en DML, grupos, órdenes, identidad y cascadas Auth reales.
begin;
select no_plan();
select tests.setup_basic();
create function tests.p211_id(n integer) returns uuid language sql immutable as $$
 select ('ac210000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function tests.p211_item(n integer,grp integer default null) returns jsonb language sql immutable as $$
 select jsonb_build_object('id',tests.p211_id(n),'exerciseId',tests.p211_id(800),'sets',2,'repsMin',8,'repsMax',12,
 'targetWeightKg',null,'note',null,'restSeconds',0,'supersetId',case when grp is null then null else tests.p211_id(grp) end,
 'supersetRestSeconds',case when grp is null then null else 60 end,'series',null)
$$;
create function tests.p211_rev(target integer) returns integer language sql stable as $$
 select revision from public.personal_routines where id=tests.p211_id(target)
$$;
create function tests.p211_checked(query text) returns void language plpgsql as $$
begin
 execute query;
 set constraints all immediate;
 set constraints all deferred;
end;
$$;
create temp table p211_previous(key text primary key,value integer);
grant select,insert on p211_previous to authenticated;
-- Una referencia futura demuestra que el guardado no borra/reinserta los IDs supervivientes.
create table tests.p211_future_reference(item_id uuid references public.personal_routine_items(id) on delete restrict);
grant select,insert,delete on tests.p211_future_reference to authenticated;
insert into public.exercises(id,coach_id,name,muscle_group) values(tests.p211_id(800),tests.coach_id(),'Ejercicio del coach','Pecho');
select tests.authenticate_as(tests.student_a_id());
select public.mutate_personal_library(tests.p211_id(100),'folder_create',tests.p211_id(1),0,'{"name":"Uno"}');
select public.mutate_personal_library(tests.p211_id(101),'folder_create',tests.p211_id(2),0,'{"name":"Dos"}');
select is(public.mutate_personal_library(tests.p211_id(102),'folder_rename',tests.p211_id(1),
 (select revision from public.personal_folders where id=tests.p211_id(1)),'{"name":"  Renombrada  "}')->>'status','updated','renombra carpeta');
select is((select name from public.personal_folders where id=tests.p211_id(1)),'Renombrada','nombre normalizado');
select lives_ok($$select public.mutate_personal_library(tests.p211_id(103),'folders_reorder',tests.student_a_id(),null,
 jsonb_build_object('entries',(select jsonb_agg(jsonb_build_object('id',id,'revision',revision) order by position desc) from public.personal_folders)))$$,'ordena todas las carpetas');
select is((select position from public.personal_folders where id=tests.p211_id(2)),0,'orden carpeta aplicado');
select throws_ok($$select public.mutate_personal_library(tests.p211_id(104),'folders_reorder',tests.student_b_id(),null,'{"entries":[]}')$$,'22023',null,'orden no acepta identidad ajena');
select throws_ok($$select public.mutate_personal_library(tests.p211_id(105),'folder_create',tests.p211_id(3),0,'{"name":"Tres","ownerId":"ajeno"}')$$,'22023',null,'objeto cerrado');
select lives_ok($$select public.mutate_personal_library(tests.p211_id(106),'routine_create',tests.p211_id(10),0,
 jsonb_build_object('name','Agrupada','folderId',null,'items',jsonb_build_array(tests.p211_item(20,90),tests.p211_item(21,90),tests.p211_item(22))))$$,'grupo de dos y descanso cero válidos');
select is(public.get_personal_library()->'routines'->0->'items'->0->>'note','','nota nullable se presenta como texto vacío');
insert into p211_previous values('header',tests.p211_rev(10));
update public.personal_routines set name='Cabecera directa',revision=999999 where id=tests.p211_id(10);
select ok(tests.p211_rev(10)>(select value from p211_previous where key='header') and tests.p211_rev(10)<>999999,'DML directo incrementa revisión sin aceptar revisión cliente');
insert into p211_previous values('item',tests.p211_rev(10));
update public.personal_routine_items set note='Edición directa' where id=tests.p211_id(22);
select ok(tests.p211_rev(10)>(select value from p211_previous where key='item'),'editar fila incrementa revisión del padre');
select lives_ok($$select public.mutate_personal_library(tests.p211_id(107),'routine_move',tests.p211_id(10),tests.p211_rev(10),jsonb_build_object('folderId',tests.p211_id(1)))$$,'mueve a carpeta propia');
select is((select folder_id from public.personal_routines where id=tests.p211_id(10)),tests.p211_id(1),'destino conservado');
select throws_ok($$select tests.p211_checked('update public.personal_routine_items set superset_id=null,superset_rest_seconds=null where id=tests.p211_id(20)')$$,'23514',null,'DML no deja grupo de uno');
select throws_ok($$select tests.p211_checked('update public.personal_routine_items set superset_rest_seconds=90 where id=tests.p211_id(20)')$$,'23514',null,'DML no separa descanso del grupo');
select throws_ok($$select tests.p211_checked('update public.personal_routine_items set position=4 where id=tests.p211_id(22)')$$,'23514',null,'DML no deja posiciones no densas');
select throws_ok($$select tests.p211_checked('update public.personal_routine_items set position=case position when 1 then 2 when 2 then 1 else position end where routine_id=tests.p211_id(10)')$$,'23514',null,'DML no separa miembros del grupo');
select throws_ok($$update public.personal_routine_items set routine_id=tests.p211_id(11) where id=tests.p211_id(22)$$,'42501',null,'padre de fila inmutable');
select throws_ok($$update public.personal_routine_items set rest_seconds=14 where id=tests.p211_id(22)$$,'23514',null,'descanso corto inválido');
select throws_ok($$update public.personal_routine_items set target_weight_kg=30.001 where id=tests.p211_id(22)$$,'23514',null,'precisión de peso validada');
select throws_ok($$update public.personal_routine_items set note=repeat('x',501) where id=tests.p211_id(22)$$,'23514',null,'nota limitada en DML');
select throws_ok($$select public.mutate_personal_library(tests.p211_id(108),'routine_save',tests.p211_id(10),tests.p211_rev(10),
 jsonb_build_object('name','Inválida','items',jsonb_build_array(tests.p211_item(20,90))))$$,'22023',null,'RPC valida grupo antes de confirmar');
select is((select name from public.personal_routines where id=tests.p211_id(10)),'Cabecera directa','grupo inválido revierte también cabecera');
insert into tests.p211_future_reference values(tests.p211_id(22));
select lives_ok($$select public.mutate_personal_library(tests.p211_id(109),'routine_save',tests.p211_id(10),tests.p211_rev(10),
 jsonb_build_object('name','Guardada','items',jsonb_build_array(tests.p211_item(20,90),tests.p211_item(21,90),
 tests.p211_item(22)||'{"series":[{"repsMin":8,"repsMax":10,"targetWeightKg":20},{"repsMin":10,"repsMax":12,"targetWeightKg":30}]}')))$$,'preserva item con FK y detalle por serie');
select is(jsonb_array_length((select prescription_sets from public.personal_routine_items where id=tests.p211_id(22))),2,'conserva detalle coherente');
delete from tests.p211_future_reference;
select lives_ok($$select public.mutate_personal_library(tests.p211_id(110),'routine_copy',tests.p211_id(11),0,
 jsonb_build_object('sourceId',tests.p211_id(10),'sourceRevision',tests.p211_rev(10),'name','Copia','folderId',null))$$,'copia grupo y detalle');
select is((select count(distinct superset_id)::int from public.personal_routine_items where routine_id=tests.p211_id(11)),1,'copia conserva pertenencia de grupo');
select isnt((select superset_id from public.personal_routine_items where routine_id=tests.p211_id(11) and position=0),tests.p211_id(90),'copia regenera ID de grupo');
select is((select prescription_sets from public.personal_routine_items where routine_id=tests.p211_id(11) and position=2),
 (select prescription_sets from public.personal_routine_items where id=tests.p211_id(22)),'copia conserva detalle');
select lives_ok($$select public.mutate_personal_library(tests.p211_id(111),'routine_create',tests.p211_id(12),0,
 jsonb_build_object('name','Máxima','folderId',null,'items',(select jsonb_agg(tests.p211_item(n) order by n) from generate_series(40,54) n)))$$,'admite exactamente quince filas');
select throws_ok($$select public.mutate_personal_library(tests.p211_id(112),'routine_save',tests.p211_id(12),tests.p211_rev(12),
 jsonb_build_object('name','Demasiadas','items',(select jsonb_agg(tests.p211_item(n) order by n) from generate_series(40,55) n)))$$,'22023',null,'RPC rechaza dieciséis filas');
select throws_ok($$insert into public.personal_routine_items(id,owner_id,routine_id,exercise_id,position,sets,reps_min,reps_max)
 values(tests.p211_id(55),tests.student_a_id(),tests.p211_id(12),tests.p211_id(800),0,2,8,12)$$,'23514',null,'DML no elude cantidad máxima');
select lives_ok($$set constraints all immediate$$,'todas las restricciones finales válidas');
set constraints all deferred;
reset role;
update public.profiles set is_active=false where id=tests.student_a_id();
select tests.authenticate_as(tests.student_a_id());
select throws_ok($$select public.get_personal_library()$$,'42501',null,'cuenta inactiva no lee snapshot');
select throws_ok($$select public.mutate_personal_library(tests.p211_id(113),'folder_create',tests.p211_id(3),0,'{"name":"Inactiva"}')$$,'42501',null,'cuenta inactiva no muta');
select is((select count(*)::int from public.personal_routines),0,'RLS directo también niega lectura inactiva');
reset role;
update public.profiles set is_active=true where id=tests.student_a_id();
-- Los metadatos del ejercicio del coach sobreviven al borrado de otro propietario.
select tests.authenticate_as(tests.student_b_id());
select public.mutate_personal_library(tests.p211_id(114),'routine_create',tests.p211_id(13),0,
 jsonb_build_object('name','B','folderId',null,'items',jsonb_build_array(tests.p211_item(60))));
reset role;
select tests.authenticate_as(tests.student_a_id());
select lives_ok($$select public.delete_my_account()$$,'A borra cuenta con ejercicios propiedad del coach');
reset role;
select tests.authenticate_as(tests.student_b_id());
select is(public.get_personal_library()->'routines'->0->'items'->0->>'name','Ejercicio del coach','B conserva metadatos propios');
reset role;
select tests.authenticate_as(tests.coach_id());
select throws_ok($$select public.delete_my_account()$$,'42501',null,'coach sigue sin poder borrarse desde app');
select public.mutate_personal_library(tests.p211_id(115),'routine_create',tests.p211_id(14),0,
 jsonb_build_object('name','Coach','folderId',null,'items',jsonb_build_array(tests.p211_item(61))));
reset role;
-- La restricción previa del perfil impide borrar un coach mientras quedan alumnos.
select throws_ok($$delete from auth.users where id=tests.coach_id()$$,'23503',null,'coach con alumno no se borra ni pierde ejercicio ajeno');
select tests.authenticate_as(tests.student_b_id());
select lives_ok($$select public.delete_my_account()$$,'B borra cuenta');
reset role;
-- Orden de las cascadas SQL. El rol real de GoTrue se verifica por Auth en integración.
select lives_ok($$delete from auth.users where id=tests.coach_id()$$,'SQL puede borrar coach sin alumnos y con referencias propias');
select is((select count(*)::int from public.personal_routine_items),0,'cascadas Auth no dejan filas huérfanas');
select * from finish();
rollback;
