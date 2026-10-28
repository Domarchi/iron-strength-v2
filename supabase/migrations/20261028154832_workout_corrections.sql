-- T218 · Correcciones completas, independientes del cierre original.
alter table public.workouts add column edit_revision integer not null default 0 check(edit_revision>=0);
create table public.workout_correction_receipts(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null,
 workout_id uuid not null,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 revision integer not null check(revision>0),
 created_at timestamptz not null default now(),
 primary key(owner_id,request_id)
);
create index workout_correction_receipts_workout_idx on public.workout_correction_receipts(owner_id,workout_id);
alter table public.workout_correction_receipts enable row level security;
create policy workout_correction_receipts_select on public.workout_correction_receipts for select to authenticated
 using(public.is_active_member() and owner_id=(select auth.uid()));
create policy workout_correction_receipts_insert on public.workout_correction_receipts for insert to authenticated
 with check(public.is_active_member() and owner_id=(select auth.uid()));
revoke all on public.workout_correction_receipts from public,anon,authenticated;
grant select,insert on public.workout_correction_receipts to authenticated;

create function public.guard_workout_edit_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
  if exists(select 1 from public.workout_correction_receipts where owner_id=new.student_id and workout_id=new.id) then
   raise exception 'Identificador de resultado ya utilizado' using errcode='23505';
  end if;
  new.edit_revision:=0;
 else new.edit_revision:=old.edit_revision+1;
 end if;
 return new;
end;
$$;
create trigger workout_edit_revision before insert or update on public.workouts
 for each row execute function public.guard_workout_edit_revision();

-- También las escrituras anteriores/directas invalidan la revisión del editor nuevo.
-- El UPDATE del padre serializa con la corrección. Un deadlock aborta la transacción,
-- nunca acredita una corrección parcial ni permite sobrescribir una revisión ajena.
create function public.touch_workout_edit_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then
  -- Auth elimina por FK sin privilegios sobre las tablas de producto. El padre
  -- también desaparece: no elevar privilegios para actualizar una revisión inútil.
  if not pg_catalog.has_table_privilege(current_user,'public.workouts','UPDATE') then return old; end if;
  update public.workouts set edit_revision=edit_revision+1 where id=old.workout_id and student_id=old.student_id;
  return old;
 end if;
 update public.workouts set edit_revision=edit_revision+1 where id=new.workout_id and student_id=new.student_id;
 return new;
end;
$$;
create trigger workout_sets_edit_revision after insert or update or delete on public.workout_sets
 for each row execute function public.touch_workout_edit_revision();

create function public.valid_workout_correction(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare s jsonb; ids uuid[]:='{}'; sid uuid;
begin
 if jsonb_typeof(v) is distinct from 'object' or not(v ?& array['version','requestId','workoutId','expectedRevision','perceivedEffort','note','exerciseNotes','sets'])
  or v-array['version','requestId','workoutId','expectedRevision','perceivedEffort','note','exerciseNotes','sets']<>'{}'
  or v->'version' is distinct from '1'::jsonb or not public.valid_training_uuid(v->'requestId') or not public.valid_training_uuid(v->'workoutId')
  or not public.valid_training_number(v->'expectedRevision',0,2147483647,1)
  or (v->'perceivedEffort'<>'null' and not public.valid_training_number(v->'perceivedEffort',1,10,1))
  or not public.valid_training_note(v->'note')
  or (v->'exerciseNotes'<>'null' and jsonb_typeof(v->'exerciseNotes') is distinct from 'array')
  or jsonb_typeof(v->'sets') is distinct from 'array' then return false; end if;
 if jsonb_array_length(v->'sets') not between 1 and 300 then return false; end if;
 for s in select value from jsonb_array_elements(v->'sets') loop
  if jsonb_typeof(s) is distinct from 'object' or not(s ?& array['id','metrics','setType','effort','isWarmup'])
   or s-array['id','metrics','setType','effort','isWarmup']<>'{}' or not public.valid_training_uuid(s->'id')
   or not public.valid_training_metrics(s->'metrics') or jsonb_typeof(s->'isWarmup') is distinct from 'boolean' then return false; end if;
  sid:=(s->>'id')::uuid;
  if sid=any(ids) then return false; end if;
  ids:=array_append(ids,sid);
  if s->'setType'='null' then
   if s->'effort'<>'null' or s->'metrics'->'recordType'<>'null' then return false; end if;
  elsif not public.valid_training_set_details(jsonb_build_object('setType',s->'setType','effort',s->'effort'))
     or (s->>'isWarmup')::boolean is distinct from (s->>'setType'='warmup') then return false;
  end if;
 end loop;
 return true;
end;
$$;

create function public.get_own_workout_correction(p_workout_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); result jsonb;
begin
 if owner is null or not public.is_active_member() then raise exception 'Sin acceso' using errcode='42501'; end if;
 if (select count(*) from public.workout_sets where workout_id=p_workout_id and student_id=owner)>300 then
  raise exception 'Resultado excede esta versión' using errcode='0A000';
 end if;
 select jsonb_build_object('version',1,'userId',owner,'today',(now() at time zone 'America/Santiago')::date,
  'workout',jsonb_build_object('id',w.id,'revision',w.edit_revision,'sourceKind',w.source_kind,'title',w.title,
   'sessionLabel',w.session_label,'performedOn',w.performed_on,'startedAt',w.started_at,'durationSeconds',w.duration_seconds,
   'structure',w.structure,'perceivedEffort',w.perceived_effort,'note',w.note,'exerciseNotes',w.exercise_notes,
   'sets',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'position',s.position,'setNumber',s.set_number,
    'exerciseId',s.exercise_id,'exerciseName',s.exercise_name,'prescribedExerciseId',s.prescribed_exercise_id,
    'prescribedExerciseName',s.prescribed_exercise_name,'sessionExerciseId',s.session_exercise_id,
    'metrics',jsonb_build_object('recordType',s.record_type,'weightKg',s.weight_kg,'reps',s.reps,'durationSeconds',s.duration_seconds,'distanceMeters',s.distance_meters),
    'setType',s.set_type,'effort',s.effort,'isWarmup',s.is_warmup) order by s.position,s.set_number,s.id)
    from public.workout_sets s where s.workout_id=w.id and s.student_id=owner),'[]'::jsonb))) into result
 from public.workouts w where w.id=p_workout_id and w.student_id=owner;
 return result;
end;
$$;

create function public.correct_own_workout(p_correction jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); wid uuid; rid uuid; fingerprint text; saved public.workout_correction_receipts%rowtype;
 w public.workouts%rowtype; original public.workout_sets%rowtype; item jsonb; ids uuid[]:='{}'; next_revision integer;
begin
 if owner is null or not public.is_active_member() then raise exception 'Sin acceso' using errcode='42501'; end if;
 if not public.valid_workout_correction(p_correction) then raise exception 'Corrección inválida' using errcode='22023'; end if;
 wid:=(p_correction->>'workoutId')::uuid; rid:=(p_correction->>'requestId')::uuid;
 fingerprint:=encode(extensions.digest(p_correction::text,'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':'||rid::text,218));
 select * into saved from public.workout_correction_receipts where owner_id=owner and request_id=rid;
 if found then
  if saved.workout_id<>wid or saved.payload_hash<>fingerprint then raise exception 'Intento con contenido distinto' using errcode='22023'; end if;
  return jsonb_build_object('version',1,'requestId',rid,'workoutId',wid,'revision',saved.revision,
   'status',case when exists(select 1 from public.workouts where id=wid and student_id=owner) then 'duplicate' else 'removed' end);
 end if;
 select * into w from public.workouts where id=wid and student_id=owner;
 if not found then raise exception 'Resultado no disponible' using errcode='P0002'; end if;
 if w.performed_on<public.edit_window_start() then raise exception 'Fuera de la ventana de edición' using errcode='55000'; end if;
 select * into w from public.workouts where id=wid and student_id=owner for update;
 if not found or w.edit_revision<>(p_correction->>'expectedRevision')::integer then
  raise exception 'El resultado cambió; revisa la versión actual' using errcode='40001';
 end if;
 if w.performed_on<public.edit_window_start() then raise exception 'Fuera de la ventana de edición' using errcode='55000'; end if;
 if w.structure->'version'='2'::jsonb then
  if not public.valid_training_exercise_notes(w.structure,p_correction->'exerciseNotes') then raise exception 'Notas inválidas' using errcode='22023'; end if;
 elsif p_correction->'exerciseNotes'<>'null' then raise exception 'Conserva el formato anterior' using errcode='22023'; end if;
 -- Validar todos los IDs y dimensiones antes de escribir la primera serie.
 for item in select value from jsonb_array_elements(p_correction->'sets') loop
  select * into original from public.workout_sets where id=(item->>'id')::uuid and workout_id=wid and student_id=owner;
  if not found or original.record_type is distinct from (item->'metrics'->>'recordType')
   or (w.structure->'version'='2'::jsonb and item->'setType'='null')
   or ((w.structure is null or w.structure->'version'<>'2'::jsonb) and (item->'setType'<>'null' or item->'effort'<>'null')) then
   raise exception 'Serie ajena o formato incompatible' using errcode='22023';
  end if;
  ids:=array_append(ids,original.id);
 end loop;
 update public.workouts set perceived_effort=(p_correction->>'perceivedEffort')::integer,note=p_correction->>'note',
  exercise_notes=nullif(p_correction->'exerciseNotes','null'::jsonb) where id=wid and student_id=owner;
 delete from public.workout_sets where workout_id=wid and student_id=owner and not(id=any(ids));
 for item in select value from jsonb_array_elements(p_correction->'sets') loop
  update public.workout_sets set weight_kg=(item->'metrics'->>'weightKg')::numeric,reps=(item->'metrics'->>'reps')::numeric,
   duration_seconds=(item->'metrics'->>'durationSeconds')::numeric,distance_meters=(item->'metrics'->>'distanceMeters')::numeric,
   set_type=item->>'setType',effort=(item->>'effort')::numeric,is_warmup=(item->>'isWarmup')::boolean
   where id=(item->>'id')::uuid and workout_id=wid and student_id=owner;
 end loop;
 select edit_revision into next_revision from public.workouts where id=wid and student_id=owner;
 insert into public.workout_correction_receipts(owner_id,request_id,workout_id,payload_hash,revision)
  values(owner,rid,wid,fingerprint,next_revision);
 return jsonb_build_object('version',1,'requestId',rid,'workoutId',wid,'revision',next_revision,'status','updated');
end;
$$;
revoke all on function public.guard_workout_edit_revision(),public.touch_workout_edit_revision() from public,anon,authenticated;
revoke all on function public.valid_workout_correction(jsonb),public.get_own_workout_correction(uuid),public.correct_own_workout(jsonb) from public,anon,authenticated;
grant execute on function public.valid_workout_correction(jsonb),public.get_own_workout_correction(uuid),public.correct_own_workout(jsonb) to authenticated;
