-- T213: origen explícito sin inventar programas; históricos asignados mantienen su significado.
alter table public.workouts
 add column source_kind text not null default 'assigned' check(source_kind in ('assigned','personal','free')),
 add column title text check(title is null or char_length(btrim(title)) between 1 and 100),
 add column personal_routine_id uuid,
 add column personal_routine_revision integer,
 add constraint workouts_personal_owner_fk foreign key(personal_routine_id,student_id)
   references public.personal_routines(id,owner_id) on delete set null(personal_routine_id),
 add constraint workouts_personal_origin_check check(
   (source_kind='assigned' and personal_routine_id is null and personal_routine_revision is null)
   or (source_kind='free' and personal_routine_id is null and personal_routine_revision is null
       and title is not null and program_id is null and program_session_id is null)
   or (source_kind='personal' and personal_routine_revision is not null and personal_routine_revision>=0
       and title is not null and program_id is null and program_session_id is null));
create index workouts_personal_routine_idx on public.workouts(personal_routine_id,student_id)
 where personal_routine_id is not null;

create table public.personal_workout_receipts(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 workout_id uuid not null,
 payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),
 primary key(owner_id,workout_id)
);
alter table public.personal_workout_receipts enable row level security;
create policy personal_workout_receipts_select on public.personal_workout_receipts for select to authenticated
 using(owner_id=(select auth.uid()) and public.is_active_member());
create policy personal_workout_receipts_insert on public.personal_workout_receipts for insert to authenticated
 with check(owner_id=(select auth.uid()) and public.is_active_member());
revoke all on public.personal_workout_receipts from public,anon,authenticated;
grant select,insert on public.personal_workout_receipts to authenticated;

create function public.guard_personal_workout_origin() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_revision integer;
begin
 if tg_op='UPDATE' then
   if (new.source_kind,new.personal_routine_revision,new.title) is distinct from
      (old.source_kind,old.personal_routine_revision,old.title)
      or (new.personal_routine_id is distinct from old.personal_routine_id and not
        (new.personal_routine_id is null and not exists(select 1 from public.personal_routines where id=old.personal_routine_id))) then
     raise exception 'La procedencia del entrenamiento no se puede cambiar' using errcode='P0001';
   end if;
   return new;
 end if;
 if new.source_kind='personal' then
   select revision into v_revision from public.personal_routines
    where id=new.personal_routine_id and owner_id=new.student_id;
   if not found then raise exception 'Rutina no disponible' using errcode='P0002'; end if;
   if new.personal_routine_revision is null or new.personal_routine_revision>v_revision then
     raise exception 'Revisión no válida' using errcode='22023';
   end if;
 end if;
 return new;
end;
$$;
revoke all on function public.guard_personal_workout_origin() from public,anon,authenticated;
create trigger personal_workout_origin before insert or update on public.workouts
 for each row execute function public.guard_personal_workout_origin();

-- La autorización de las asignadas queda en guard_workout_exercise_identity sin ampliaciones.
create function public.guard_personal_workout_set() returns trigger
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
   (e.archived_at is null or exists(select 1 from public.personal_routine_items i
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
revoke all on function public.guard_personal_workout_set() from public,anon,authenticated;
create trigger personal_workout_set before insert or update on public.workout_sets
 for each row execute function public.guard_personal_workout_set();

create function public.save_personal_workout(p_workout jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 v_owner uuid:=auth.uid(); v_id uuid; v_hash text; v_saved_hash text;
 v_origin jsonb; v_sets jsonb; v_set jsonb; v_kind text; v_routine uuid; v_revision integer;
 v_started timestamptz; v_finished timestamptz; v_duration integer; v_value numeric;
begin
 if v_owner is null or not public.is_active_member() then
   raise exception 'Se requiere una cuenta activa' using errcode='42501';
 end if;
 if jsonb_typeof(p_workout) is distinct from 'object'
    or not(p_workout ?& array['version','id','origin','title','startedAt','finishedAt','durationSeconds','sets'])
    or p_workout-array['version','id','origin','title','startedAt','finishedAt','durationSeconds','sets','perceivedEffort','note']<>'{}'::jsonb
    or p_workout->'version' is distinct from '1'::jsonb then
   raise exception 'Contenido inválido' using errcode='22023';
 end if;
 v_id:=(p_workout->>'id')::uuid;
 v_hash:=pg_catalog.encode(extensions.digest(p_workout::text,'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text||':'||v_id::text,213));
 select payload_hash into v_saved_hash from public.personal_workout_receipts
   where owner_id=v_owner and workout_id=v_id;
 if found then
   if v_saved_hash<>v_hash then raise exception 'Identificador usado con otro contenido' using errcode='23505'; end if;
   return jsonb_build_object('workoutId',v_id,'status',case when exists(select 1 from public.workouts where id=v_id and student_id=v_owner)
      then 'duplicate' else 'removed' end);
 end if;
 if exists(select 1 from public.workouts where id=v_id) then
   raise exception 'Identificador ya utilizado' using errcode='23505';
 end if;
 v_origin:=p_workout->'origin'; v_kind:=v_origin->>'kind'; v_sets:=p_workout->'sets';
 if jsonb_typeof(v_origin) is distinct from 'object' or v_kind is null or v_kind not in ('personal','free')
    or (v_kind='free' and v_origin-array['kind']<>'{}'::jsonb)
    or (v_kind='personal' and (not(v_origin ?& array['kind','routineId','revision'])
      or v_origin-array['kind','routineId','revision']<>'{}'::jsonb
      or jsonb_typeof(v_origin->'revision') is distinct from 'number'
      or v_origin->>'revision' !~ '^[0-9]+$')) then
   raise exception 'Origen inválido' using errcode='22023';
 end if;
 if v_kind='personal' then v_routine:=(v_origin->>'routineId')::uuid; v_revision:=(v_origin->>'revision')::integer; end if;
 if jsonb_typeof(p_workout->'title') is distinct from 'string' or char_length(btrim(p_workout->>'title')) not between 1 and 100
    or jsonb_typeof(p_workout->'durationSeconds') is distinct from 'number'
    or p_workout->>'durationSeconds' !~ '^[0-9]+$'
    or jsonb_typeof(v_sets) is distinct from 'array' then
   raise exception 'Encabezado inválido' using errcode='22023';
 end if;
 v_duration:=(p_workout->>'durationSeconds')::integer;
 v_started:=(p_workout->>'startedAt')::timestamptz; v_finished:=(p_workout->>'finishedAt')::timestamptz;
 if v_started is null or v_finished is null or v_finished<v_started or v_duration not between 0 and 86400
    or jsonb_array_length(v_sets) not between 1 and 300 then
   raise exception 'Fechas o cantidad inválidas' using errcode='22023';
 end if;
 if p_workout ? 'perceivedEffort' and p_workout->'perceivedEffort'<>'null'::jsonb and
   (jsonb_typeof(p_workout->'perceivedEffort')<>'number' or p_workout->>'perceivedEffort' !~ '^[0-9]+$'
    or (p_workout->>'perceivedEffort')::integer not between 1 and 10) then
   raise exception 'Esfuerzo inválido' using errcode='22023';
 end if;
 if p_workout ? 'note' and p_workout->'note'<>'null'::jsonb and
   (jsonb_typeof(p_workout->'note')<>'string' or char_length(btrim(p_workout->>'note'))>500) then
   raise exception 'Nota inválida' using errcode='22023';
 end if;
 for v_set in select value from jsonb_array_elements(v_sets) loop
   if jsonb_typeof(v_set) is distinct from 'object'
      or not(v_set ?& array['exerciseId','position','setNumber','weightKg','reps','isWarmup'])
      or v_set-array['exerciseId','position','setNumber','weightKg','reps','isWarmup']<>'{}'::jsonb
      or jsonb_typeof(v_set->'exerciseId') is distinct from 'string'
      or jsonb_typeof(v_set->'position') is distinct from 'number' or v_set->>'position' !~ '^[0-9]+$'
      or jsonb_typeof(v_set->'setNumber') is distinct from 'number' or v_set->>'setNumber' !~ '^[0-9]+$'
      or jsonb_typeof(v_set->'reps') is distinct from 'number' or v_set->>'reps' !~ '^[0-9]+$'
      or jsonb_typeof(v_set->'weightKg') is distinct from 'number'
      or jsonb_typeof(v_set->'isWarmup') is distinct from 'boolean' then
     raise exception 'Serie inválida' using errcode='22023';
   end if;
   v_value:=(v_set->>'weightKg')::numeric;
   if (v_set->>'position')::integer not between 0 and 14 or (v_set->>'setNumber')::integer not between 1 and 20
      or (v_set->>'reps')::integer not between 1 and 100 or v_value not between 0 and 500
      or v_value<>round(v_value,2) then raise exception 'Límite de serie inválido' using errcode='22023'; end if;
 end loop;
 if (select count(*) from (select distinct s->>'position',s->>'setNumber' from jsonb_array_elements(v_sets) s) slots)<>jsonb_array_length(v_sets)
    or exists(select 1 from jsonb_array_elements(v_sets) s group by s->>'position' having count(distinct s->>'exerciseId')>1) then
   raise exception 'Posiciones o series repetidas' using errcode='22023';
 end if;
 insert into public.workouts(id,student_id,source_kind,title,personal_routine_id,personal_routine_revision,
   started_at,finished_at,duration_seconds,perceived_effort,note)
 values(v_id,v_owner,v_kind,btrim(p_workout->>'title'),v_routine,v_revision,v_started,v_finished,v_duration,
   (p_workout->>'perceivedEffort')::smallint,nullif(btrim(p_workout->>'note'),''));
 insert into public.workout_sets(workout_id,student_id,exercise_id,exercise_name,position,set_number,weight_kg,reps,is_warmup)
 select v_id,v_owner,(s->>'exerciseId')::uuid,'Ejercicio',(s->>'position')::smallint,(s->>'setNumber')::smallint,
   (s->>'weightKg')::numeric,(s->>'reps')::smallint,(s->>'isWarmup')::boolean from jsonb_array_elements(v_sets) s;
 insert into public.personal_workout_receipts(owner_id,workout_id,payload_hash) values(v_owner,v_id,v_hash);
 return jsonb_build_object('workoutId',v_id,'status','created');
end;
$$;
revoke all on function public.save_personal_workout(jsonb) from public,anon;
grant execute on function public.save_personal_workout(jsonb) to authenticated;
