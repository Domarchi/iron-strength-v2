-- T215: una única prescripción canónica; las filas anteriores permanecen intactas.
alter table public.personal_routine_items
 add column typed_prescription jsonb,
 alter column reps_min drop not null,
 alter column reps_max drop not null;
alter table public.personal_routine_items add constraint personal_item_prescription_format check (
 case when typed_prescription is null then reps_min is not null and reps_max is not null
 when public.valid_training_prescription(typed_prescription) then
   sets=(typed_prescription->>'sets')::numeric and reps_min is null and reps_max is null
   and target_weight_kg is null and prescription_sets is null
 else false end
);

-- Proyección pura: no consulta una base actual para reinterpretar un histórico.
create function public.personal_training_prescription(p_item jsonb) returns jsonb
 language sql immutable security invoker set search_path='' as $$
 select coalesce(nullif(p_item->'typed_prescription','null'::jsonb),jsonb_build_object('recordType',null,'sets',p_item->'sets',
   'target',jsonb_build_object('repsMin',p_item->'reps_min','repsMax',p_item->'reps_max',
     'targetWeightKg',p_item->'target_weight_kg','targetDurationSeconds',null,'targetDistanceMeters',null),
   'series',case when nullif(p_item->'prescription_sets','null'::jsonb) is null then 'null'::jsonb else
     (select jsonb_agg(t.value||jsonb_build_object('targetDurationSeconds',null,'targetDistanceMeters',null) order by t.ordinality)
      from jsonb_array_elements(p_item->'prescription_sets') with ordinality t(value,ordinality)) end));
$$;

create or replace function public.guard_personal_item() returns trigger
 language plpgsql security invoker set search_path='' as $$
declare v_owner uuid; v_routine uuid; v_record_type text;
begin
 v_owner:=case when tg_op='DELETE' then old.owner_id else new.owner_id end;
 v_routine:=case when tg_op='DELETE' then old.routine_id else new.routine_id end;
 if current_user='supabase_auth_admin' and tg_op='DELETE' then return old; end if;
 if current_user='authenticated' and (v_owner is distinct from auth.uid() or not public.is_active_member()) then
   raise exception 'Recurso no autorizado' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,211));
 if tg_op='UPDATE' and (new.id,new.owner_id,new.routine_id) is distinct from (old.id,old.owner_id,old.routine_id) then
   raise exception 'Identidad inmutable' using errcode='42501';
 end if;
 perform 1 from public.personal_routines where id=v_routine and owner_id=v_owner for update;
 if tg_op<>'DELETE' then
   if not found then raise exception 'Rutina no encontrada' using errcode='P0002'; end if;
   -- BEFORE INSERT no ve el item nuevo: no puede autoautorizar un ejercicio archivado.
   if not exists(select 1 from public.exercises e where e.id=new.exercise_id and
     (e.archived_at is null or exists(select 1 from public.personal_routine_items i
       where i.owner_id=v_owner and i.exercise_id=e.id))) then
     raise exception 'Ejercicio no disponible' using errcode='22023';
   end if;
   select e.record_type into v_record_type from public.exercises e where e.id=new.exercise_id;
   if (new.typed_prescription is null and v_record_type is not null) or
     (new.typed_prescription is not null and
       v_record_type is distinct from new.typed_prescription->>'recordType') then
     raise exception 'Tipo de prescripción incompatible' using errcode='22023';
   end if;
   if tg_op='INSERT' and not exists(select 1 from public.personal_routine_items where id=new.id) and
     (select count(*) from public.personal_routine_items where routine_id=v_routine)>=15 then
     raise exception 'Máximo 15 ejercicios' using errcode='23514';
   end if;
 end if;
 -- Si el padre ya cae en cascada, UPDATE no toca ninguna fila.
 update public.personal_routines set revision=revision+1 where id=v_routine and owner_id=v_owner;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
create or replace function public.get_personal_library() returns jsonb
 language plpgsql stable security invoker set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_result jsonb;
begin
 if v_owner is null or not public.is_active_member() then raise exception 'Se requiere una cuenta activa' using errcode='42501'; end if;
 if exists(select 1 from public.personal_routine_items where owner_id=v_owner and typed_prescription is not null) then
   raise exception 'Esta biblioteca requiere un cliente actualizado' using errcode='0A000';
 end if;
 select jsonb_build_object('version',1,'userId',v_owner,
  'folders',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'position',f.position,'revision',f.revision) order by f.position,f.id)
    from public.personal_folders f where f.owner_id=v_owner),'[]'::jsonb),
  'routines',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'folderId',r.folder_id,'position',r.position,
    'revision',r.revision,'createdAt',r.created_at,'updatedAt',r.updated_at,
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'exerciseId',i.exercise_id,'name',e.name,
      'muscleGroup',e.muscle_group,'equipment',e.equipment,'isBodyweight',e.is_bodyweight,'progressionIncrementKg',e.progression_increment_kg,
      'position',i.position,'sets',i.sets,'repsMin',i.reps_min,'repsMax',i.reps_max,'targetWeightKg',i.target_weight_kg,
      'note',coalesce(i.note,''),'restSeconds',i.rest_seconds,'supersetId',i.superset_id,'supersetRestSeconds',i.superset_rest_seconds,'series',i.prescription_sets)
      order by i.position,i.id) from public.personal_routine_items i join public.exercises e on e.id=i.exercise_id
      where i.routine_id=r.id and i.owner_id=v_owner),'[]'::jsonb)) order by r.folder_id nulls first,r.position,r.id)
    from public.personal_routines r where r.owner_id=v_owner),'[]'::jsonb)) into v_result;
 return v_result;
end;
$$;

create function public.get_training_library() returns jsonb
 language plpgsql stable security invoker set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_result jsonb;
begin
 if v_owner is null or not public.is_active_member() then raise exception 'Se requiere una cuenta activa' using errcode='42501'; end if;
 select jsonb_build_object('version',2,'userId',v_owner,
  'folders',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'position',f.position,'revision',f.revision) order by f.position,f.id)
    from public.personal_folders f where f.owner_id=v_owner),'[]'::jsonb),
  'routines',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'folderId',r.folder_id,'position',r.position,
    'revision',r.revision,'createdAt',r.created_at,'updatedAt',r.updated_at,
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'exerciseId',i.exercise_id,'name',e.name,
      'muscleGroup',e.muscle_group,'equipment',e.equipment,'isBodyweight',e.is_bodyweight,'progressionIncrementKg',e.progression_increment_kg,
      'position',i.position,'recordType',e.record_type,'prescribed',public.personal_training_prescription(to_jsonb(i)),
      'note',coalesce(i.note,''),'restSeconds',i.rest_seconds,'supersetId',i.superset_id,'supersetRestSeconds',i.superset_rest_seconds)
      order by i.position,i.id) from public.personal_routine_items i join public.exercises e on e.id=i.exercise_id
      where i.routine_id=r.id and i.owner_id=v_owner),'[]'::jsonb)) order by r.folder_id nulls first,r.position,r.id)
    from public.personal_routines r where r.owner_id=v_owner),'[]'::jsonb)) into v_result;
 return v_result;
end;
$$;

create function public.mutate_training_library(p_request_id uuid,p_operation text,p_target_id uuid,
 p_expected_revision integer,p_data jsonb,p_version integer) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare
 v_owner uuid:=auth.uid(); v_hash text; v_receipt public.personal_training_receipts%rowtype;
 v_folder public.personal_folders%rowtype; v_routine public.personal_routines%rowtype;
 v_source public.personal_routines%rowtype; v_items jsonb; v_item jsonb; v_entry jsonb;
 v_folder_id uuid; v_source_id uuid; v_revision integer; v_status text; v_result jsonb;
 v_position integer; v_count integer; v_index integer; v_keys text[]; v_ids uuid[];
 v_group uuid; v_new_group uuid; v_groups jsonb:='{}'::jsonb; v_group_map jsonb;
 v_storage jsonb; v_prescription jsonb; v_original record; v_alive boolean; v_kind text; v_copy_ids uuid[];
begin
 if v_owner is null or not public.is_active_member() then raise exception 'Se requiere una cuenta activa' using errcode='42501'; end if;
 if p_version is null or p_version not in (1,2) then raise exception 'Versión inválida' using errcode='22023'; end if;
 if p_request_id is null or p_target_id is null or p_operation is null or p_data is null or jsonb_typeof(p_data)<>'object' or
   p_operation not in ('folder_create','folder_rename','folder_delete','folders_reorder','routine_create','routine_save',
   'routine_move','routine_delete','routine_copy','routines_reorder') then
   raise exception 'Solicitud inválida' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,211));
 v_hash:=encode(pg_catalog.sha256(convert_to((jsonb_build_object('operation',p_operation,'targetId',p_target_id,
   'expectedRevision',p_expected_revision,'data',p_data)||case when p_version=2 then jsonb_build_object('version',2) else '{}'::jsonb end)::text,'UTF8')),'hex');
 select * into v_receipt from public.personal_training_receipts where owner_id=v_owner and request_id=p_request_id;
 if found then
   if v_receipt.payload_hash<>v_hash then raise exception 'Petición reutilizada con otro contenido' using errcode='22023'; end if;
   v_result:=v_receipt.result||jsonb_build_object('duplicate',true);
   if p_operation not in ('folder_delete','routine_delete','folders_reorder','routines_reorder') then
     if p_operation like 'folder_%' then
       select exists(select 1 from public.personal_folders where id=p_target_id and owner_id=v_owner) into v_alive;
     else
       select exists(select 1 from public.personal_routines where id=p_target_id and owner_id=v_owner) into v_alive;
     end if;
     if not v_alive then v_result:=v_result||jsonb_build_object('status','removed','revision',null); end if;
   end if;
   return v_result;
 end if;
 v_keys:=case p_operation
   when 'folder_create' then array['name'] when 'folder_rename' then array['name']
   when 'folder_delete' then array[]::text[] when 'folders_reorder' then array['entries']
   when 'routine_create' then array['name','folderId','items'] when 'routine_save' then array['name','items']
   when 'routine_move' then array['folderId'] when 'routine_delete' then array[]::text[]
   when 'routine_copy' then array['sourceId','sourceRevision','name','folderId']
   when 'routines_reorder' then array['folderId','entries'] end;
 if not (p_data ?& v_keys) or exists(select 1 from jsonb_object_keys(p_data) k where not(k=any(v_keys))) then
   raise exception 'Campos inválidos' using errcode='22023';
 end if;
 if p_operation in ('folders_reorder','routines_reorder') then
   if p_target_id<>v_owner or p_expected_revision is not null then raise exception 'Identidad de orden inválida' using errcode='22023'; end if;
 elsif p_operation in ('folder_create','routine_create','routine_copy') then
   if p_expected_revision is distinct from 0 then raise exception 'Revisión inicial inválida' using errcode='22023'; end if;
   if exists(select 1 from public.personal_training_receipts where owner_id=v_owner and target_id=p_target_id and
     ((p_operation='folder_create' and operation='folder_create') or
      (p_operation<>'folder_create' and operation in ('routine_create','routine_copy')))) then
     raise exception 'Identificador ya utilizado' using errcode='23505';
   end if;
 else
   if p_operation like 'folder_%' then
     select * into v_folder from public.personal_folders where id=p_target_id and owner_id=v_owner for update;
     if not found then raise exception 'Carpeta no encontrada' using errcode='P0002'; end if;
     v_revision:=v_folder.revision;
   else
     select * into v_routine from public.personal_routines where id=p_target_id and owner_id=v_owner for update;
     if not found then raise exception 'Rutina no encontrada' using errcode='P0002'; end if;
     v_revision:=v_routine.revision;
   end if;
   if p_expected_revision is distinct from v_revision then raise exception 'La biblioteca cambió' using errcode='40001'; end if;
 end if;
 if 'name'=any(v_keys) and (jsonb_typeof(p_data->'name')<>'string' or length(btrim(p_data->>'name')) not between 1 and 100) then
   raise exception 'Nombre inválido' using errcode='22023';
 end if;
 if 'folderId'=any(v_keys) then
   if jsonb_typeof(p_data->'folderId') not in ('string','null') then raise exception 'Carpeta inválida' using errcode='22023'; end if;
   v_folder_id:=(p_data->>'folderId')::uuid;
   if v_folder_id is not null and not exists(select 1 from public.personal_folders where id=v_folder_id and owner_id=v_owner) then
     raise exception 'Carpeta no encontrada' using errcode='P0002';
   end if;
 end if;
 if p_version=1 and p_operation='routine_save' and exists(select 1 from public.personal_routine_items
   where owner_id=v_owner and routine_id=p_target_id and typed_prescription is not null) then
   raise exception 'Esta rutina requiere un cliente actualizado' using errcode='0A000';
 end if;
 if p_operation in ('routine_create','routine_save') then
   v_items:=p_data->'items';
 elsif p_operation='routine_copy' then
   if jsonb_typeof(p_data->'sourceId')<>'string' or jsonb_typeof(p_data->'sourceRevision')<>'number' or
     (p_data->>'sourceRevision')::numeric<>trunc((p_data->>'sourceRevision')::numeric) then raise exception 'Origen inválido' using errcode='22023'; end if;
   v_source_id:=(p_data->>'sourceId')::uuid;
   if v_source_id=p_target_id then raise exception 'Copia inválida' using errcode='22023'; end if;
   select * into v_source from public.personal_routines where id=v_source_id and owner_id=v_owner for update;
   if not found then raise exception 'Origen no encontrado' using errcode='P0002'; end if;
   if v_source.revision is distinct from (p_data->>'sourceRevision')::integer then raise exception 'El origen cambió' using errcode='40001'; end if;
   if p_version=1 and exists(select 1 from public.personal_routine_items where owner_id=v_owner
     and routine_id=v_source_id and typed_prescription is not null) then
     raise exception 'Esta rutina requiere un cliente actualizado' using errcode='0A000';
   end if;
   v_items:='[]'::jsonb;
   for v_original in select * from public.personal_routine_items where routine_id=v_source_id and owner_id=v_owner order by position,id loop
     v_new_group:=null;
     if v_original.superset_id is not null then
       v_new_group:=(v_groups->>v_original.superset_id::text)::uuid;
       if v_new_group is null then v_new_group:=gen_random_uuid();v_groups:=v_groups||jsonb_build_object(v_original.superset_id::text,v_new_group); end if;
     end if;
     if p_version=2 then
       v_items:=v_items||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'exerciseId',v_original.exercise_id,
         'prescribed',public.personal_training_prescription(to_jsonb(v_original)),
         'note',coalesce(v_original.note,''),'restSeconds',v_original.rest_seconds,'supersetId',v_new_group,
         'supersetRestSeconds',v_original.superset_rest_seconds));
     else
     v_items:=v_items||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'exerciseId',v_original.exercise_id,
       'sets',v_original.sets,'repsMin',v_original.reps_min,'repsMax',v_original.reps_max,'targetWeightKg',v_original.target_weight_kg,
       'note',coalesce(v_original.note,''),'restSeconds',v_original.rest_seconds,'supersetId',v_new_group,
       'supersetRestSeconds',v_original.superset_rest_seconds,'series',v_original.prescription_sets));
     end if;
   end loop;
 end if;
 if v_items is not null then
   if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)>15 then raise exception 'Ejercicios inválidos' using errcode='22023'; end if;
   if p_version=2 then
     v_storage:='[]'::jsonb;
     for v_item in select value from jsonb_array_elements(v_items) loop
       v_keys:=array['id','exerciseId','prescribed','note','restSeconds','supersetId','supersetRestSeconds'];
       if jsonb_typeof(v_item) is distinct from 'object' or not(v_item ?& v_keys) or
         v_item-v_keys<>'{}'::jsonb or jsonb_typeof(v_item->'note') is distinct from 'string' or
         not public.valid_training_prescription(v_item->'prescribed') then
         raise exception 'Prescripción inválida' using errcode='22023';
       end if;
       v_prescription:=v_item->'prescribed';
       v_storage:=v_storage||jsonb_build_array((v_item-'prescribed')||jsonb_build_object(
         'sets',v_prescription->'sets','repsMin',null,'repsMax',null,'targetWeightKg',null,
         'series',null,'typedPrescription',v_prescription));
     end loop;
     v_items:=v_storage;
   end if;
   v_ids:=array[]::uuid[];
   for v_item in select value from jsonb_array_elements(v_items) loop
     v_keys:=array['id','exerciseId','sets','repsMin','repsMax','targetWeightKg','note','restSeconds','supersetId','supersetRestSeconds','series']||case when p_version=2 then array['typedPrescription'] else array[]::text[] end;
     if jsonb_typeof(v_item)<>'object' or not(v_item ?& v_keys) or
       exists(select 1 from jsonb_object_keys(v_item) k where not(k=any(v_keys))) or
       jsonb_typeof(v_item->'id')<>'string' or jsonb_typeof(v_item->'exerciseId')<>'string' or
       jsonb_typeof(v_item->'sets')<>'number' or
       (p_version=1 and (jsonb_typeof(v_item->'repsMin')<>'number' or jsonb_typeof(v_item->'repsMax')<>'number')) or
       jsonb_typeof(v_item->'targetWeightKg') not in ('number','null') or jsonb_typeof(v_item->'note') not in ('string','null') or
       jsonb_typeof(v_item->'restSeconds') not in ('number','null') or jsonb_typeof(v_item->'supersetId') not in ('string','null') or
       jsonb_typeof(v_item->'supersetRestSeconds') not in ('number','null') then
       raise exception 'Ejercicio inválido' using errcode='22023';
     end if;
     if exists(select 1 from unnest(array['sets','repsMin','repsMax','restSeconds','supersetRestSeconds']) k
       where v_item->>k is not null and (v_item->>k)::numeric<>trunc((v_item->>k)::numeric)) then
       raise exception 'Número entero requerido' using errcode='22023';
     end if;
     if (v_item->>'id')::uuid=any(v_ids) then raise exception 'Ejercicio repetido' using errcode='22023'; end if;
     v_ids:=array_append(v_ids,(v_item->>'id')::uuid);
     if exists(select 1 from public.personal_routine_items where id=(v_item->>'id')::uuid and routine_id<>p_target_id) then
       raise exception 'Fila de otra rutina' using errcode='22023';
     end if;
     if not exists(select 1 from public.exercises e where e.id=(v_item->>'exerciseId')::uuid and
       (e.archived_at is null or exists(select 1 from public.personal_routine_items i where i.owner_id=v_owner and i.exercise_id=e.id))) then
       raise exception 'Ejercicio no disponible' using errcode='22023';
     end if;
   end loop;
 end if;
 case p_operation
 when 'folder_create' then
   select coalesce(max(position),-1)+1 into v_position from public.personal_folders where owner_id=v_owner;
   insert into public.personal_folders(id,owner_id,name,position) values(p_target_id,v_owner,p_data->>'name',v_position);
   v_status:='created';
 when 'folder_rename' then
   update public.personal_folders set name=p_data->>'name' where id=p_target_id and owner_id=v_owner;
   v_status:='updated';
 when 'folder_delete' then
   select coalesce(max(position),-1)+1 into v_position from public.personal_routines where owner_id=v_owner and folder_id is null;
   for v_original in select id from public.personal_routines where owner_id=v_owner and folder_id=p_target_id order by position,id loop
     update public.personal_routines set folder_id=null,position=v_position where id=v_original.id and owner_id=v_owner;
     v_position:=v_position+1;
   end loop;
   delete from public.personal_folders where id=p_target_id and owner_id=v_owner;
   v_status:='deleted';
 when 'routine_create','routine_copy' then
   select coalesce(max(position),-1)+1 into v_position from public.personal_routines where owner_id=v_owner and folder_id is not distinct from v_folder_id;
   insert into public.personal_routines(id,owner_id,folder_id,name,position) values(p_target_id,v_owner,v_folder_id,p_data->>'name',v_position);
   v_status:=case when p_operation='routine_copy' then 'copied' else 'created' end;
 when 'routine_save' then
   update public.personal_routines set name=p_data->>'name' where id=p_target_id and owner_id=v_owner;
   v_status:='updated';
 when 'routine_move' then
   if v_folder_id is distinct from v_routine.folder_id then
     select coalesce(max(position),-1)+1 into v_position from public.personal_routines where owner_id=v_owner and folder_id is not distinct from v_folder_id;
     update public.personal_routines set folder_id=v_folder_id,position=v_position where id=p_target_id and owner_id=v_owner;
   end if;
   v_status:='moved';
 when 'routine_delete' then
   delete from public.personal_routines where id=p_target_id and owner_id=v_owner;
   v_status:='deleted';
 when 'folders_reorder','routines_reorder' then
   if jsonb_typeof(p_data->'entries')<>'array' then raise exception 'Orden inválido' using errcode='22023'; end if;
   v_ids:=array[]::uuid[];
   for v_entry in select value from jsonb_array_elements(p_data->'entries') loop
     if jsonb_typeof(v_entry)<>'object' or not(v_entry ?& array['id','revision']) or
       exists(select 1 from jsonb_object_keys(v_entry) k where k not in ('id','revision')) or
       jsonb_typeof(v_entry->'id')<>'string' or jsonb_typeof(v_entry->'revision')<>'number' or
       (v_entry->>'revision')::numeric<>trunc((v_entry->>'revision')::numeric) or (v_entry->>'revision')::numeric<0 then
       raise exception 'Miembro inválido' using errcode='22023';
     end if;
     if (v_entry->>'id')::uuid=any(v_ids) then raise exception 'Miembro repetido' using errcode='22023'; end if;
     v_ids:=array_append(v_ids,(v_entry->>'id')::uuid);
     if p_operation='folders_reorder' then
       select revision into v_revision from public.personal_folders where id=(v_entry->>'id')::uuid and owner_id=v_owner;
     else
       select revision into v_revision from public.personal_routines where id=(v_entry->>'id')::uuid and owner_id=v_owner and folder_id is not distinct from v_folder_id;
     end if;
     if not found or v_revision<>(v_entry->>'revision')::integer then raise exception 'La colección cambió' using errcode='40001'; end if;
   end loop;
   if p_operation='folders_reorder' then
     select count(*) into v_count from public.personal_folders where owner_id=v_owner;
   else
     select count(*) into v_count from public.personal_routines where owner_id=v_owner and folder_id is not distinct from v_folder_id;
   end if;
   if v_count<>cardinality(v_ids) then raise exception 'La colección cambió' using errcode='40001'; end if;
   v_index:=0;
   foreach v_source_id in array v_ids loop
     if p_operation='folders_reorder' then
       update public.personal_folders set position=v_index where id=v_source_id and owner_id=v_owner;
     else
       update public.personal_routines set position=v_index where id=v_source_id and owner_id=v_owner;
     end if;
     v_index:=v_index+1;
   end loop;
   v_status:='reordered';
 end case;
 if v_items is not null then
   -- Elimina solo filas retiradas: las que sobreviven mantienen su PK para referencias futuras.
   delete from public.personal_routine_items where owner_id=v_owner and routine_id=p_target_id and not(id=any(v_ids));
   v_index:=0;
   for v_item in select value from jsonb_array_elements(v_items) loop
     insert into public.personal_routine_items(id,owner_id,routine_id,exercise_id,position,sets,reps_min,reps_max,
       target_weight_kg,note,rest_seconds,superset_id,superset_rest_seconds,prescription_sets,typed_prescription)
     values((v_item->>'id')::uuid,v_owner,p_target_id,(v_item->>'exerciseId')::uuid,v_index,
       (v_item->>'sets')::smallint,(v_item->>'repsMin')::smallint,(v_item->>'repsMax')::smallint,
       (v_item->>'targetWeightKg')::numeric,v_item->>'note',(v_item->>'restSeconds')::smallint,
       (v_item->>'supersetId')::uuid,(v_item->>'supersetRestSeconds')::smallint,nullif(v_item->'series','null'::jsonb),v_item->'typedPrescription')
     on conflict(id) do update set exercise_id=excluded.exercise_id,position=excluded.position,sets=excluded.sets,
       reps_min=excluded.reps_min,reps_max=excluded.reps_max,target_weight_kg=excluded.target_weight_kg,note=excluded.note,
       rest_seconds=excluded.rest_seconds,superset_id=excluded.superset_id,superset_rest_seconds=excluded.superset_rest_seconds,
       prescription_sets=excluded.prescription_sets,typed_prescription=excluded.typed_prescription
     where personal_routine_items.owner_id=v_owner and personal_routine_items.routine_id=p_target_id;
     if not found then raise exception 'Fila no autorizada' using errcode='42501'; end if;
     v_index:=v_index+1;
   end loop;
   perform public.check_personal_routine(v_owner,p_target_id);
 end if;
 v_revision:=null;
 if p_operation not in ('folders_reorder','routines_reorder','folder_delete','routine_delete') then
   if p_operation like 'folder_%' then select revision into v_revision from public.personal_folders where id=p_target_id and owner_id=v_owner;
   else select revision into v_revision from public.personal_routines where id=p_target_id and owner_id=v_owner; end if;
 end if;
 v_result:=jsonb_build_object('requestId',p_request_id,'targetId',p_target_id,'revision',v_revision,'status',v_status,'duplicate',false);
 insert into public.personal_training_receipts(owner_id,request_id,operation,target_id,payload_hash,result)
   values(v_owner,p_request_id,p_operation,p_target_id,v_hash,v_result);
 return v_result;
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or foreign_key_violation then
 raise exception 'Dato inválido' using errcode='22023';
end;
$$;

-- Puente cerrado: conserva el hash de los intentos1 ya congelados.
create or replace function public.mutate_personal_library(p_request_id uuid,p_operation text,p_target_id uuid,
 p_expected_revision integer,p_data jsonb) returns jsonb
 language sql security invoker set search_path='' as $$
 select public.mutate_training_library(p_request_id,p_operation,p_target_id,p_expected_revision,p_data,1);
$$;
revoke all on function public.personal_training_prescription(jsonb),
 public.get_training_library(),public.mutate_training_library(uuid,text,uuid,integer,jsonb,integer) from public,anon;
grant execute on function public.personal_training_prescription(jsonb),
 public.get_training_library(),public.mutate_training_library(uuid,text,uuid,integer,jsonb,integer) to authenticated;
