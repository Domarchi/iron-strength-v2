-- T215: canonical values, no fake repetitions for seconds/metres.
create function public.valid_training_uuid(v jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
 select coalesce(jsonb_typeof(v)='string' and v#>>'{}' ~ '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$',false)
$$;
create function public.valid_typed_workout_structure(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare r jsonb; n jsonb; ids uuid[]:='{}';
begin
 if jsonb_typeof(v) is distinct from 'object' or not(v ?& array['version','exercises']) or v-array['version','exercises']<>'{}'
  or v->'version' is distinct from '2'::jsonb or jsonb_typeof(v->'exercises') is distinct from 'array' then return false; end if;
 if jsonb_array_length(v->'exercises') not between 1 and 15 then return false; end if;
 for r in select value from jsonb_array_elements(v->'exercises') loop
  if jsonb_typeof(r) is distinct from 'object' or not(r ?& array['id','exerciseId','prescribedExerciseId','prescribed','note','restSeconds','supersetId','supersetRestSeconds'])
   or r-array['id','exerciseId','prescribedExerciseId','prescribed','note','restSeconds','supersetId','supersetRestSeconds']<>'{}'
   or not public.valid_training_uuid(r->'id') or not public.valid_training_uuid(r->'exerciseId') then return false; end if;
  if (r->>'id')::uuid=any(ids) then return false; end if;
  ids:=array_append(ids,(r->>'id')::uuid);
  if r->'prescribedExerciseId'<>'null' and not public.valid_training_uuid(r->'prescribedExerciseId') then return false; end if;
  if not public.valid_training_prescription(r->'prescribed') or not public.valid_training_note(r->'note') then return false; end if;
  foreach n in array array[r->'restSeconds',r->'supersetRestSeconds'] loop
   if n<>'null' and not(public.valid_training_number(n,0,0,1) or public.valid_training_number(n,15,600,1)) then return false; end if;
  end loop;
  if r->'supersetId'='null' then
   if r->'supersetRestSeconds'<>'null' then return false; end if;
  elsif not public.valid_training_uuid(r->'supersetId') then return false;
  end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(v->'exercises') with ordinality t(r,i)
  where t.r->'supersetId'<>'null' group by (t.r->>'supersetId')::uuid
  having count(*) not between 2 and 4 or max(t.i)-min(t.i)+1<>count(*) or count(distinct t.r->'supersetRestSeconds')<>1) then return false; end if;
 return true;
end;
$$;
create function public.valid_training_exercise_notes(s jsonb,n jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare r jsonb; i integer:=0;
begin
 if not public.valid_typed_workout_structure(s) or jsonb_typeof(n) is distinct from 'array' then return false; end if;
 if jsonb_array_length(n)<>jsonb_array_length(s->'exercises') then return false; end if;
 for r in select value from jsonb_array_elements(n) loop
  if jsonb_typeof(r) is distinct from 'object' or not(r ?& array['sessionExerciseId','note']) or r-array['sessionExerciseId','note']<>'{}'
   or not public.valid_training_uuid(r->'sessionExerciseId') or not public.valid_training_note(r->'note') then return false; end if;
  if (r->>'sessionExerciseId')::uuid<>(s->'exercises'->i->>'id')::uuid then return false; end if;
  i:=i+1;
 end loop;
 return true;
end;
$$;
create function public.valid_typed_workout_recording(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare w jsonb; r jsonb; s jsonb; o jsonb; src text; started timestamptz; finished timestamptz; slots text[]:='{}'; slot text;
begin
 if jsonb_typeof(v) is distinct from 'object' or not(v ?& array['version','id','source','workout','structure']) or v-array['version','id','source','workout','structure']<>'{}'
  or v->'version' is distinct from '3'::jsonb or not public.valid_training_uuid(v->'id')
  or jsonb_typeof(v->'source') is distinct from 'string' or not public.valid_typed_workout_structure(v->'structure') then return false; end if;
 src:=v->>'source'; w:=v->'workout';
 if src not in('assigned','personal','free') or jsonb_typeof(w) is distinct from 'object'
  or not(w ?& array['version','id','startedAt','finishedAt','durationSeconds','sets','exerciseNotes']) or w->'version' is distinct from '2'::jsonb
  or not public.valid_training_uuid(w->'id') then return false; end if;
 if (w->>'id')::uuid<>(v->>'id')::uuid or not public.valid_training_exercise_notes(v->'structure',w->'exerciseNotes')
  or jsonb_typeof(w->'sets') is distinct from 'array' or not public.valid_training_number(w->'durationSeconds',0,86400,1)
  or jsonb_typeof(w->'startedAt') is distinct from 'string' or jsonb_typeof(w->'finishedAt') is distinct from 'string'
  or w->>'startedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?Z$'
  or w->>'finishedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?Z$' then return false; end if;
 started:=(w->>'startedAt')::timestamptz; finished:=(w->>'finishedAt')::timestamptz;
 if finished<started or jsonb_array_length(w->'sets') not between 1 and 300 then return false; end if;
 if w ? 'perceivedEffort' and w->'perceivedEffort'<>'null' and not public.valid_training_number(w->'perceivedEffort',1,10,1) then return false; end if;
 if w ? 'note' and not public.valid_training_note(w->'note') then return false; end if;
 if src='assigned' then
  if not(w ?& array['programId','programSessionId','sessionLabel'])
   or w-array['version','id','startedAt','finishedAt','durationSeconds','sets','exerciseNotes','perceivedEffort','note','programId','programSessionId','sessionLabel']<>'{}'
   or not public.valid_training_uuid(w->'programId') or not public.valid_training_uuid(w->'programSessionId')
   or jsonb_typeof(w->'sessionLabel') is distinct from 'string' or char_length(w->>'sessionLabel') not between 1 and 10 then return false; end if;
 else
  o:=w->'origin';
  if not(w ?& array['title','origin']) or w-array['version','id','startedAt','finishedAt','durationSeconds','sets','exerciseNotes','perceivedEffort','note','title','origin']<>'{}'
   or jsonb_typeof(w->'title') is distinct from 'string' or char_length(btrim(w->>'title')) not between 1 and 100
   or jsonb_typeof(o) is distinct from 'object' or o->>'kind' is distinct from src then return false; end if;
  if src='free' then
   if o-array['kind']<>'{}' then return false; end if;
  elsif not(o ?& array['kind','routineId','revision']) or o-array['kind','routineId','revision']<>'{}'
   or not public.valid_training_uuid(o->'routineId') or not public.valid_training_number(o->'revision',0,2147483647,1) then return false;
  end if;
 end if;
 if exists(select 1 from jsonb_array_elements(v->'structure'->'exercises') item(value) where (src='assigned')<>(item.value->'prescribedExerciseId'<>'null')) then return false; end if;
 for s in select value from jsonb_array_elements(w->'sets') loop
  if jsonb_typeof(s) is distinct from 'object' or not(s ?& array['exerciseId','position','setNumber','metrics','setType','effort'])
   or not public.valid_training_uuid(s->'exerciseId') or not public.valid_training_number(s->'position',0,14,1)
   or not public.valid_training_number(s->'setNumber',1,20,1) or not public.valid_training_metrics(s->'metrics')
   or not public.valid_training_set_details(jsonb_build_object('setType',s->'setType','effort',s->'effort')) then return false; end if;
  if src='assigned' then
   if not(s ?& array['sessionExerciseId','prescribedExerciseId','exerciseName']) or s-array['exerciseId','position','setNumber','metrics','setType','effort','sessionExerciseId','prescribedExerciseId','exerciseName']<>'{}'
    or not public.valid_training_uuid(s->'sessionExerciseId') or not public.valid_training_uuid(s->'prescribedExerciseId')
    or jsonb_typeof(s->'exerciseName') is distinct from 'string' or char_length(s->>'exerciseName') not between 1 and 100 then return false; end if;
  elsif s-array['exerciseId','position','setNumber','metrics','setType','effort']<>'{}' then return false;
  end if;
  r:=v->'structure'->'exercises'->((s->>'position')::numeric::integer);
  if r is null then return false; end if;
  if (r->>'exerciseId')::uuid<>(s->>'exerciseId')::uuid or r->'prescribed'->'recordType' is distinct from s->'metrics'->'recordType' then return false; end if;
  if src='assigned' and ((r->>'id')::uuid<>(s->>'sessionExerciseId')::uuid or (r->>'prescribedExerciseId')::uuid<>(s->>'prescribedExerciseId')::uuid) then return false; end if;
  slot:=(s->>'position')::numeric::integer::text||':'||(s->>'setNumber')::numeric::integer::text;
  if slot=any(slots) then return false; end if;
  slots:=array_append(slots,slot);
 end loop;
 return true;
exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value or invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;

alter table public.exercises add column record_type text check(record_type is null or record_type in('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration','weight_duration','distance_duration','weight_distance'));
create function public.guard_exercise_record_type() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.record_type is distinct from old.record_type then raise exception 'Duplica el ejercicio para cambiar su tipo' using errcode='23514'; end if;
 return new;
end;
$$;
create trigger exercise_record_type before update on public.exercises for each row execute function public.guard_exercise_record_type();

alter table public.workouts add column exercise_notes jsonb;
alter table public.workouts drop constraint workouts_structure_check;
alter table public.workouts add constraint workouts_structure_check check(structure is null or public.valid_workout_structure(structure) or public.valid_typed_workout_structure(structure)),
 add constraint workouts_exercise_notes_check check(case when structure->'version'='2'::jsonb then public.valid_training_exercise_notes(structure,exercise_notes) else exercise_notes is null end);
alter table public.workout_sets alter column weight_kg type numeric, alter column weight_kg drop not null,
 alter column reps type numeric, alter column reps drop not null,
 add column record_type text, add column duration_seconds numeric, add column distance_meters numeric,
 add column set_type text, add column effort numeric;
alter table public.workout_sets add constraint workout_sets_metrics_check check(
 public.valid_training_metrics(jsonb_build_object('recordType',record_type,'weightKg',weight_kg,'reps',reps,'durationSeconds',duration_seconds,'distanceMeters',distance_meters))
 and case when set_type is null then record_type is null and duration_seconds is null and distance_meters is null and effort is null
 else public.valid_training_set_details(jsonb_build_object('setType',set_type,'effort',effort)) and is_warmup=(set_type='warmup') end);

-- Only the old dimensions can be compared against a prescription from earlier versions.
create function public.training_structure_legacy(s jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare r jsonb; p jsonb; rows jsonb:='[]'; detail jsonb;
begin
 if not public.valid_typed_workout_structure(s) then raise exception 'Estructura inválida' using errcode='22023'; end if;
 for r in select value from jsonb_array_elements(s->'exercises') loop
  p:=r->'prescribed';
  if not('reps'=any(public.training_metric_dimensions(p->>'recordType'))) then raise exception 'Revisa los objetivos del programa para este tipo' using errcode='40001'; end if;
  detail:=null;
  if p->'series'<>'null' then
   select jsonb_agg(jsonb_build_object('repsMin',t.value->'repsMin','repsMax',t.value->'repsMax','targetWeightKg',t.value->'targetWeightKg') order by t.i) into detail from jsonb_array_elements(p->'series') with ordinality t(value,i);
  end if;
  rows:=rows||jsonb_build_array(r||jsonb_build_object('prescribed',jsonb_build_object('sets',p->'sets','repsMin',p->'target'->'repsMin','repsMax',p->'target'->'repsMax','targetWeightKg',p->'target'->'targetWeightKg','series',detail)));
 end loop;
 return jsonb_build_object('version',1,'exercises',rows);
end;
$$;

create function public.save_typed_workout_recording(p_recording jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); wid uuid; hash text; saved_hash text; w jsonb; src text;
begin
 if owner is null or not public.is_active_member() then raise exception 'Se requiere una cuenta activa' using errcode='42501'; end if;
 if not public.valid_typed_workout_recording(p_recording) then raise exception 'Documento de cierre inválido' using errcode='22023'; end if;
 wid:=(p_recording->>'id')::uuid; w:=p_recording->'workout'; src:=p_recording->>'source';
 hash:=encode(extensions.digest(p_recording::text,'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':'||wid::text,214));
 select payload_hash into saved_hash from public.workout_recording_receipts where owner_id=owner and workout_id=wid;
 if found then
  if saved_hash<>hash then raise exception 'Identificador usado con otro documento' using errcode='23505'; end if;
  return jsonb_build_object('workoutId',wid,'status',case when exists(select 1 from public.workouts where id=wid and student_id=owner) then 'duplicate' else 'removed' end);
 end if;
 if exists(select 1 from public.workouts where id=wid) or exists(select 1 from public.personal_workout_receipts where owner_id=owner and workout_id=wid) then
  raise exception 'Identificador ya utilizado' using errcode='23505'; end if;
 insert into public.workouts(id,student_id,source_kind,title,personal_routine_id,personal_routine_revision,program_id,program_session_id,session_label,started_at,finished_at,duration_seconds,perceived_effort,note,structure,exercise_notes)
 values(wid,owner,src,case when src<>'assigned' then btrim(w->>'title') end,
  case when src='personal' then (w->'origin'->>'routineId')::uuid end,case when src='personal' then (w->'origin'->>'revision')::numeric::integer end,
  (w->>'programId')::uuid,(w->>'programSessionId')::uuid,w->>'sessionLabel',(w->>'startedAt')::timestamptz,(w->>'finishedAt')::timestamptz,(w->>'durationSeconds')::numeric::integer,
  (w->>'perceivedEffort')::numeric::smallint,nullif(btrim(w->>'note'),''),p_recording->'structure',w->'exerciseNotes');
 insert into public.workout_sets(workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps,is_warmup,session_exercise_id,prescribed_exercise_id,record_type,duration_seconds,distance_meters,set_type,effort)
 select wid,owner,(s->>'exerciseId')::uuid,case when src='assigned' then s->>'exerciseName' else 'Ejercicio' end,
  (s->>'position')::numeric::smallint,(s->>'setNumber')::numeric::smallint,(s->'metrics'->>'weightKg')::numeric,(s->'metrics'->>'reps')::numeric,s->>'setType'='warmup',
  (s->>'sessionExerciseId')::uuid,(s->>'prescribedExerciseId')::uuid,s->'metrics'->>'recordType',(s->'metrics'->>'durationSeconds')::numeric,(s->'metrics'->>'distanceMeters')::numeric,s->>'setType',(s->>'effort')::numeric
 from jsonb_array_elements(w->'sets') s;
 insert into public.workout_recording_receipts(owner_id,workout_id,payload_hash) values(owner,wid,hash);
 return jsonb_build_object('workoutId',wid,'status','created');
end;
$$;

revoke all on function public.valid_training_uuid(jsonb),public.valid_typed_workout_structure(jsonb),public.valid_training_exercise_notes(jsonb,jsonb),public.valid_typed_workout_recording(jsonb),public.training_structure_legacy(jsonb),public.save_typed_workout_recording(jsonb) from public,anon;
grant execute on function public.valid_training_uuid(jsonb),public.valid_typed_workout_structure(jsonb),public.valid_training_exercise_notes(jsonb,jsonb),public.valid_typed_workout_recording(jsonb),public.training_structure_legacy(jsonb),public.save_typed_workout_recording(jsonb) to authenticated;
revoke all on function public.guard_exercise_record_type() from public,anon,authenticated;

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

create or replace function public.guard_workout_structure_set() returns trigger
language plpgsql security invoker set search_path='' as $$
declare structure jsonb; src text; r jsonb;
begin
 select w.structure,w.source_kind into structure,src from public.workouts w where w.id=new.workout_id and w.student_id=new.student_id;
 if structure is null or structure->'version'='1'::jsonb then
  if new.set_type is not null or new.record_type is not null or new.duration_seconds is not null or new.distance_meters is not null or new.effort is not null then raise exception 'Formato anterior no admite métricas nuevas' using errcode='23514'; end if;
  if exists(select 1 from public.exercises e where e.id=new.exercise_id and e.record_type is not null) then raise exception 'Este ejercicio requiere el formato nuevo de registro' using errcode='23514'; end if;
  if structure is null then return new; end if;
 elsif new.set_type is null then raise exception 'La serie nueva requiere su tipo' using errcode='23514';
 end if;
 r:=structure->'exercises'->new.position;
 if r is null or new.position not between 0 and 14 or new.set_number not between 1 and 20
    or new.reps not between 1 and 100 or new.weight_kg not between 0 and 500
    or new.exercise_id<>(r->>'exerciseId')::uuid then raise exception 'Serie incompatible con la estructura del cierre' using errcode='23514'; end if;
 if structure->'version'='2'::jsonb and new.record_type is distinct from (r->'prescribed'->>'recordType') then raise exception 'Tipo incompatible con la estructura' using errcode='23514'; end if;
 if src='assigned' and (new.prescribed_exercise_id is distinct from (r->>'prescribedExerciseId')::uuid
    or (new.session_exercise_id is distinct from (r->>'id')::uuid and not(new.session_exercise_id is null and not exists(select 1 from public.session_exercises where id=(r->>'id')::uuid)))) then
  raise exception 'Identidad incompatible con la estructura del cierre' using errcode='23514';
 end if;
 return new;
end;
$$;
