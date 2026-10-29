-- T214: estructura del cierre; no reconstruir prescripciones de resultados anteriores.
create function public.valid_workout_structure(p_structure jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare r jsonb; p jsonb; t jsonb; n numeric; ids uuid[]:='{}';
 uuid_pattern constant text:='^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$';
begin
 if p_structure is null or jsonb_typeof(p_structure) is distinct from 'object'
    or not(p_structure ?& array['version','exercises']) or p_structure-array['version','exercises']<>'{}'
    or p_structure->'version' is distinct from '1'::jsonb or jsonb_typeof(p_structure->'exercises') is distinct from 'array' then return false; end if;
 if jsonb_array_length(p_structure->'exercises') not between 1 and 15 then return false; end if;
 for r in select value from jsonb_array_elements(p_structure->'exercises') loop
  if jsonb_typeof(r) is distinct from 'object'
     or not(r ?& array['id','exerciseId','prescribedExerciseId','prescribed','note','restSeconds','supersetId','supersetRestSeconds'])
     or r-array['id','exerciseId','prescribedExerciseId','prescribed','note','restSeconds','supersetId','supersetRestSeconds']<>'{}'
     or jsonb_typeof(r->'id') is distinct from 'string' or jsonb_typeof(r->'exerciseId') is distinct from 'string'
     or r->>'id' !~ uuid_pattern or r->>'exerciseId' !~ uuid_pattern then return false; end if;
  if (r->>'id')::uuid=any(ids) then return false; end if;
  ids:=array_append(ids,(r->>'id')::uuid);
  perform (r->>'exerciseId')::uuid;
  if r->'prescribedExerciseId'<>'null' then
   if jsonb_typeof(r->'prescribedExerciseId')<>'string' or r->>'prescribedExerciseId' !~ uuid_pattern then return false; end if;
   perform (r->>'prescribedExerciseId')::uuid;
  end if;
  if r->'note'<>'null' and (jsonb_typeof(r->'note')<>'string' or char_length(r->>'note')>500) then return false; end if;
  foreach p in array array[r->'restSeconds',r->'supersetRestSeconds'] loop
   if p<>'null' then
    if jsonb_typeof(p)<>'number' then return false; end if;
    n:=p::text::numeric;
    if n<>trunc(n) or (n<>0 and n not between 15 and 600) then return false; end if;
   end if;
  end loop;
  if r->'supersetId'='null' then
   if r->'supersetRestSeconds'<>'null' then return false; end if;
  else
   if jsonb_typeof(r->'supersetId')<>'string' or r->>'supersetId' !~ uuid_pattern then return false; end if;
   perform (r->>'supersetId')::uuid;
  end if;
  p:=r->'prescribed';
  if jsonb_typeof(p) is distinct from 'object' or not(p ?& array['sets','repsMin','repsMax','targetWeightKg','series'])
     or p-array['sets','repsMin','repsMax','targetWeightKg','series']<>'{}'
     or jsonb_typeof(p->'sets') is distinct from 'number' or jsonb_typeof(p->'repsMin') is distinct from 'number'
     or jsonb_typeof(p->'repsMax') is distinct from 'number' then return false; end if;
  if (p->>'sets')::numeric not between 1 and 10 or (p->>'sets')::numeric<>trunc((p->>'sets')::numeric)
     or (p->>'repsMin')::numeric not between 1 and 100 or (p->>'repsMax')::numeric not between (p->>'repsMin')::numeric and 100
     or (p->>'repsMin')::numeric<>trunc((p->>'repsMin')::numeric) or (p->>'repsMax')::numeric<>trunc((p->>'repsMax')::numeric) then return false; end if;
  if p->'targetWeightKg'<>'null' then
   if jsonb_typeof(p->'targetWeightKg')<>'number' then return false; end if;
   n:=(p->>'targetWeightKg')::numeric;
   if n not between 0 and 500 or n<>round(n,2) then return false; end if;
  end if;
  if not public.valid_prescription_series(nullif(p->'series','null'),(p->>'sets')::numeric::int,(p->>'repsMin')::numeric::int,(p->>'repsMax')::numeric::int,(p->>'targetWeightKg')::numeric) then return false; end if;
  if p->'series'<>'null' then
   for t in select value from jsonb_array_elements(p->'series') loop
    if not(t ?& array['repsMin','repsMax','targetWeightKg']) then return false; end if;
   end loop;
  end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_structure->'exercises') with ordinality t(r,i)
   where t.r->'supersetId'<>'null' group by (t.r->>'supersetId')::uuid
   having count(*) not between 2 and 4 or max(t.i)-min(t.i)+1<>count(*) or count(distinct t.r->'supersetRestSeconds')<>1) then return false; end if;
 return true;
exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then return false;
end;
$$;
revoke all on function public.valid_workout_structure(jsonb) from public,anon;
grant execute on function public.valid_workout_structure(jsonb) to authenticated;
alter table public.workouts add column structure jsonb,
 add constraint workouts_structure_check check(structure is null or public.valid_workout_structure(structure));

create function public.valid_workout_recording(p_recording jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare w jsonb; r jsonb; s jsonb; o jsonb; src text; v numeric; started timestamptz; finished timestamptz;
 uuid_pattern constant text:='^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$';
begin
 if jsonb_typeof(p_recording) is distinct from 'object' or not(p_recording ?& array['version','id','source','workout','structure'])
    or p_recording-array['version','id','source','workout','structure']<>'{}'
    or p_recording->'version' is distinct from '2'::jsonb or jsonb_typeof(p_recording->'source') is distinct from 'string'
    or jsonb_typeof(p_recording->'id') is distinct from 'string' or p_recording->>'id' !~ uuid_pattern then return false; end if;
 src:=p_recording->>'source'; w:=p_recording->'workout';
 if src not in ('assigned','personal','free') or not public.valid_workout_structure(p_recording->'structure')
    or jsonb_typeof(w) is distinct from 'object' then return false; end if;
 if not(w ?& array['id','startedAt','finishedAt','durationSeconds','sets']) or jsonb_typeof(w->'id') is distinct from 'string'
    or w->>'id' !~ uuid_pattern or (w->>'id')::uuid<>(p_recording->>'id')::uuid
    or jsonb_typeof(w->'startedAt') is distinct from 'string' or jsonb_typeof(w->'finishedAt') is distinct from 'string'
    or jsonb_typeof(w->'durationSeconds') is distinct from 'number' or jsonb_typeof(w->'sets') is distinct from 'array'
    or w->>'startedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?Z$'
    or w->>'finishedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?Z$' then return false; end if;
 started:=(w->>'startedAt')::timestamptz; finished:=(w->>'finishedAt')::timestamptz;
 v:=(w->>'durationSeconds')::numeric;
 if started is null or finished is null or finished<started or v not between 0 and 86400 or v<>trunc(v)
    or jsonb_array_length(w->'sets') not between 1 and 300 then return false; end if;
 if w ? 'perceivedEffort' and w->'perceivedEffort'<>'null' then
  if jsonb_typeof(w->'perceivedEffort')<>'number' then return false; end if;
  v:=(w->>'perceivedEffort')::numeric;
  if v not between 1 and 10 or v<>trunc(v) then return false; end if;
 end if;
 if w ? 'note' and w->'note'<>'null' and (jsonb_typeof(w->'note')<>'string' or char_length(btrim(w->>'note'))>500) then return false; end if;
 if src='assigned' then
  if not(w ?& array['programId','programSessionId','sessionLabel'])
     or w-array['id','startedAt','finishedAt','durationSeconds','sets','programId','programSessionId','sessionLabel','perceivedEffort','note']<>'{}'
     or jsonb_typeof(w->'programId') is distinct from 'string' or jsonb_typeof(w->'programSessionId') is distinct from 'string'
     or w->>'programId' !~ uuid_pattern or w->>'programSessionId' !~ uuid_pattern
     or jsonb_typeof(w->'sessionLabel') is distinct from 'string' or char_length(w->>'sessionLabel') not between 1 and 10 then return false; end if;
  perform (w->>'programId')::uuid; perform (w->>'programSessionId')::uuid;
 else
  o:=w->'origin';
  if not(w ?& array['version','title','origin']) or w->'version' is distinct from '1'::jsonb
     or w-array['id','startedAt','finishedAt','durationSeconds','sets','version','title','origin','perceivedEffort','note']<>'{}'
     or jsonb_typeof(w->'title') is distinct from 'string' or char_length(btrim(w->>'title')) not between 1 and 100
     or jsonb_typeof(o) is distinct from 'object' or o->>'kind' is distinct from src then return false; end if;
  if src='free' then
   if o-array['kind']<>'{}' then return false; end if;
  else
   if not(o ?& array['kind','routineId','revision']) or o-array['kind','routineId','revision']<>'{}'
      or jsonb_typeof(o->'routineId') is distinct from 'string' or o->>'routineId' !~ uuid_pattern or jsonb_typeof(o->'revision') is distinct from 'number' then return false; end if;
   perform (o->>'routineId')::uuid; v:=(o->>'revision')::numeric;
   if v<0 or v<>trunc(v) or v>2147483647 then return false; end if;
  end if;
 end if;
 if exists(select 1 from jsonb_array_elements(p_recording->'structure'->'exercises') e where (src='assigned')<>(e->'prescribedExerciseId'<>'null')) then return false; end if;
 for s in select value from jsonb_array_elements(w->'sets') loop
  if jsonb_typeof(s) is distinct from 'object' or not(s ?& array['exerciseId','position','setNumber','weightKg','reps','isWarmup'])
     or jsonb_typeof(s->'exerciseId') is distinct from 'string' or jsonb_typeof(s->'position') is distinct from 'number'
     or jsonb_typeof(s->'setNumber') is distinct from 'number' or jsonb_typeof(s->'weightKg') is distinct from 'number'
     or jsonb_typeof(s->'reps') is distinct from 'number' or jsonb_typeof(s->'isWarmup') is distinct from 'boolean'
     or s->>'exerciseId' !~ uuid_pattern then return false; end if;
  if src='assigned' then
   if not(s ?& array['sessionExerciseId','prescribedExerciseId','exerciseName'])
      or s-array['exerciseId','position','setNumber','weightKg','reps','isWarmup','sessionExerciseId','prescribedExerciseId','exerciseName']<>'{}'
      or jsonb_typeof(s->'sessionExerciseId') is distinct from 'string' or jsonb_typeof(s->'prescribedExerciseId') is distinct from 'string'
      or s->>'sessionExerciseId' !~ uuid_pattern or s->>'prescribedExerciseId' !~ uuid_pattern
      or jsonb_typeof(s->'exerciseName') is distinct from 'string' or char_length(s->>'exerciseName') not between 1 and 100 then return false; end if;
  elsif s-array['exerciseId','position','setNumber','weightKg','reps','isWarmup']<>'{}' then return false; end if;
  v:=(s->>'position')::numeric;
  if v not between 0 and 14 or v<>trunc(v) then return false; end if;
  r:=p_recording->'structure'->'exercises'->v::integer;
  if r is null or (s->>'exerciseId')::uuid<>(r->>'exerciseId')::uuid then return false; end if;
  if src='assigned' and ((s->>'sessionExerciseId')::uuid<>(r->>'id')::uuid or (s->>'prescribedExerciseId')::uuid<>(r->>'prescribedExerciseId')::uuid) then return false; end if;
  v:=(s->>'setNumber')::numeric;
  if v not between 1 and 20 or v<>trunc(v) then return false; end if;
  v:=(s->>'reps')::numeric;
  if v not between 1 and 100 or v<>trunc(v) then return false; end if;
  v:=(s->>'weightKg')::numeric;
  if v not between 0 and 500 or v<>round(v,2) then return false; end if;
 end loop;
 if (select count(*) from (select distinct (item.value->>'position')::numeric,(item.value->>'setNumber')::numeric from jsonb_array_elements(w->'sets') item(value)) t)<>jsonb_array_length(w->'sets') then return false; end if;
 return true;
exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value or invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;
revoke all on function public.valid_workout_recording(jsonb) from public,anon;
grant execute on function public.valid_workout_recording(jsonb) to authenticated;

create function public.guard_workout_structure() returns trigger
language plpgsql security invoker set search_path='' as $$
declare r jsonb; canonical jsonb; source record; started date;
begin
 if tg_op='UPDATE' then
  if new.structure is distinct from old.structure then raise exception 'La estructura del cierre no se puede cambiar' using errcode='P0001'; end if;
  return new;
 end if;
 if new.structure is null then return new; end if;
 if not public.valid_workout_structure(new.structure) then raise exception 'Estructura inválida' using errcode='22023'; end if;
 if new.source_kind<>'assigned' then
  for r in select value from jsonb_array_elements(new.structure->'exercises') loop
   if r->'prescribedExerciseId'<>'null' then raise exception 'Identidad prescrita inválida' using errcode='22023'; end if;
   if not exists(select 1 from public.exercises e where e.id=(r->>'exerciseId')::uuid and
      (e.archived_at is null or exists(select 1 from public.personal_routine_items i where i.owner_id=new.student_id and i.exercise_id=e.id))) then
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
  select se.*,new.structure->'exercises'->se.ordinal::int as requested,a.exercise_id as alternative_id,
   a.sets as alt_sets,a.reps_min as alt_min,a.reps_max as alt_max,a.target_weight_kg as alt_weight,a.prescription_sets as alt_series
  from rows se left join public.session_exercise_alternatives a on a.session_exercise_id=se.id
   and a.exercise_id=(new.structure->'exercises'->se.ordinal::int->>'exerciseId')::uuid
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
 if canonical is distinct from new.structure then raise exception 'La rutina prescrita cambió; conserva el registro para revisarlo' using errcode='40001'; end if;
 return new;
end;
$$;
revoke all on function public.guard_workout_structure() from public,anon,authenticated;
create trigger workout_structure before insert or update on public.workouts for each row execute function public.guard_workout_structure();

create function public.guard_workout_structure_set() returns trigger
language plpgsql security invoker set search_path='' as $$
declare structure jsonb; src text; r jsonb;
begin
 select w.structure,w.source_kind into structure,src from public.workouts w where w.id=new.workout_id and w.student_id=new.student_id;
 if structure is null then return new; end if;
 r:=structure->'exercises'->new.position;
 if r is null or new.position not between 0 and 14 or new.set_number not between 1 and 20
    or new.reps not between 1 and 100 or new.weight_kg not between 0 and 500
    or new.exercise_id<>(r->>'exerciseId')::uuid then raise exception 'Serie incompatible con la estructura del cierre' using errcode='23514'; end if;
 if src='assigned' and (new.prescribed_exercise_id is distinct from (r->>'prescribedExerciseId')::uuid
    or (new.session_exercise_id is distinct from (r->>'id')::uuid and not(new.session_exercise_id is null and not exists(select 1 from public.session_exercises where id=(r->>'id')::uuid)))) then
  raise exception 'Identidad incompatible con la estructura del cierre' using errcode='23514';
 end if;
 return new;
end;
$$;
revoke all on function public.guard_workout_structure_set() from public,anon,authenticated;
create trigger workout_structure_set before insert or update on public.workout_sets for each row execute function public.guard_workout_structure_set();

create table public.workout_recording_receipts(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 workout_id uuid not null,
 payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),
 primary key(owner_id,workout_id)
);
alter table public.workout_recording_receipts enable row level security;
revoke all on public.workout_recording_receipts from public,anon,authenticated;
grant select,insert on public.workout_recording_receipts to authenticated;
create policy workout_recording_receipts_select on public.workout_recording_receipts for select to authenticated
 using(owner_id=(select auth.uid()) and public.is_active_member());
create policy workout_recording_receipts_insert on public.workout_recording_receipts for insert to authenticated
 with check(owner_id=(select auth.uid()) and public.is_active_member() and exists(select 1 from public.workouts w where w.id=workout_recording_receipts.workout_id and w.student_id=workout_recording_receipts.owner_id and w.structure is not null));

create function public.save_workout_recording(p_recording jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); wid uuid; hash text; saved_hash text; w jsonb; src text;
begin
 if owner is null or not public.is_active_member() then raise exception 'Se requiere una cuenta activa' using errcode='42501'; end if;
 if not public.valid_workout_recording(p_recording) then raise exception 'Documento de cierre inválido' using errcode='22023'; end if;
 wid:=(p_recording->>'id')::uuid; w:=p_recording->'workout'; src:=p_recording->>'source';
 hash:=encode(extensions.digest(p_recording::text,'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':'||wid::text,214));
 select payload_hash into saved_hash from public.workout_recording_receipts where owner_id=owner and workout_id=wid;
 if found then
  if saved_hash<>hash then raise exception 'Identificador usado con otro documento' using errcode='23505'; end if;
  return jsonb_build_object('workoutId',wid,'status',case when exists(select 1 from public.workouts where id=wid and student_id=owner) then 'duplicate' else 'removed' end);
 end if;
 if exists(select 1 from public.workouts where id=wid) then raise exception 'Identificador ya utilizado' using errcode='23505'; end if;
 insert into public.workouts(id,student_id,source_kind,title,personal_routine_id,personal_routine_revision,program_id,program_session_id,session_label,
  started_at,finished_at,duration_seconds,perceived_effort,note,structure)
 values(wid,owner,src,case when src<>'assigned' then btrim(w->>'title') end,
  case when src='personal' then (w->'origin'->>'routineId')::uuid end,case when src='personal' then (w->'origin'->>'revision')::numeric::int end,
  (w->>'programId')::uuid,(w->>'programSessionId')::uuid,w->>'sessionLabel',
  (w->>'startedAt')::timestamptz,(w->>'finishedAt')::timestamptz,(w->>'durationSeconds')::numeric::int,(w->>'perceivedEffort')::numeric::smallint,nullif(btrim(w->>'note'),''),p_recording->'structure');
 insert into public.workout_sets(workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps,is_warmup,session_exercise_id,prescribed_exercise_id)
 select wid,owner,(s->>'exerciseId')::uuid,case when src='assigned' then s->>'exerciseName' else 'Ejercicio' end,
  (s->>'position')::numeric::smallint,(s->>'setNumber')::numeric::smallint,(s->>'weightKg')::numeric,(s->>'reps')::numeric::smallint,(s->>'isWarmup')::boolean,
  (s->>'sessionExerciseId')::uuid,(s->>'prescribedExerciseId')::uuid from jsonb_array_elements(w->'sets') s;
 insert into public.workout_recording_receipts(owner_id,workout_id,payload_hash) values(owner,wid,hash);
 return jsonb_build_object('workoutId',wid,'status','created');
end;
$$;
revoke all on function public.save_workout_recording(jsonb) from public,anon;
grant execute on function public.save_workout_recording(jsonb) to authenticated;
