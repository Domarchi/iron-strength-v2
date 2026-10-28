-- T217 · Propiedad privada separada del catálogo compartido del coach.
alter table public.exercises
 add column personal_owner_id uuid references public.profiles(id) on delete cascade,
 add column personal_revision integer not null default 1 check(personal_revision>0),
 add constraint exercises_single_owner check(personal_owner_id is null or coach_id is null),
 add constraint exercises_personal_equipment check(personal_owner_id is null or equipment is null or char_length(btrim(equipment)) between 1 and 50);
create index exercises_personal_owner_idx on public.exercises(personal_owner_id) where personal_owner_id is not null;
drop index public.exercises_unique_name_per_owner;
create unique index exercises_unique_name_per_owner on public.exercises(
 coalesce(coach_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(btrim(name))) where personal_owner_id is null;
create unique index exercises_unique_personal_name on public.exercises(personal_owner_id,lower(btrim(name))) where personal_owner_id is not null;

alter policy exercises_select on public.exercises using (
 public.is_active_member() and (
  personal_owner_id=(select auth.uid()) or
  (personal_owner_id is null and (
   (archived_at is null and (coach_id is null or coach_id=public.current_coach_id()))
   or (public.is_coach() and coach_id=auth.uid())
   or exists(select 1 from public.session_exercises e where e.exercise_id=exercises.id)
   or exists(select 1 from public.session_exercise_alternatives a where a.exercise_id=exercises.id)))));
alter policy exercises_insert on public.exercises
 with check((public.is_coach() and coach_id=auth.uid() and personal_owner_id is null)
  or (public.is_active_member() and personal_owner_id=(select auth.uid()) and coach_id is null));
alter policy exercises_update on public.exercises
 using((public.is_coach() and coach_id=auth.uid() and personal_owner_id is null)
  or (public.is_active_member() and personal_owner_id=(select auth.uid())))
 with check((public.is_coach() and coach_id=auth.uid() and personal_owner_id is null)
  or (public.is_active_member() and personal_owner_id=(select auth.uid()) and coach_id is null));
-- Sin DELETE personal: archivar conserva todas las referencias.

create table public.personal_exercise_receipts(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null,
 target_id uuid not null,
 operation text not null check(operation in('create','update','archive','restore')),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 revision integer not null check(revision>0),
 created_at timestamptz not null default now(),
 primary key(owner_id,request_id)
);
create index personal_exercise_receipts_target_idx on public.personal_exercise_receipts(owner_id,target_id);
alter table public.personal_exercise_receipts enable row level security;
create policy personal_exercise_receipts_select on public.personal_exercise_receipts for select to authenticated
 using(public.is_active_member() and owner_id=(select auth.uid()));
create policy personal_exercise_receipts_insert on public.personal_exercise_receipts for insert to authenticated
 with check(public.is_active_member() and owner_id=(select auth.uid()));
revoke all on public.personal_exercise_receipts from public,anon,authenticated;
grant select,insert on public.personal_exercise_receipts to authenticated;

create function public.guard_personal_exercise() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if (new.id,new.personal_owner_id) is distinct from (old.id,old.personal_owner_id)
    or (old.personal_owner_id is not null and new.coach_id is distinct from old.coach_id) then
   raise exception 'Identidad de ejercicio inmutable' using errcode='42501';
  end if;
  new.personal_revision:=old.personal_revision+1;
 else
  new.personal_revision:=1;
  if new.personal_owner_id is not null and exists(select 1 from public.personal_exercise_receipts
    where owner_id=new.personal_owner_id and target_id=new.id) then
   raise exception 'Identificador ya utilizado' using errcode='23505';
  end if;
 end if;
 if new.personal_owner_id is not null then
  new.name:=btrim(new.name);
  if new.equipment is not null then new.equipment:=btrim(new.equipment); end if;
 end if;
 return new;
end;
$$;
create trigger personal_exercise_guard before insert or update on public.exercises
 for each row execute function public.guard_personal_exercise();

create function public.guard_shared_exercise_reference() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.exercises where id=new.exercise_id and personal_owner_id is null) then
  raise exception 'Crea una copia compartida para planificar este ejercicio' using errcode='23514';
 end if;
 return new;
end;
$$;
create trigger shared_session_exercise before insert or update of exercise_id on public.session_exercises
 for each row execute function public.guard_shared_exercise_reference();
create trigger shared_alternative_exercise before insert or update of exercise_id on public.session_exercise_alternatives
 for each row execute function public.guard_shared_exercise_reference();

create function public.get_personal_exercises() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; total integer;
begin
 if auth.uid() is null or not public.is_active_member() then raise exception 'Sin acceso' using errcode='42501'; end if;
 select count(*)::integer,coalesce(jsonb_agg(jsonb_build_object(
  'id',e.id,'name',e.name,'muscleGroup',e.muscle_group,'equipment',e.equipment,
  'isBodyweight',e.is_bodyweight,'progressionIncrementKg',e.progression_increment_kg,
  'recordType',e.record_type,'revision',e.personal_revision,'archivedAt',e.archived_at)
  order by e.name,e.id),'[]'::jsonb) into total,result
 from public.exercises e where e.personal_owner_id=auth.uid();
 if total>1000 then raise exception 'Catálogo personal excede esta versión' using errcode='0A000'; end if;
 return jsonb_build_object('version',1,'userId',auth.uid(),'exercises',result);
end;
$$;

create function public.mutate_personal_exercise(p_request_id uuid,p_target_id uuid,p_expected_revision integer,p_operation text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); fingerprint text; receipt public.personal_exercise_receipts%rowtype;
 current_exercise public.exercises%rowtype; revision integer; status text; keys text[];
begin
 if owner is null or not public.is_active_member() then raise exception 'Sin acceso' using errcode='42501'; end if;
 if p_request_id is null or p_target_id is null or p_expected_revision is null or p_expected_revision<0
  or p_operation is null or p_operation not in('create','update','archive','restore')
  or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Datos inválidos' using errcode='22023'; end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('version',1,'targetId',p_target_id,
  'expectedRevision',p_expected_revision,'operation',p_operation,'data',p_data)::text,'UTF8')),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,217));
 select * into receipt from public.personal_exercise_receipts where owner_id=owner and request_id=p_request_id;
 if found then
  if receipt.payload_hash<>fingerprint then raise exception 'Intento con otro contenido' using errcode='22023'; end if;
  status:=case receipt.operation when 'create' then 'created' when 'update' then 'updated' when 'archive' then 'archived' else 'restored' end;
  revision:=receipt.revision;
  if not exists(select 1 from public.exercises where id=p_target_id and personal_owner_id=owner) then status:='removed'; revision:=null; end if;
  return jsonb_build_object('version',1,'requestId',p_request_id,'targetId',p_target_id,'revision',revision,'status',status,'duplicate',true);
 end if;
 keys:=case when p_operation in('create','update') then array['name','muscleGroup','equipment','isBodyweight','progressionIncrementKg','recordType'] else array[]::text[] end;
 if not(p_data ?& keys) or p_data-keys<>'{}'::jsonb then raise exception 'Campos inválidos' using errcode='22023'; end if;
 if p_operation in('create','update') then
  if jsonb_typeof(p_data->'name')<>'string' or char_length(btrim(p_data->>'name')) not between 1 and 100
   or jsonb_typeof(p_data->'muscleGroup')<>'string' or p_data->>'muscleGroup' not in('Pecho','Espalda','Hombros','Brazos','Piernas','Core','Cardio')
   or jsonb_typeof(p_data->'equipment') not in('string','null')
   or (p_data->'equipment'<>'null' and char_length(btrim(p_data->>'equipment')) not between 1 and 50)
   or jsonb_typeof(p_data->'isBodyweight')<>'boolean' or jsonb_typeof(p_data->'progressionIncrementKg')<>'number'
   or jsonb_typeof(p_data->'recordType') not in('string','null')
   or (p_data->'recordType'<>'null' and p_data->>'recordType' not in('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration','weight_duration','distance_duration','weight_distance')) then
    raise exception 'Metadatos inválidos' using errcode='22023';
  end if;
  if (p_data->>'progressionIncrementKg')::numeric not between 0.01 and 20
   or round((p_data->>'progressionIncrementKg')::numeric,2)<>(p_data->>'progressionIncrementKg')::numeric then
   raise exception 'Incremento inválido' using errcode='22023';
  end if;
 end if;
 if p_operation='create' then
  if p_expected_revision<>0 then raise exception 'Revisión inicial inválida' using errcode='22023'; end if;
  insert into public.exercises(id,personal_owner_id,name,muscle_group,equipment,is_bodyweight,progression_increment_kg,record_type)
   values(p_target_id,owner,btrim(p_data->>'name'),p_data->>'muscleGroup',p_data->>'equipment',
    (p_data->>'isBodyweight')::boolean,(p_data->>'progressionIncrementKg')::numeric,p_data->>'recordType') returning personal_revision into revision;
  status:='created';
 else
  select * into current_exercise from public.exercises where id=p_target_id and personal_owner_id=owner for update;
  if not found then raise exception 'Ejercicio no encontrado' using errcode='P0002'; end if;
  if current_exercise.personal_revision<>p_expected_revision then raise exception 'Ejercicio modificado' using errcode='40001'; end if;
  if p_operation='update' then
   update public.exercises set name=btrim(p_data->>'name'),muscle_group=p_data->>'muscleGroup',equipment=p_data->>'equipment',
    is_bodyweight=(p_data->>'isBodyweight')::boolean,progression_increment_kg=(p_data->>'progressionIncrementKg')::numeric,
    record_type=p_data->>'recordType' where id=p_target_id returning personal_revision into revision;
   status:='updated';
  else
   update public.exercises set archived_at=case when p_operation='archive' then clock_timestamp() else null end
    where id=p_target_id returning personal_revision into revision;
   status:=case when p_operation='archive' then 'archived' else 'restored' end;
  end if;
 end if;
 insert into public.personal_exercise_receipts(owner_id,request_id,target_id,operation,payload_hash,revision)
  values(owner,p_request_id,p_target_id,p_operation,fingerprint,revision);
 return jsonb_build_object('version',1,'requestId',p_request_id,'targetId',p_target_id,'revision',revision,'status',status,'duplicate',false);
end;
$$;
revoke all on function public.guard_personal_exercise(),public.guard_shared_exercise_reference(),
 public.get_personal_exercises(),public.mutate_personal_exercise(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.get_personal_exercises(),public.mutate_personal_exercise(uuid,uuid,integer,text,jsonb) to authenticated;

-- Cerrar un registro propio no pierde autorización por archivado personal.
create or replace function public.guard_workout_structure() returns trigger
language plpgsql security invoker set search_path='' as $$
declare r jsonb; canonical jsonb; source record; started date; requested_structure jsonb; actual_kind text;
begin
 if tg_op='UPDATE' then
  if new.structure is distinct from old.structure then raise exception 'La estructura del cierre no se puede cambiar' using errcode='P0001'; end if;
  return new;
 end if;
 if new.structure is null then return new; end if;
 requested_structure:=new.structure;
 if new.structure->'version'='2'::jsonb then
  if not public.valid_typed_workout_structure(new.structure) then raise exception 'Estructura inválida' using errcode='22023'; end if;
  for r in select value from jsonb_array_elements(new.structure->'exercises') loop
   select e.record_type into actual_kind from public.exercises e where e.id=(r->>'exerciseId')::uuid;
   if not found or actual_kind is distinct from (r->'prescribed'->>'recordType') then raise exception 'Tipo de ejercicio no válido' using errcode='23514'; end if;
  end loop;
  if new.source_kind='assigned' then requested_structure:=public.training_structure_legacy(new.structure); end if;
 elsif not public.valid_workout_structure(new.structure) then raise exception 'Estructura inválida' using errcode='22023';
 elsif exists(select 1 from jsonb_array_elements(new.structure->'exercises') item(value)
  join public.exercises e on e.id=(item.value->>'exerciseId')::uuid where e.record_type is not null) then
  raise exception 'Este ejercicio requiere el formato nuevo de registro' using errcode='23514';
 end if;
 if new.source_kind<>'assigned' then
  for r in select value from jsonb_array_elements(requested_structure->'exercises') loop
   if r->'prescribedExerciseId'<>'null' then raise exception 'Identidad prescrita inválida' using errcode='22023'; end if;
   if not exists(select 1 from public.exercises e where e.id=(r->>'exerciseId')::uuid and
      (e.archived_at is null or e.personal_owner_id=new.student_id or exists(select 1 from public.personal_routine_items i where i.owner_id=new.student_id and i.exercise_id=e.id))) then
    raise exception 'Ejercicio no disponible' using errcode='22023';
   end if;
  end loop;
  return new;
 end if;
 select p.start_date,p.ends_on,p.weeks_count,ps.week_number,ps.label into source
  from public.program_sessions ps join public.programs p on p.id=ps.program_id
  where ps.id=new.program_session_id and p.id=new.program_id and p.student_id=new.student_id;
 if not found or source.start_date is null or source.ends_on is null then raise exception 'Sesión no disponible' using errcode='P0002'; end if;
 started:=(new.started_at at time zone 'America/Santiago')::date;
 if started<source.start_date or started>source.ends_on or (started-source.start_date)/7+1<>source.week_number
    or new.session_label is distinct from source.label then raise exception 'Semana o sesión no válida' using errcode='P0002'; end if;
 -- Una sola lectura obtiene la fuente completa y la prescripción de la alternativa realizada.
 with rows as (
  select se.*,row_number() over(order by se.position,se.id)-1 as ordinal from public.session_exercises se where se.program_session_id=new.program_session_id
 ), choices as (
  select se.*,requested_structure->'exercises'->se.ordinal::int as requested,a.exercise_id as alternative_id,
   a.sets as alt_sets,a.reps_min as alt_min,a.reps_max as alt_max,a.target_weight_kg as alt_weight,a.prescription_sets as alt_series
  from rows se left join public.session_exercise_alternatives a on a.session_exercise_id=se.id
   and a.exercise_id=(requested_structure->'exercises'->se.ordinal::int->>'exerciseId')::uuid
 )
 select jsonb_build_object('version',1,'exercises',coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'exerciseId',case when (requested->>'exerciseId')::uuid=exercise_id then exercise_id else alternative_id end,
  'prescribedExerciseId',exercise_id,'prescribed',jsonb_build_object(
   'sets',case when (requested->>'exerciseId')::uuid=exercise_id then sets else alt_sets end,
   'repsMin',case when (requested->>'exerciseId')::uuid=exercise_id then reps_min else alt_min end,
   'repsMax',case when (requested->>'exerciseId')::uuid=exercise_id then reps_max else alt_max end,
   'targetWeightKg',case when (requested->>'exerciseId')::uuid=exercise_id then target_weight_kg else alt_weight end,
   'series',(select jsonb_agg(jsonb_build_object('repsMin',target->'repsMin',
     'repsMax',target->'repsMax','targetWeightKg',target->'targetWeightKg') order by idx)
    from jsonb_array_elements(coalesce(case when (requested->>'exerciseId')::uuid=exercise_id then prescription_sets else alt_series end,'[]'::jsonb)) with ordinality as detail(target,idx))),
  'note',note,'restSeconds',rest_seconds,'supersetId',superset_id,'supersetRestSeconds',superset_rest_seconds
 ) order by ordinal),'[]'::jsonb)) into canonical from choices;
 if canonical is distinct from requested_structure then raise exception 'La rutina prescrita cambió; conserva el registro para revisarlo' using errcode='40001'; end if;
 return new;
end;
$$;

-- Cerrar un registro propio no pierde autorización por archivado personal.
create or replace function public.guard_personal_workout_set() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_kind text; v_name text;
begin
 select source_kind into v_kind from public.workouts where id=new.workout_id and student_id=new.student_id;
 if v_kind is null or v_kind='assigned' then return new; end if;
 if new.position not between 0 and 14 or new.set_number not between 1 and 20
    or new.session_exercise_id is not null or new.prescribed_exercise_id is not null
    or new.prescribed_exercise_name is not null then
   raise exception 'Serie personal inválida' using errcode='22023';
 end if;
 if tg_op='UPDATE' then return new; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.workout_id::text,152));
 select e.name into v_name from public.exercises e where e.id=new.exercise_id and
   (e.archived_at is null or e.personal_owner_id=new.student_id or exists(select 1 from public.personal_routine_items i
     where i.owner_id=new.student_id and i.exercise_id=e.id));
 if not found then raise exception 'Ejercicio no disponible' using errcode='22023'; end if;
 if exists(select 1 from public.workout_sets s where s.workout_id=new.workout_id
   and s.position=new.position and s.exercise_id<>new.exercise_id) then
   raise exception 'Una posición no admite ejercicios distintos' using errcode='22023';
 end if;
 new.exercise_name:=v_name;
 return new;
end;
$$;
