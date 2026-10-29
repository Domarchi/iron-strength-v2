-- T219: a closed versioned intent, atomic changes, and durable owner-only receipts.
create function public.valid_coach_prescription_changes(p jsonb) returns boolean
 language plpgsql immutable security invoker set search_path='' as $$
declare k text; v jsonb;
begin
 if jsonb_typeof(p) is distinct from 'object' or p='{}' or
   p-array['prescribed','sets','repsMin','repsMax','targetWeightKg','targetDurationSeconds','targetDistanceMeters','note','restSeconds','supersetRestSeconds']<>'{}' then return false; end if;
 if p ? 'prescribed' and p ?| array['sets','repsMin','repsMax','targetWeightKg','targetDurationSeconds','targetDistanceMeters'] then return false; end if;
 for k,v in select * from jsonb_each(p) loop
  if not(case k
   when 'prescribed' then public.valid_training_prescription(v)
   when 'sets' then public.valid_training_number(v,1,10,1)
   when 'repsMin' then public.valid_training_number(v,1,100,1)
   when 'repsMax' then public.valid_training_number(v,1,100,1)
   when 'targetWeightKg' then v='null' or public.valid_training_number(v,0,500,0.01)
   when 'targetDurationSeconds' then v='null' or public.valid_training_number(v,1,86400,1)
   when 'targetDistanceMeters' then v='null' or public.valid_training_number(v,0.01,1000000,0.01)
   when 'note' then public.valid_training_note(v)
   when 'restSeconds' then v='null' or v='0' or public.valid_training_number(v,15,600,1)
   when 'supersetRestSeconds' then v='null' or v='0' or public.valid_training_number(v,15,600,1)
   else false end) then return false; end if;
 end loop;
 return true;
end;
$$;

create function public.patch_coach_prescription(p_current jsonb,p_changes jsonb) returns jsonb
 language plpgsql immutable security invoker set search_path='' as $$
declare kind text; dims text[]; k text; metric text; patch jsonb; series jsonb; target jsonb; v jsonb;
 n integer; original jsonb; i integer;
begin
 if not public.valid_training_prescription(p_current) or not public.valid_coach_prescription_changes(p_changes) then
  raise exception 'Prescripción inválida' using errcode='22023'; end if;
 kind:=p_current->>'recordType';
 if p_changes ? 'prescribed' then
  if kind is distinct from p_changes->'prescribed'->>'recordType' then
   raise exception 'El tipo del ejercicio no se puede cambiar' using errcode='22023'; end if;
  return p_changes->'prescribed';
 end if;
 dims:=public.training_metric_dimensions(kind);
 patch:=p_changes-array['sets','note','restSeconds','supersetRestSeconds'];
 for k in select jsonb_object_keys(patch) loop
  metric:=case k when 'repsMin' then 'reps' when 'repsMax' then 'reps' when 'targetWeightKg' then 'weightKg'
    when 'targetDurationSeconds' then 'durationSeconds' when 'targetDistanceMeters' then 'distanceMeters' end;
  if not(metric=any(dims)) then raise exception 'Dimensión inaplicable' using errcode='22023'; end if;
 end loop;
 n:=coalesce((p_changes->>'sets')::integer,(p_current->>'sets')::integer);
 original:=p_current->'series';
 if original='null' then series:='null'; target:=p_current->'target'||patch;
 else
  series:='[]';
  for i in 0..n-1 loop series:=series||jsonb_build_array((original->least(i,jsonb_array_length(original)-1))||patch); end loop;
  target:='{}';
  foreach k in array array['repsMin','repsMax','targetWeightKg','targetDurationSeconds','targetDistanceMeters'] loop
   if k='repsMin' then select to_jsonb(min((t.value->>k)::numeric)) into v from jsonb_array_elements(series)t(value);
   elsif k='repsMax' then select to_jsonb(max((t.value->>k)::numeric)) into v from jsonb_array_elements(series)t(value);
   else select case when count(distinct t.value->k)=1 then jsonb_agg(t.value->k)->0 else 'null'::jsonb end into v from jsonb_array_elements(series)t(value); end if;
   target:=target||jsonb_build_object(k,coalesce(v,'null'::jsonb));
  end loop;
 end if;
 v:=jsonb_build_object('recordType',kind,'sets',n,'target',target,'series',series);
 if not public.valid_training_prescription(v) then raise exception 'Objetivos incompatibles' using errcode='22023'; end if;
 return v;
end;
$$;

create function public.valid_coach_session_request(p jsonb) returns boolean
 language plpgsql immutable security invoker set search_path='' as $$
declare op text; d jsonb; r jsonb; values_list jsonb; ids uuid[]:='{}'; exercises uuid[]:='{}'; v_id uuid;
begin
 if jsonb_typeof(p) is distinct from 'object' or not(p ?& array['version','id','revision','operation','data']) or
   p-array['version','id','revision','operation','data']<>'{}' or p->'version'<>'2' or
   not public.valid_training_uuid(p->'id') or not public.valid_training_number(p->'revision',0,2147483647,1) or
   jsonb_typeof(p->'operation') is distinct from 'string' or jsonb_typeof(p->'data') is distinct from 'object' then return false; end if;
 op:=p->>'operation'; d:=p->'data';
 if op='add' then
  if not(d ? 'items') or d-array['items']<>'{}' or jsonb_typeof(d->'items') is distinct from 'array' or jsonb_array_length(d->'items') not between 1 and 15 then return false; end if;
  for r in select value from jsonb_array_elements(d->'items') loop
   if jsonb_typeof(r) is distinct from 'object' or not(r ?& array['id','exerciseId']) or r-array['id','exerciseId']<>'{}'
    or not public.valid_training_uuid(r->'id') or not public.valid_training_uuid(r->'exerciseId') then return false; end if;
   if (r->>'id')::uuid=any(ids) or (r->>'exerciseId')::uuid=any(exercises) then return false; end if;
   ids:=ids||(r->>'id')::uuid; exercises:=exercises||(r->>'exerciseId')::uuid;
  end loop;
 elsif op='prescribe' then
  if not(d ? 'rows') or d-array['rows','title','weekday']<>'{}' or jsonb_typeof(d->'rows') is distinct from 'array' or
    jsonb_array_length(d->'rows')>15 or (jsonb_array_length(d->'rows')=0 and not(d ?| array['title','weekday'])) then return false; end if;
  if d ? 'title' and (jsonb_typeof(d->'title') is distinct from 'string' or char_length(d->>'title')>80) then return false; end if;
  if d ? 'weekday' and not public.valid_training_number(d->'weekday',-1,6,1) then return false; end if;
  for r in select value from jsonb_array_elements(d->'rows') loop
   if jsonb_typeof(r) is distinct from 'object' or not(r ?& array['id','exerciseId','changes']) or r-array['id','exerciseId','changes']<>'{}'
    or not public.valid_training_uuid(r->'id') or not public.valid_training_uuid(r->'exerciseId') or
    not public.valid_coach_prescription_changes(r->'changes') then return false; end if;
   if (r->>'id')::uuid=any(ids) then return false; end if; ids:=ids||(r->>'id')::uuid;
  end loop;
 elsif op='alternatives' then
  if not(d ?& array['rowId','alternatives']) or d-array['rowId','alternatives']<>'{}' or not public.valid_training_uuid(d->'rowId')
   or jsonb_typeof(d->'alternatives') is distinct from 'array' or jsonb_array_length(d->'alternatives')>3 then return false; end if;
  for r in select value from jsonb_array_elements(d->'alternatives') loop
   if jsonb_typeof(r) is distinct from 'object' or not(r ?& array['exerciseId','prescribed']) or r-array['exerciseId','prescribed']<>'{}' or
    not public.valid_training_uuid(r->'exerciseId') or not public.valid_training_prescription(r->'prescribed') then return false; end if;
   if (r->>'exerciseId')::uuid=any(exercises) then return false; end if;exercises:=exercises||(r->>'exerciseId')::uuid;
  end loop;
 elsif op='order' then
  if not(d ? 'ids') or d-array['ids']<>'{}' or jsonb_typeof(d->'ids') is distinct from 'array' or jsonb_array_length(d->'ids') not between 1 and 15 then return false; end if;
  for r in select value from jsonb_array_elements(d->'ids') loop
   if not public.valid_training_uuid(r) then return false; end if; v_id:=(r#>>'{}')::uuid;
   if v_id=any(ids) then return false; end if;ids:=ids||v_id;
  end loop;
 elsif op='layout' then
  if not(d ? 'items') or d-array['items']<>'{}' or jsonb_typeof(d->'items') is distinct from 'array' or jsonb_array_length(d->'items') not between 1 and 15 then return false; end if;
  values_list:=d->'items';
  for r in select value from jsonb_array_elements(values_list) loop
   if jsonb_typeof(r) is distinct from 'object' or not(r ?& array['id','restSeconds','supersetId','supersetRestSeconds']) or
     r-array['id','restSeconds','supersetId','supersetRestSeconds']<>'{}' or not public.valid_training_uuid(r->'id') or
     not(r->'supersetId'='null' or public.valid_training_uuid(r->'supersetId')) then return false; end if;
   if not public.valid_coach_prescription_changes(jsonb_build_object('restSeconds',r->'restSeconds','supersetRestSeconds',r->'supersetRestSeconds'))
     or (r->'supersetId'='null' and r->'supersetRestSeconds'<>'null') then return false; end if;
   if (r->>'id')::uuid=any(ids) then return false; end if;ids:=ids||(r->>'id')::uuid;
  end loop;
  if exists(select 1 from jsonb_array_elements(values_list) with ordinality t(value,n) where value->'supersetId'<>'null'
   group by (value->>'supersetId')::uuid having count(*) not between 2 and 4 or max(n)-min(n)+1<>count(*) or
   count(distinct coalesce((value->>'supersetRestSeconds')::integer,-1))<>1) then return false; end if;
 elsif op='remove' then
  if not(d ? 'rowId') or d-array['rowId']<>'{}' or not public.valid_training_uuid(d->'rowId') then return false; end if;
 elsif op='duplicate' then
  if not(d ?& array['copyId','rowId']) or d-array['copyId','rowId']<>'{}' or not public.valid_training_uuid(d->'copyId') or
    not(d->'rowId'='null' or public.valid_training_uuid(d->'rowId')) then return false; end if;
 else return false;
 end if;
 return true;
end;
$$;
revoke all on function public.valid_coach_prescription_changes(jsonb),public.patch_coach_prescription(jsonb,jsonb),public.valid_coach_session_request(jsonb) from public,anon;
grant execute on function public.valid_coach_prescription_changes(jsonb),public.patch_coach_prescription(jsonb,jsonb),public.valid_coach_session_request(jsonb) to authenticated;

create table public.coach_training_receipts(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null,
 session_id uuid not null,
 operation text not null check(operation in ('add','prescribe','alternatives','order','layout','remove','duplicate')),
 request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(owner_id,request_id),
 constraint coach_receipt_result check((jsonb_typeof(result)='object' and
   result ?& array['version','id','sessionId','revision','status'] and
   result-array['version','id','sessionId','revision','status','copyId','copyKind']='{}' and
   result->'version'='2' and result->'id'=to_jsonb(request_id) and result->'sessionId'=to_jsonb(session_id) and
   result->'status'='"applied"' and public.valid_training_number(result->'revision',0,2147483647,1) and
   case when operation='duplicate' then result ?& array['copyId','copyKind'] and public.valid_training_uuid(result->'copyId') and result->>'copyKind' in ('exercise','session')
    else not(result ?| array['copyId','copyKind']) end) is true)
);
alter table public.coach_training_receipts enable row level security;
revoke all on public.coach_training_receipts from public,anon,authenticated;
grant select,insert on public.coach_training_receipts to authenticated;
create policy coach_receipts_select on public.coach_training_receipts for select to authenticated
 using(owner_id=(select auth.uid()) and public.is_coach());
create policy coach_receipts_insert on public.coach_training_receipts for insert to authenticated
 with check(owner_id=(select auth.uid()) and public.is_coach());

create function public.mutate_coach_session(p_session_id uuid,p_request jsonb) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_request_id uuid; v_request_hash text; v_op text; v_data jsonb; v_program_id uuid;
 v_receipt public.coach_training_receipts%rowtype; v_session public.program_sessions%rowtype;
 v_item public.session_exercises%rowtype; v_r jsonb; v_changes jsonb; v_prescribed jsonb; v_kind text;
 v_target jsonb; v_result jsonb; v_ids uuid[]; v_count integer; v_position integer; v_copy_id uuid; v_copy_kind text; v_alive boolean;
begin
 if v_owner is null or not public.is_coach() then raise exception 'Se requiere un coach activo' using errcode='42501'; end if;
 if p_session_id is null or not public.valid_coach_session_request(p_request) then raise exception 'Solicitud inválida' using errcode='22023'; end if;
 v_request_id:=(p_request->>'id')::uuid;v_op:=p_request->>'operation';v_data:=p_request->'data';
 v_request_hash:=encode(pg_catalog.sha256(convert_to(jsonb_build_object('sessionId',p_session_id,'request',p_request)::text,'UTF8')),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text||':'||v_request_id::text,219));
 select * into v_receipt from public.coach_training_receipts c where c.owner_id=v_owner and c.request_id=v_request_id;
 if found then
  if v_receipt.request_hash<>v_request_hash then raise exception 'No reutilices el intento con otro contenido' using errcode='22023'; end if;
  if v_op='duplicate' then
   v_copy_id:=(v_receipt.result->>'copyId')::uuid;v_copy_kind:=v_receipt.result->>'copyKind';
   if v_copy_kind='session' then select exists(select 1 from public.program_sessions where id=v_copy_id) into v_alive;
   else select exists(select 1 from public.session_exercises where id=v_copy_id) into v_alive;end if;
  else select exists(select 1 from public.program_sessions where id=p_session_id) into v_alive;end if;
  return v_receipt.result||jsonb_build_object('status',case when v_alive then 'duplicate' else 'removed' end);
 end if;
 select * into v_session from public.program_sessions where id=p_session_id;
 if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
 v_program_id:=v_session.program_id;
 perform 1 from public.programs where id=v_program_id and coach_id=v_owner for update;
 if not found then raise exception 'Programa no encontrado' using errcode='P0002'; end if;
 select * into v_session from public.program_sessions where id=p_session_id for update;
 if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
 if v_session.program_id<>v_program_id then raise exception 'La sesión cambió de programa' using errcode='40001'; end if;
 if exists(select 1 from public.routine_mutations where id=v_request_id) then
  raise exception 'El intento pertenece al contrato anterior' using errcode='22023'; end if;
 if not public.can_edit_routine_session(p_session_id) then raise exception 'Semana bloqueada' using errcode='55000'; end if;
 if v_session.revision<>(p_request->>'revision')::integer then raise exception 'La sesión cambió' using errcode='40001'; end if;

 if v_op='add' then
  select count(*),coalesce(max(e.position),-1)+1 into v_count,v_position from public.session_exercises e where e.program_session_id=p_session_id;
  if v_count+jsonb_array_length(v_data->'items')>15 then raise exception 'Máximo 15 ejercicios' using errcode='23514'; end if;
  for v_r in select value from jsonb_array_elements(v_data->'items') loop
   select e.record_type into v_kind from public.exercises e where e.id=(v_r->>'exerciseId')::uuid and e.archived_at is null and e.personal_owner_id is null and (e.coach_id is null or e.coach_id=v_owner);
   if not found then raise exception 'Ejercicio no disponible' using errcode='22023'; end if;
   v_target:=jsonb_build_object('repsMin',case when 'reps'=any(public.training_metric_dimensions(v_kind)) then 8 end,
    'repsMax',case when 'reps'=any(public.training_metric_dimensions(v_kind)) then 12 end,
    'targetWeightKg',null,'targetDurationSeconds',null,'targetDistanceMeters',null);
   v_prescribed:=jsonb_build_object('recordType',v_kind,'sets',3,'target',v_target,'series',null);
   insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max,typed_prescription)
    values((v_r->>'id')::uuid,p_session_id,(v_r->>'exerciseId')::uuid,v_position,3,null,null,v_prescribed);
   v_position:=v_position+1;
  end loop;
 elsif v_op='prescribe' then
  for v_r in select value from jsonb_array_elements(v_data->'rows') loop
   select * into v_item from public.session_exercises where id=(v_r->>'id')::uuid and program_session_id=p_session_id and exercise_id=(v_r->>'exerciseId')::uuid for update;
   if not found then raise exception 'Ejercicio ajeno o eliminado' using errcode='P0002'; end if;
   v_changes:=v_r->'changes';
   if v_changes ? 'supersetRestSeconds' then
    if v_item.superset_id is null or exists(select 1 from public.session_exercises e where e.program_session_id=p_session_id and e.superset_id=v_item.superset_id and
      not exists(select 1 from jsonb_array_elements(v_data->'rows') t(value) where (t.value->>'id')::uuid=e.id and t.value->'changes' ? 'supersetRestSeconds' and
       t.value->'changes'->'supersetRestSeconds' is not distinct from v_changes->'supersetRestSeconds')) then
      raise exception 'Selecciona la superserie completa y el mismo descanso' using errcode='22023'; end if;
   end if;
   v_prescribed:=public.patch_coach_prescription(public.routine_training_prescription(to_jsonb(v_item)),v_changes);
   if v_changes ?| array['prescribed','sets','repsMin','repsMax','targetWeightKg','targetDurationSeconds','targetDistanceMeters'] then
    update public.session_exercises set sets=(v_prescribed->>'sets')::smallint,reps_min=null,reps_max=null,target_weight_kg=null,prescription_sets=null,typed_prescription=v_prescribed
     where id=v_item.id and program_session_id=p_session_id;
   end if;
   if v_changes ?| array['note','restSeconds','supersetRestSeconds'] then
    update public.session_exercises set note=case when v_changes ? 'note' then v_changes->>'note' else note end,
     rest_seconds=case when v_changes ? 'restSeconds' then (v_changes->>'restSeconds')::smallint else rest_seconds end,
     superset_rest_seconds=case when v_changes ? 'supersetRestSeconds' then (v_changes->>'supersetRestSeconds')::smallint else superset_rest_seconds end
     where id=v_item.id and program_session_id=p_session_id;
   end if;
  end loop;
  if v_data ? 'title' then update public.program_sessions set title=nullif(btrim(v_data->>'title'),'') where id=p_session_id;end if;
  if v_data ? 'weekday' then update public.program_sessions set weekday=nullif((v_data->>'weekday')::smallint,-1) where id=p_session_id;end if;
 elsif v_op='alternatives' then
  if not exists(select 1 from public.session_exercises where id=(v_data->>'rowId')::uuid and program_session_id=p_session_id) then
   raise exception 'Ejercicio ajeno o eliminado' using errcode='P0002'; end if;
  delete from public.session_exercise_alternatives where session_exercise_id=(v_data->>'rowId')::uuid;
  v_position:=0;
  for v_r in select value from jsonb_array_elements(v_data->'alternatives') loop
   v_prescribed:=v_r->'prescribed';
   insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max,typed_prescription)
    values((v_data->>'rowId')::uuid,(v_r->>'exerciseId')::uuid,v_position,(v_prescribed->>'sets')::smallint,null,null,v_prescribed);
   v_position:=v_position+1;
  end loop;
 elsif v_op in ('order','layout') then
  if v_op='order' then select array_agg((t.value#>>'{}')::uuid order by t.n) into v_ids from jsonb_array_elements(v_data->'ids') with ordinality t(value,n);
  else select array_agg((t.value->>'id')::uuid order by t.n) into v_ids from jsonb_array_elements(v_data->'items') with ordinality t(value,n);end if;
  if cardinality(v_ids)<>(select count(*) from public.session_exercises where program_session_id=p_session_id) or
   exists(select 1 from unnest(v_ids) x(id) where not exists(select 1 from public.session_exercises e where e.id=x.id and e.program_session_id=p_session_id)) then
   raise exception 'La estructura de la sesión cambió' using errcode='40001'; end if;
  if v_op='order' then
   update public.session_exercises e set position=t.n-1 from unnest(v_ids) with ordinality t(id,n) where e.id=t.id and e.program_session_id=p_session_id;
  else
   v_position:=0;
   for v_r in select value from jsonb_array_elements(v_data->'items') loop
    update public.session_exercises set position=v_position,rest_seconds=(v_r->>'restSeconds')::smallint,superset_id=(v_r->>'supersetId')::uuid,
     superset_rest_seconds=(v_r->>'supersetRestSeconds')::smallint where id=(v_r->>'id')::uuid and program_session_id=p_session_id;
    v_position:=v_position+1;
   end loop;
  end if;
 elsif v_op='remove' then
  delete from public.session_exercises where id=(v_data->>'rowId')::uuid and program_session_id=p_session_id;
  if not found then raise exception 'Ejercicio ajeno o eliminado' using errcode='P0002'; end if;
 elsif v_op='duplicate' then
  v_copy_id:=(v_data->>'copyId')::uuid;v_copy_kind:=case when v_data->'rowId'='null' then 'session' else 'exercise' end;
  if exists(select 1 from public.program_sessions where id=v_copy_id) or exists(select 1 from public.session_exercises where id=v_copy_id) then
   raise exception 'El identificador de copia ya existe' using errcode='22023'; end if;
  perform public.duplicate_routine_item(p_session_id,v_copy_id,(v_data->>'rowId')::uuid);
 end if;

 -- Validate final group state before recording success, not only at transaction end.
 if exists(select 1 from (select e.superset_id,e.superset_rest_seconds,row_number() over(order by e.position,e.id) as n
   from public.session_exercises e where e.program_session_id=p_session_id) ordered where superset_id is not null
   group by superset_id having count(*) not between 2 and 4 or max(n)-min(n)+1<>count(*) or count(distinct coalesce(superset_rest_seconds,-1))<>1) then
   raise exception 'Superserie inválida' using errcode='23514'; end if;
 select revision into v_count from public.program_sessions where id=p_session_id;
 v_result:=jsonb_build_object('version',2,'id',v_request_id,'sessionId',p_session_id,'revision',v_count,'status','applied');
 if v_op='duplicate' then v_result:=v_result||jsonb_build_object('copyId',v_copy_id,'copyKind',v_copy_kind);end if;
 insert into public.coach_training_receipts(owner_id,request_id,session_id,operation,request_hash,result)
  values(v_owner,v_request_id,p_session_id,v_op,v_request_hash,v_result);
 return v_result;
end;
$$;
revoke all on function public.mutate_coach_session(uuid,jsonb) from public,anon;
grant execute on function public.mutate_coach_session(uuid,jsonb) to authenticated;

-- Legacy bodies and receipts keep their original keys. Serialize the nonce
-- across versions so it cannot acquire a second interpretation.
create or replace function public.add_routine_exercises(
 p_session_id uuid, p_expected_revision integer, p_request_id uuid, p_items jsonb
) returns integer language plpgsql security invoker set search_path='' as $$
declare
 v_session public.program_sessions%rowtype;
 v_receipt public.routine_mutations%rowtype;
 v_payload jsonb;
 v_item jsonb;
 v_count integer;
 v_position integer;
 v_revision integer;
begin
 if not public.is_coach() then raise exception 'Solo el coach puede editar' using errcode='42501'; end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or
    p_items is null or jsonb_typeof(p_items)<>'array' then
   raise exception 'Solicitud inválida' using errcode='22023'; end if;
 if jsonb_array_length(p_items) not between 1 and 15 or
    (select count(distinct value->>'id') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) or
    (select count(distinct value->>'exerciseId') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then
   raise exception 'Lote inválido' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':'||p_request_id::text,219));
 if exists(select 1 from public.coach_training_receipts where owner_id=auth.uid() and request_id=p_request_id)
   and not exists(select 1 from public.routine_mutations where id=p_request_id and coach_id=auth.uid()) then
   raise exception 'El intento pertenece al editor actualizado' using errcode='22023';
 end if;
 select * into v_session from public.program_sessions where id=p_session_id;
 if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
 perform 1 from public.programs where id=v_session.program_id and coach_id=auth.uid() for update;
 if not found then raise exception 'Programa no encontrado' using errcode='P0002'; end if;
 select * into v_session from public.program_sessions where id=p_session_id for update;
 if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
 v_payload:=jsonb_build_object('operation','add','base',p_expected_revision,'items',p_items);
 select * into v_receipt from public.routine_mutations where id=p_request_id;
 if found then
   if v_receipt.session_id<>p_session_id or v_receipt.payload<>v_payload then
     raise exception 'No reutilices la identidad con otro contenido' using errcode='22023'; end if;
   return v_receipt.revision;
 end if;
 if not public.can_edit_routine_session(p_session_id) then raise exception 'Semana bloqueada' using errcode='55000'; end if;
 if v_session.revision<>p_expected_revision then raise exception 'La sesión cambió en otra pestaña' using errcode='40001'; end if;
 select count(*),coalesce(max(position),-1)+1 into v_count,v_position from public.session_exercises where program_session_id=p_session_id;
 if v_count+jsonb_array_length(p_items)>15 then raise exception 'Máximo 15 ejercicios' using errcode='23514'; end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
   if jsonb_typeof(v_item)<>'object' or not (v_item ?& array['id','exerciseId']) or
     exists(select 1 from jsonb_object_keys(v_item) k where k not in ('id','exerciseId')) then
     raise exception 'Miembro inválido' using errcode='22023'; end if;
   if not exists(select 1 from public.exercises where id=(v_item->>'exerciseId')::uuid and archived_at is null) then
     raise exception 'Ejercicio no disponible' using errcode='22023'; end if;
   insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max)
     values((v_item->>'id')::uuid,p_session_id,(v_item->>'exerciseId')::uuid,v_position,3,8,12);
   v_position:=v_position+1;
 end loop;
 select revision into v_revision from public.program_sessions where id=p_session_id;
 insert into public.routine_mutations(id,session_id,coach_id,payload,revision)
   values(p_request_id,p_session_id,auth.uid(),v_payload,v_revision);
 return v_revision;
end;
$$;

create or replace function public.mutate_routine_session(
  p_session_id uuid, p_expected_revision integer, p_request_id uuid,
  p_rows jsonb default null, p_ordered_ids uuid[] default null, p_title text default null, p_weekday integer default null
) returns integer language plpgsql security invoker set search_path='' as $$
declare
  v_session public.program_sessions%rowtype;
  v_program public.programs%rowtype;
  v_receipt public.routine_mutations%rowtype;
  v_payload jsonb;
  v_row jsonb;
  v_revision integer;
  v_count integer;
  v_old public.session_exercises%rowtype;
  v_fields text[];
  v_series jsonb;
  v_sets integer;v_min integer;v_max integer;v_weight numeric;
begin
  if not public.is_coach() then raise exception 'Solo el coach puede editar' using errcode='42501'; end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision < 0 or
    (p_rows is null) = (p_ordered_ids is null) then
    raise exception 'Solicitud inválida' using errcode='22023';
  end if;
  if p_title is not null and (length(btrim(p_title)) > 80 or p_ordered_ids is not null) then raise exception 'Título inválido' using errcode='22023'; end if;
  if p_weekday is not null and (p_weekday not between -1 and 6 or p_ordered_ids is not null) then raise exception 'Día inválido' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':'||p_request_id::text,219));
  if exists(select 1 from public.coach_training_receipts where owner_id=auth.uid() and request_id=p_request_id)
    and not exists(select 1 from public.routine_mutations where id=p_request_id and coach_id=auth.uid()) then
    raise exception 'El intento pertenece al editor actualizado' using errcode='22023';
  end if;
  select * into v_session from public.program_sessions where id=p_session_id;
  if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
  -- Mismo orden de bloqueos que duplicación: programa antes de sesión.
  select * into v_program from public.programs where id=v_session.program_id and coach_id=auth.uid() for update;
  if not found then raise exception 'Programa no encontrado' using errcode='P0002'; end if;
  select * into v_session from public.program_sessions where id=p_session_id for update;
  if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
  v_payload := jsonb_build_object('rows',p_rows,'order',p_ordered_ids,'base',p_expected_revision);
  if p_title is not null then v_payload:=v_payload||jsonb_build_object('title',p_title); end if;
  if p_weekday is not null then v_payload:=v_payload||jsonb_build_object('weekday',p_weekday); end if;
  select * into v_receipt from public.routine_mutations where id=p_request_id;
  if found then
    if v_receipt.session_id <> p_session_id or v_receipt.payload <> v_payload then
      raise exception 'No reutilices la identidad con otro contenido' using errcode='22023';
    end if;
    return v_receipt.revision;
  end if;
  if v_program.student_id is not null and (
    v_program.start_date + ((v_session.week_number-1)*7) <= date_trunc('week',now() at time zone 'America/Santiago')::date
    or v_program.start_date + ((v_session.week_number-1)*7) > v_program.ends_on
    or (now() at time zone 'America/Santiago')::date > v_program.ends_on
  ) then raise exception 'Semana bloqueada' using errcode='55000'; end if;
  if v_session.revision <> p_expected_revision then
    raise exception 'La sesión cambió en otra pestaña' using errcode='40001';
  end if;
  if p_rows is not null then
    if jsonb_typeof(p_rows) <> 'array' then raise exception 'Lote inválido' using errcode='22023'; end if;
    if (jsonb_array_length(p_rows) > 15 or (jsonb_array_length(p_rows)=0 and p_title is null and p_weekday is null)) or
      (select count(distinct value->>'id') from jsonb_array_elements(p_rows)) <> jsonb_array_length(p_rows) then
      raise exception 'Lote inválido' using errcode='22023';
    end if;
    for v_row in select value from jsonb_array_elements(p_rows) loop
      if v_row ? 'fields' then
        if jsonb_typeof(v_row->'fields') <> 'array' or jsonb_array_length(v_row->'fields') not between 1 and 8 then
          raise exception 'Campos inválidos' using errcode='22023'; end if;
        if exists (select 1 from jsonb_array_elements_text(v_row->'fields') f(value) where
          f.value not in ('sets','repsMin','repsMax','targetWeightKg','note','restSeconds','supersetRestSeconds','series') or not (v_row ? f.value))
          or (select count(distinct value) from jsonb_array_elements_text(v_row->'fields')) <> jsonb_array_length(v_row->'fields') then
          raise exception 'Campos inválidos' using errcode='22023'; end if;
      end if;
      select * into v_old from public.session_exercises where id=(v_row->>'id')::uuid
        and program_session_id=p_session_id and exercise_id=(v_row->>'exerciseId')::uuid for update;
      if not found then raise exception 'Ejercicio ajeno o eliminado' using errcode='P0002'; end if;
      if v_row ? 'fields' then
        select array_agg(value) into v_fields from jsonb_array_elements_text(v_row->'fields');
      else
        v_fields:=array['sets','repsMin','repsMax','targetWeightKg','note'];
        if v_row ? 'restSeconds' then v_fields:=v_fields||'restSeconds'::text;end if;
        if v_row ? 'supersetRestSeconds' then v_fields:=v_fields||'supersetRestSeconds'::text;end if;
        if v_row ? 'series' then v_fields:=v_fields||'series'::text;end if;
      end if;
      if v_old.typed_prescription is not null and v_fields &&
        array['sets','repsMin','repsMax','targetWeightKg','series'] then
        raise exception 'Esta prescripción requiere el editor actualizado' using errcode='0A000';
      end if;
      -- Un cliente uniforme anterior puede guardar su nota, pero no borrar objetivos que no conoce.
      if v_old.prescription_sets is not null and not(v_row ? 'fields') and not(v_row ? 'series') then
        if (v_row->>'sets')::integer is distinct from v_old.sets or
          (v_row->>'repsMin')::integer is distinct from v_old.reps_min or
          (v_row->>'repsMax')::integer is distinct from v_old.reps_max or
          (v_row->>'targetWeightKg')::numeric is distinct from v_old.target_weight_kg then
          raise exception 'Revisa el detalle por serie con la versión actual del editor' using errcode='22023'; end if;
        v_fields:=array_remove(array_remove(array_remove(array_remove(v_fields,'sets'),'repsMin'),'repsMax'),'targetWeightKg');
      end if;
      if 'series'=any(v_fields) then v_series:=nullif(v_row->'series','null'::jsonb);
      else v_series:=public.patch_prescription_series(v_old.prescription_sets,v_row,v_fields);end if;
      v_sets:=case when 'sets'=any(v_fields) then (v_row->>'sets')::integer else v_old.sets end;
      v_min:=case when 'repsMin'=any(v_fields) then (v_row->>'repsMin')::integer else v_old.reps_min end;
      v_max:=case when 'repsMax'=any(v_fields) then (v_row->>'repsMax')::integer else v_old.reps_max end;
      v_weight:=case when 'targetWeightKg'=any(v_fields) then (v_row->>'targetWeightKg')::numeric else v_old.target_weight_kg end;
      if v_series is not null then
        select count(*)::integer,min((value->>'repsMin')::integer),max((value->>'repsMax')::integer),
          case when bool_and((value->>'targetWeightKg')::numeric is not distinct from (v_series->0->>'targetWeightKg')::numeric)
          then (v_series->0->>'targetWeightKg')::numeric else null end
        into v_sets,v_min,v_max,v_weight from jsonb_array_elements(v_series);
      end if;
      update public.session_exercises set sets=v_sets,reps_min=v_min,reps_max=v_max,target_weight_kg=v_weight,
        prescription_sets=v_series,
        note=case when 'note'=any(v_fields) then v_row->>'note' else note end,
        rest_seconds=case when 'restSeconds'=any(v_fields) then (v_row->>'restSeconds')::smallint else rest_seconds end,
        superset_rest_seconds=case when 'supersetRestSeconds'=any(v_fields) then (v_row->>'supersetRestSeconds')::smallint else superset_rest_seconds end
        where id=v_old.id and program_session_id=p_session_id;
      if not found then raise exception 'Ejercicio ajeno o eliminado' using errcode='P0002'; end if;
    end loop;
  else
    select count(*) into v_count from public.session_exercises where program_session_id=p_session_id;
    if cardinality(p_ordered_ids) not between 1 and 15 or cardinality(p_ordered_ids) <> v_count
      or (select count(distinct id) from unnest(p_ordered_ids) id) <> v_count
      or exists (select 1 from unnest(p_ordered_ids) o(id) where not exists (
        select 1 from public.session_exercises e where e.id=o.id and e.program_session_id=p_session_id)) then
      raise exception 'Orden inválido' using errcode='22023';
    end if;
    update public.session_exercises e set position=o.n-1
      from unnest(p_ordered_ids) with ordinality o(id,n) where e.id=o.id and e.program_session_id=p_session_id;
  end if;
  if p_title is not null then update public.program_sessions set title=nullif(btrim(p_title),'') where id=p_session_id; end if;
  if p_weekday is not null then update public.program_sessions set weekday=nullif(p_weekday,-1) where id=p_session_id; end if;
  select revision into v_revision from public.program_sessions where id=p_session_id;
  insert into public.routine_mutations(id,session_id,coach_id,payload,revision)
    values(p_request_id,p_session_id,auth.uid(),v_payload,v_revision);
  return v_revision;
end;
$$;

create or replace function public.configure_session_alternatives(
 p_session_id uuid,p_exercise_row_id uuid,p_expected_revision integer,p_request_id uuid,p_alternatives jsonb
) returns integer language plpgsql security invoker set search_path='' as $$
declare
 v_session public.program_sessions%rowtype;
 v_program public.programs%rowtype;
 v_receipt public.routine_mutations%rowtype;
 v_payload jsonb;
 v_revision integer;
begin
 if not public.is_coach() then raise exception 'Solo el coach puede editar' using errcode='42501'; end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_alternatives is null then
  raise exception 'Solicitud inválida' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':'||p_request_id::text,219));
 if exists(select 1 from public.coach_training_receipts where owner_id=auth.uid() and request_id=p_request_id)
   and not exists(select 1 from public.routine_mutations where id=p_request_id and coach_id=auth.uid()) then
   raise exception 'El intento pertenece al editor actualizado' using errcode='22023';
 end if;
 select * into v_session from public.program_sessions where id=p_session_id;
 if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
 select * into v_program from public.programs where id=v_session.program_id and coach_id=auth.uid() for update;
 if not found then raise exception 'Programa no encontrado' using errcode='P0002'; end if;
 select * into v_session from public.program_sessions where id=p_session_id for update;
 if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
 v_payload:=jsonb_build_object('alternativeRow',p_exercise_row_id,'alternatives',p_alternatives,'base',p_expected_revision);
 select * into v_receipt from public.routine_mutations where id=p_request_id;
 if found then
  if v_receipt.session_id<>p_session_id or v_receipt.payload<>v_payload then raise exception 'Solicitud reutilizada con otro contenido' using errcode='22023'; end if;
  return v_receipt.revision;
 end if;
 if not public.can_edit_routine_session(p_session_id) then raise exception 'Semana bloqueada' using errcode='55000'; end if;
 if v_session.revision<>p_expected_revision then raise exception 'La sesión cambió' using errcode='40001'; end if;
 if not exists(select 1 from public.session_exercises where id=p_exercise_row_id and program_session_id=p_session_id) then
  raise exception 'Ejercicio no encontrado' using errcode='P0002'; end if;
 if jsonb_typeof(p_alternatives)<>'array' or jsonb_array_length(p_alternatives)>3 then
  raise exception 'Máximo tres alternativas' using errcode='22023'; end if;
 if exists(select 1 from public.session_exercises where id=p_exercise_row_id and typed_prescription is not null)
   or exists(select 1 from public.session_exercise_alternatives where session_exercise_id=p_exercise_row_id and typed_prescription is not null) then
   raise exception 'Estas alternativas requieren el editor actualizado' using errcode='0A000';
 end if;
 delete from public.session_exercise_alternatives where session_exercise_id=p_exercise_row_id;
 insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,prescription_sets)
 select p_exercise_row_id,(r.value->>'exerciseId')::uuid,r.ordinal-1,(r.value->>'sets')::smallint,
  (r.value->>'repsMin')::smallint,(r.value->>'repsMax')::smallint,(r.value->>'targetWeightKg')::numeric,nullif(r.value->'series','null'::jsonb)
 from jsonb_array_elements(p_alternatives) with ordinality r(value,ordinal);
 select revision into v_revision from public.program_sessions where id=p_session_id;
 insert into public.routine_mutations(id,session_id,coach_id,payload,revision) values(p_request_id,p_session_id,auth.uid(),v_payload,v_revision);
 return v_revision;
end;
$$;

create or replace function public.configure_session_layout(
  p_session_id uuid,p_expected_revision integer,p_request_id uuid,p_layout jsonb
) returns integer language plpgsql security invoker set search_path='' as $$
declare
  v_session public.program_sessions%rowtype;
  v_program public.programs%rowtype;
  v_receipt public.routine_mutations%rowtype;
  v_payload jsonb;
  v_count integer;
  v_revision integer;
begin
  if not public.is_coach() then raise exception 'Solo el coach puede editar' using errcode='42501'; end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_layout is null then
    raise exception 'Solicitud inválida' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':'||p_request_id::text,219));
  if exists(select 1 from public.coach_training_receipts where owner_id=auth.uid() and request_id=p_request_id)
    and not exists(select 1 from public.routine_mutations where id=p_request_id and coach_id=auth.uid()) then
    raise exception 'El intento pertenece al editor actualizado' using errcode='22023';
  end if;
  select * into v_session from public.program_sessions where id=p_session_id;
  if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
  select * into v_program from public.programs where id=v_session.program_id and coach_id=auth.uid() for update;
  if not found then raise exception 'Programa no encontrado' using errcode='P0002'; end if;
  select * into v_session from public.program_sessions where id=p_session_id for update;
  if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
  v_payload:=jsonb_build_object('layout',p_layout,'base',p_expected_revision);
  select * into v_receipt from public.routine_mutations where id=p_request_id;
  if found then
    if v_receipt.session_id<>p_session_id or v_receipt.payload<>v_payload then raise exception 'Solicitud reutilizada con otro contenido' using errcode='22023'; end if;
    return v_receipt.revision;
  end if;
  if v_program.student_id is not null and (
    v_program.start_date + ((v_session.week_number-1)*7) <= date_trunc('week',now() at time zone 'America/Santiago')::date
    or v_program.start_date + ((v_session.week_number-1)*7) > v_program.ends_on
    or (now() at time zone 'America/Santiago')::date > v_program.ends_on
  ) then raise exception 'Semana bloqueada' using errcode='55000'; end if;
  if v_session.revision<>p_expected_revision then raise exception 'La sesión cambió' using errcode='40001'; end if;
  if jsonb_typeof(p_layout)<>'array' then raise exception 'Configuración inválida' using errcode='22023'; end if;
  select count(*) into v_count from public.session_exercises where program_session_id=p_session_id;
  if jsonb_array_length(p_layout) not between 1 and 15 or jsonb_array_length(p_layout)<>v_count
    or (select count(distinct value->>'id') from jsonb_array_elements(p_layout))<>v_count
    or exists(select 1 from jsonb_array_elements(p_layout) r where not exists(
      select 1 from public.session_exercises e where e.id=(r->>'id')::uuid and e.program_session_id=p_session_id)) then
    raise exception 'La configuración debe incluir toda la sesión' using errcode='22023'; end if;
  update public.session_exercises e set position=r.ordinal-1,
    rest_seconds=(r.value->>'restSeconds')::smallint,
    superset_id=(r.value->>'supersetId')::uuid,
    superset_rest_seconds=(r.value->>'supersetRestSeconds')::smallint
    from jsonb_array_elements(p_layout) with ordinality r(value,ordinal)
    where e.id=(r.value->>'id')::uuid and e.program_session_id=p_session_id;
  -- Los triggers diferidos comprobarán también cambios hechos fuera de esta función.
  select revision into v_revision from public.program_sessions where id=p_session_id;
  insert into public.routine_mutations(id,session_id,coach_id,payload,revision)
    values(p_request_id,p_session_id,auth.uid(),v_payload,v_revision);
  return v_revision;
end;
$$;
