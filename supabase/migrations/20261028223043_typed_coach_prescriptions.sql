-- T219: one canonical target source. Existing rows remain in their original format.
alter table public.session_exercises add column typed_prescription jsonb;
alter table public.session_exercise_alternatives add column typed_prescription jsonb;
alter table public.session_exercises alter column reps_min drop not null;
alter table public.session_exercises alter column reps_max drop not null;
alter table public.session_exercise_alternatives alter column reps_min drop not null;
alter table public.session_exercise_alternatives alter column reps_max drop not null;

alter table public.session_exercises add constraint session_exercises_prescription_format check (
 case when typed_prescription is null then reps_min is not null and reps_max is not null
 when public.valid_training_prescription(typed_prescription) then
   sets=(typed_prescription->>'sets')::numeric and reps_min is null and reps_max is null
   and target_weight_kg is null and prescription_sets is null
 else false end
);
alter table public.session_exercise_alternatives add constraint alternatives_prescription_format check (
 case when typed_prescription is null then reps_min is not null and reps_max is not null
 when public.valid_training_prescription(typed_prescription) then
   sets=(typed_prescription->>'sets')::numeric and reps_min is null and reps_max is null
   and target_weight_kg is null and prescription_sets is null
 else false end
);

-- Pure projection shared with the personal library. Never consults today's exercise
-- metadata to reinterpret a legacy prescription, snapshot or historical result.
create function public.routine_training_prescription(p_item jsonb) returns jsonb
 language sql immutable security invoker set search_path='' as $$
 select public.personal_training_prescription(p_item)
$$;
revoke all on function public.routine_training_prescription(jsonb) from public,anon;
grant execute on function public.routine_training_prescription(jsonb) to authenticated;

-- Enforce the edit window for scalar targets as well as per-set/canonical targets.
-- Existing assign_program is the already-authorized definer for assignment of the
-- current week. No new privileged path is introduced here.
drop trigger guard_prescription_series_week on public.session_exercises;
drop function public.guard_prescription_series_week();
create function public.guard_routine_prescription() returns trigger
 language plpgsql security invoker set search_path='' as $$
declare v_old_session uuid; v_new_session uuid; v_kind text;
begin
 -- Auth cascades execute without SELECT privileges on application tables.
 -- A non-authenticated executor does not need the prescription edit-window lookup.
 if tg_op='DELETE' and current_user<>'authenticated' then return old; end if;
 if tg_table_name='session_exercises' then
   if tg_op<>'INSERT' then v_old_session:=old.program_session_id; end if;
   if tg_op<>'DELETE' then v_new_session:=new.program_session_id; end if;
 else
   if tg_op<>'INSERT' then
     select e.program_session_id into v_old_session from public.session_exercises e where e.id=old.session_exercise_id;
   end if;
   if tg_op<>'DELETE' then
     select e.program_session_id into v_new_session from public.session_exercises e where e.id=new.session_exercise_id;
   end if;
 end if;
 if current_user='authenticated' then
   if not public.is_coach() then raise exception 'Solo el coach puede editar' using errcode='42501'; end if;
   -- During a cascade a removed parent no longer has a session to edit. Parent
   -- deletion retains its own authorization; account cleanup must remain possible.
   if v_old_session is not null and exists(select 1 from public.program_sessions where id=v_old_session)
     and not public.can_edit_routine_session(v_old_session) then
     raise exception 'Semana bloqueada' using errcode='55000';
   end if;
   if v_new_session is not null and not public.can_edit_routine_session(v_new_session) then
     raise exception 'Semana bloqueada' using errcode='55000';
   end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 if tg_op='UPDATE' and old.typed_prescription is not null and new.typed_prescription is null then
   raise exception 'No se puede eliminar una prescripción tipada' using errcode='22023';
 end if;
 select e.record_type into v_kind from public.exercises e where e.id=new.exercise_id;
 if (new.typed_prescription is null and v_kind is not null) or
   (new.typed_prescription is not null and v_kind is distinct from new.typed_prescription->>'recordType') then
   raise exception 'Tipo de prescripción incompatible' using errcode='22023';
 end if;
 return new;
end;
$$;
revoke all on function public.guard_routine_prescription() from public,anon,authenticated;
create trigger guard_routine_prescription before insert or update or delete on public.session_exercises
 for each row execute function public.guard_routine_prescription();
create trigger guard_routine_prescription before insert or update or delete on public.session_exercise_alternatives
 for each row execute function public.guard_routine_prescription();

-- Protect the parent too: deleting/moving it must not bypass prescription guards.
-- Cascading program/account removal keeps the authorization of its existing API.
create function public.guard_routine_session_week() returns trigger
 language plpgsql security invoker set search_path='' as $$
declare v_old_program uuid; v_new_program uuid; v_old_week smallint; v_new_week smallint; v_window record;
begin
 if current_user='authenticated' then
   if not public.is_coach() then raise exception 'Solo el coach puede editar' using errcode='42501'; end if;
   if tg_op<>'INSERT' then v_old_program:=old.program_id; v_old_week:=old.week_number; end if;
   if tg_op<>'DELETE' then v_new_program:=new.program_id; v_new_week:=new.week_number; end if;
   for v_window in
     select p.start_date,p.ends_on,p.student_id,s.week_number
     from (values(v_old_program,v_old_week),(v_new_program,v_new_week)) s(program_id,week_number)
     join public.programs p on p.id=s.program_id where p.coach_id=auth.uid()
   loop
     if v_window.student_id is not null and (
       v_window.start_date+((v_window.week_number-1)*7)<=date_trunc('week',now() at time zone 'America/Santiago')::date
       or v_window.start_date+((v_window.week_number-1)*7)>v_window.ends_on
       or (now() at time zone 'America/Santiago')::date>v_window.ends_on
     ) then raise exception 'Semana bloqueada' using errcode='55000'; end if;
   end loop;
 end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function public.guard_routine_session_week() from public,anon,authenticated;
create trigger guard_routine_session_week before insert or update or delete on public.program_sessions
 for each row execute function public.guard_routine_session_week();

create function public.guard_routine_program_assignment() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if current_user='authenticated' then
   if tg_op='DELETE' then
     if old.student_id is not null then
       raise exception 'El programa asignado requiere una operación de planificación' using errcode='55000';
     end if;
   elsif (old.student_id is not null or new.student_id is not null) and
     (old.coach_id,old.student_id,old.source_program_id,old.start_date,old.ends_on,old.weeks_count)
       is distinct from
     (new.coach_id,new.student_id,new.source_program_id,new.start_date,new.ends_on,new.weeks_count) then
     raise exception 'El calendario asignado requiere una operación de planificación' using errcode='55000';
   end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function public.guard_routine_program_assignment() from public,anon,authenticated;
create trigger guard_routine_program_assignment before update or delete on public.programs
 for each row execute function public.guard_routine_program_assignment();

-- Existing copy APIs keep their receipts and signatures; only the copied columns
-- expand. assign_program retains its existing, checked assignment privilege.
create or replace function public.assign_program(p_template_id uuid, p_student_id uuid, p_start_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_copy_item record;
  v_copy_exercise uuid;
  v_copy_group uuid;
  v_copy_groups jsonb;
  v_template public.programs%rowtype;
  v_start date;
  v_end date;
  v_current_monday date := (date_trunc('week', now() at time zone 'America/Santiago'))::date;
  v_new_program uuid;
  v_new_session uuid;
  v_session record;
  v_conflict record;
begin
  if not public.is_coach() or not public.is_coach_of(p_student_id) then
    raise exception 'Solo el coach puede asignar programas a sus alumnos' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_student_id and is_active) then
    raise exception 'El alumno no está activo' using errcode = '22023';
  end if;

  select * into v_template
  from public.programs
  where id = p_template_id and coach_id = auth.uid() and student_id is null for share;

  if not found then
    raise exception 'Plantilla no encontrada' using errcode = 'P0002';
  end if;

  v_start := (date_trunc('week', p_start_date::timestamp))::date;
  if v_start < v_current_monday then
    raise exception 'La fecha de inicio no puede ser anterior al lunes de la semana actual'
      using errcode = '22023';
  end if;
  v_end := v_start + v_template.weeks_count * 7 - 1;

  -- Programas del alumno que se solapan con el nuevo rango.
  for v_conflict in
    select p.id, p.start_date
    from public.programs p
    where p.student_id = p_student_id
      and daterange(p.start_date, p.ends_on, '[]') && daterange(v_start, v_end, '[]')
    order by p.start_date
  loop
    if v_conflict.start_date >= v_start then
      if exists (select 1 from public.workouts w where w.program_id = v_conflict.id) then
        raise exception 'El programa existente ya tiene entrenamientos y no se puede reemplazar'
          using errcode = 'P0001';
      end if;
      delete from public.programs where id = v_conflict.id;
    else
      update public.programs set ends_on = v_start - 1 where id = v_conflict.id;
    end if;
  end loop;

  insert into public.programs
    (coach_id, student_id, source_program_id, name, weeks_count, start_date, ends_on)
  values
    (auth.uid(), p_student_id, v_template.id, v_template.name, v_template.weeks_count, v_start, v_end)
  returning id into v_new_program;

  for v_session in
    select id, week_number, label, position, title, weekday
    from public.program_sessions
    where program_id = v_template.id
    order by week_number, label
  loop
    insert into public.program_sessions (program_id, week_number, label, position, title, weekday)
    values (v_new_program, v_session.week_number, v_session.label, v_session.position, v_session.title, v_session.weekday)
    returning id into v_new_session;

    -- Comandos separados dentro de la misma transacción: RLS puede ver cada padre recién copiado.
    v_copy_groups:='{}'::jsonb;
    for v_copy_item in select * from public.session_exercises where program_session_id=v_session.id order by position,id loop
      v_copy_exercise:=gen_random_uuid();
      v_copy_group:=null;
      if v_copy_item.superset_id is not null then
        v_copy_group:=(v_copy_groups->>v_copy_item.superset_id::text)::uuid;
        if v_copy_group is null then
          v_copy_group:=gen_random_uuid();
          v_copy_groups:=v_copy_groups||jsonb_build_object(v_copy_item.superset_id::text,v_copy_group);
        end if;
      end if;
      insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,note,rest_seconds,superset_id,superset_rest_seconds,prescription_sets,typed_prescription)
      values(v_copy_exercise,v_new_session,v_copy_item.exercise_id,v_copy_item.position,v_copy_item.sets,v_copy_item.reps_min,v_copy_item.reps_max,
        v_copy_item.target_weight_kg,v_copy_item.note,v_copy_item.rest_seconds,v_copy_group,v_copy_item.superset_rest_seconds,v_copy_item.prescription_sets,v_copy_item.typed_prescription);
      insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,prescription_sets,typed_prescription)
      select v_copy_exercise,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,prescription_sets,typed_prescription
        from public.session_exercise_alternatives where session_exercise_id=v_copy_item.id;
    end loop;
  end loop;

  return v_new_program;
end;
$$;

create or replace function public.copy_program_week(
  p_program_id uuid,
  p_from smallint,
  p_to smallint,
  p_replace boolean default false
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_copy_item record;
  v_copy_exercise uuid;
  v_copy_group uuid;
  v_copy_groups jsonb;
  v_weeks smallint;
  v_copied integer := 0;
  v_session record;
  v_new_session uuid;
begin
  select weeks_count into v_weeks from public.programs
    where id = p_program_id and coach_id = auth.uid() for update;
  if v_weeks is null then
    raise exception 'Programa no encontrado' using errcode = 'P0002';
  end if;

  if p_from = p_to or p_from < 1 or p_to < 1 or p_from > v_weeks or p_to > v_weeks then
    raise exception 'Semanas inválidas' using errcode = '22023';
  end if;

  if exists(select 1 from public.programs p where p.id=p_program_id and p.student_id is not null and (
    p.start_date+((p_to-1)*7)<=date_trunc('week',now() at time zone 'America/Santiago')::date
    or p.start_date+((p_to-1)*7)>p.ends_on
    or (now() at time zone 'America/Santiago')::date>p.ends_on
  )) then raise exception 'Semana bloqueada' using errcode='55000'; end if;

  if exists (
    select 1 from public.program_sessions where program_id = p_program_id and week_number = p_to
  ) then
    if not p_replace then
      raise exception 'La semana destino ya tiene sesiones' using errcode = 'P0001';
    end if;
    delete from public.program_sessions where program_id = p_program_id and week_number = p_to;
  end if;

  for v_session in
    select id, label, position, title, weekday
    from public.program_sessions
    where program_id = p_program_id and week_number = p_from
    order by label
  loop
    insert into public.program_sessions (program_id, week_number, label, position, title, weekday)
    values (p_program_id, p_to, v_session.label, v_session.position, v_session.title, v_session.weekday)
    returning id into v_new_session;

    -- Comandos separados dentro de la misma transacción: RLS puede ver cada padre recién copiado.
    v_copy_groups:='{}'::jsonb;
    for v_copy_item in select * from public.session_exercises where program_session_id=v_session.id order by position,id loop
      v_copy_exercise:=gen_random_uuid();
      v_copy_group:=null;
      if v_copy_item.superset_id is not null then
        v_copy_group:=(v_copy_groups->>v_copy_item.superset_id::text)::uuid;
        if v_copy_group is null then
          v_copy_group:=gen_random_uuid();
          v_copy_groups:=v_copy_groups||jsonb_build_object(v_copy_item.superset_id::text,v_copy_group);
        end if;
      end if;
      insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,note,rest_seconds,superset_id,superset_rest_seconds,prescription_sets,typed_prescription)
      values(v_copy_exercise,v_new_session,v_copy_item.exercise_id,v_copy_item.position,v_copy_item.sets,v_copy_item.reps_min,v_copy_item.reps_max,
        v_copy_item.target_weight_kg,v_copy_item.note,v_copy_item.rest_seconds,v_copy_group,v_copy_item.superset_rest_seconds,v_copy_item.prescription_sets,v_copy_item.typed_prescription);
      insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,prescription_sets,typed_prescription)
      select v_copy_exercise,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,prescription_sets,typed_prescription
        from public.session_exercise_alternatives where session_exercise_id=v_copy_item.id;
    end loop;

    v_copied := v_copied + 1;
  end loop;

  return v_copied;
end;
$$;

create or replace function public.duplicate_routine_item(
  p_session_id uuid,
  p_copy_id uuid,
  p_exercise_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_copy_item record;
  v_copy_exercise uuid;
  v_copy_group uuid;
  v_copy_groups jsonb;
  v_session public.program_sessions%rowtype;
  v_program public.programs%rowtype;
  v_exercise public.session_exercises%rowtype;
  v_label text;
  v_position smallint;
begin
  if not public.is_coach() then
    raise exception 'Solo el coach puede duplicar' using errcode = '42501';
  end if;
  if p_copy_id is null or p_copy_id = p_session_id or p_copy_id = p_exercise_id then
    raise exception 'Identificador de copia inválido' using errcode = '22023';
  end if;
  select * into v_session from public.program_sessions where id = p_session_id;
  if not found then
    raise exception 'Sesión no encontrada' using errcode = 'P0002';
  end if;
  -- Serializa copias del mismo programa: capacidad, letra, posición y reintentos.
  select * into v_program from public.programs
    where id = v_session.program_id and coach_id = auth.uid() for update;
  if not found then
    raise exception 'Programa no encontrado' using errcode = 'P0002';
  end if;
  -- Una respuesta perdida se puede confirmar incluso después de cambiar la semana.
  if p_exercise_id is null then
    if exists (select 1 from public.program_sessions where id = p_copy_id
      and program_id = v_program.id and week_number = v_session.week_number) then
      return p_copy_id;
    end if;
  else
    select * into v_exercise from public.session_exercises
      where id = p_exercise_id and program_session_id = p_session_id;
    if not found then
      raise exception 'Ejercicio no encontrado' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.session_exercises where id = p_copy_id
      and program_session_id = p_session_id and exercise_id = v_exercise.exercise_id) then
      return p_copy_id;
    end if;
  end if;
  if v_program.student_id is not null and v_program.start_date is not null
    and (
      v_program.start_date + ((v_session.week_number - 1) * 7) <=
        (date_trunc('week', now() at time zone 'America/Santiago'))::date
      or v_program.start_date + ((v_session.week_number - 1) * 7) > v_program.ends_on
      or (now() at time zone 'America/Santiago')::date > v_program.ends_on
    ) then
    raise exception 'Semana bloqueada' using errcode = '55000';
  end if;
  if exists (select 1 from public.session_exercises se
    join public.exercises e on e.id = se.exercise_id
    where se.program_session_id = p_session_id and e.archived_at is not null
      and (p_exercise_id is null or se.id = p_exercise_id)) then
    raise exception 'Quita los ejercicios archivados antes de duplicar' using errcode = '22023';
  end if;
  if p_exercise_id is null then
    select candidate into v_label from unnest(array['A','B','C','D','E','F','G']) candidate
      where not exists (select 1 from public.program_sessions
        where program_id = v_program.id and week_number = v_session.week_number and label = candidate)
      order by candidate limit 1;
    if v_label is null then
      raise exception 'Máximo 7 sesiones por semana' using errcode = '23514';
    end if;
    select coalesce(max(position), -1) + 1 into v_position from public.program_sessions
      where program_id = v_program.id and week_number = v_session.week_number;
    insert into public.program_sessions (id, program_id, week_number, label, position, title, weekday)
      values (p_copy_id, v_program.id, v_session.week_number, v_label, v_position, v_session.title, v_session.weekday);
    -- Comandos separados dentro de la misma transacción: RLS puede ver cada padre recién copiado.
    v_copy_groups:='{}'::jsonb;
    for v_copy_item in select * from public.session_exercises where program_session_id=p_session_id order by position,id loop
      v_copy_exercise:=gen_random_uuid();
      v_copy_group:=null;
      if v_copy_item.superset_id is not null then
        v_copy_group:=(v_copy_groups->>v_copy_item.superset_id::text)::uuid;
        if v_copy_group is null then
          v_copy_group:=gen_random_uuid();
          v_copy_groups:=v_copy_groups||jsonb_build_object(v_copy_item.superset_id::text,v_copy_group);
        end if;
      end if;
      insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,note,rest_seconds,superset_id,superset_rest_seconds,prescription_sets,typed_prescription)
      values(v_copy_exercise,p_copy_id,v_copy_item.exercise_id,v_copy_item.position,v_copy_item.sets,v_copy_item.reps_min,v_copy_item.reps_max,
        v_copy_item.target_weight_kg,v_copy_item.note,v_copy_item.rest_seconds,v_copy_group,v_copy_item.superset_rest_seconds,v_copy_item.prescription_sets,v_copy_item.typed_prescription);
      insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,prescription_sets,typed_prescription)
      select v_copy_exercise,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,prescription_sets,typed_prescription
        from public.session_exercise_alternatives where session_exercise_id=v_copy_item.id;
    end loop;
  else
    if (select count(*) from public.session_exercises where program_session_id = p_session_id) >= 15 then
      raise exception 'Máximo 15 ejercicios por sesión' using errcode = '23514';
    end if;
    select coalesce(max(position), -1) + 1 into v_position from public.session_exercises
      where program_session_id = p_session_id;
    insert into public.session_exercises
      (id, program_session_id, exercise_id, position, sets, reps_min, reps_max, target_weight_kg, note, rest_seconds, prescription_sets, typed_prescription)
      values (p_copy_id, p_session_id, v_exercise.exercise_id, v_position, v_exercise.sets,
        v_exercise.reps_min, v_exercise.reps_max, v_exercise.target_weight_kg, v_exercise.note, v_exercise.rest_seconds, v_exercise.prescription_sets, v_exercise.typed_prescription);
    insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,prescription_sets,typed_prescription)
      select p_copy_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,prescription_sets,typed_prescription
      from public.session_exercise_alternatives where session_exercise_id=p_exercise_id;
  end if;
  return p_copy_id;
end;
$$;

create or replace function public.duplicate_program(p_source_id uuid,p_copy_id uuid,p_name text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  v_program public.programs%rowtype;
  v_receipt public.program_copy_receipts%rowtype;
  v_payload jsonb:=jsonb_build_object('source',p_source_id,'name',p_name);
  v_snapshot jsonb;
  v_session_json jsonb;
  v_item_json jsonb;
  v_alt_json jsonb;
  v_session public.program_sessions%rowtype;
  v_item public.session_exercises%rowtype;
  v_alt public.session_exercise_alternatives%rowtype;
  v_session_id uuid;
  v_item_id uuid;
  v_group_id uuid;
  v_groups jsonb;
begin
  if not public.is_coach() then raise exception 'Solo el coach puede duplicar' using errcode='42501'; end if;
  if p_copy_id is null or p_source_id is null or p_copy_id=p_source_id or p_name is null or length(btrim(p_name)) not between 1 and 100 then
    raise exception 'Copia inválida' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_copy_id::text,153));
  select * into v_receipt from public.program_copy_receipts where id=p_copy_id;
  if found then
    if v_receipt.payload <> v_payload then raise exception 'No reutilices la petición con otro contenido' using errcode='22023'; end if;
    return p_copy_id;
  end if;
  select * into v_program from public.programs where id=p_source_id and coach_id=auth.uid() for share;
  if not found then raise exception 'Programa no encontrado' using errcode='P0002'; end if;
  if exists (select 1 from public.session_exercises se join public.program_sessions ps on ps.id=se.program_session_id
    join public.exercises e on e.id=se.exercise_id where ps.program_id=p_source_id and e.archived_at is not null) then
    raise exception 'Revisa ejercicios archivados antes de duplicar' using errcode='22023'; end if;
  -- Una única lectura MVCC captura sesiones, prescripciones y alternativas antes de escribir.
  select coalesce(jsonb_agg(to_jsonb(ps)||jsonb_build_object('items',(
    select coalesce(jsonb_agg(to_jsonb(se)||jsonb_build_object('alternatives',(
      select coalesce(jsonb_agg(to_jsonb(a) order by a.position),'[]'::jsonb)
        from public.session_exercise_alternatives a where a.session_exercise_id=se.id
    )) order by se.position,se.id),'[]'::jsonb) from public.session_exercises se where se.program_session_id=ps.id
  )) order by ps.week_number,ps.position,ps.label),'[]'::jsonb) into v_snapshot
  from public.program_sessions ps where ps.program_id=p_source_id;
  insert into public.programs(id,coach_id,name,weeks_count) values(p_copy_id,auth.uid(),btrim(p_name),v_program.weeks_count);
  for v_session_json in select value from jsonb_array_elements(v_snapshot) loop
    v_session:=jsonb_populate_record(null::public.program_sessions,v_session_json);
    v_session_id:=gen_random_uuid(); v_groups:='{}'::jsonb;
    insert into public.program_sessions(id,program_id,week_number,label,position,title,weekday)
      values(v_session_id,p_copy_id,v_session.week_number,v_session.label,v_session.position,v_session.title,v_session.weekday);
    for v_item_json in select value from jsonb_array_elements(v_session_json->'items') loop
      v_item:=jsonb_populate_record(null::public.session_exercises,v_item_json);
      v_item_id:=gen_random_uuid();v_group_id:=null;
      if v_item.superset_id is not null then
        v_group_id:=(v_groups->>v_item.superset_id::text)::uuid;
        if v_group_id is null then
          v_group_id:=gen_random_uuid();v_groups:=v_groups||jsonb_build_object(v_item.superset_id::text,v_group_id);
        end if;
      end if;
      insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,note,rest_seconds,superset_id,superset_rest_seconds,prescription_sets,typed_prescription)
        values(v_item_id,v_session_id,v_item.exercise_id,v_item.position,v_item.sets,v_item.reps_min,v_item.reps_max,v_item.target_weight_kg,v_item.note,v_item.rest_seconds,v_group_id,v_item.superset_rest_seconds,v_item.prescription_sets,v_item.typed_prescription);
      for v_alt_json in select value from jsonb_array_elements(v_item_json->'alternatives') loop
        v_alt:=jsonb_populate_record(null::public.session_exercise_alternatives,v_alt_json);
        insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,prescription_sets,typed_prescription)
          values(v_item_id,v_alt.exercise_id,v_alt.position,v_alt.sets,v_alt.reps_min,v_alt.reps_max,v_alt.target_weight_kg,v_alt.prescription_sets,v_alt.typed_prescription);
      end loop;
    end loop;
  end loop;
  insert into public.program_copy_receipts(id,coach_id,payload) values(p_copy_id,auth.uid(),v_payload);
  return p_copy_id;
end;
$$;

-- Original payloads replay first. A new old-format intent cannot erase canonical
-- targets; metadata-only patches and safe ordering retain their old behavior.
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

-- Assigned typed closures retain their complete source; older receipts and
-- structures keep their prior identity and comparison, with no history rewrite.
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
 -- Version 2 compares the complete canonical target, including time/distance and
 -- per-set targets. Legacy version 1 retains its original comparison below.
 if new.structure->'version'='2'::jsonb then
  with rows as (
   select se.*,row_number() over(order by se.position,se.id)-1 as ordinal
   from public.session_exercises se where se.program_session_id=new.program_session_id
  ), choices as (
   select se.*,requested_structure->'exercises'->se.ordinal::int as requested,
    a.exercise_id as alternative_id,to_jsonb(a) as alternative
   from rows se left join public.session_exercise_alternatives a on a.session_exercise_id=se.id
    and a.exercise_id=(requested_structure->'exercises'->se.ordinal::int->>'exerciseId')::uuid
  )
  select jsonb_build_object('version',2,'exercises',coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'exerciseId',case when (c.requested->>'exerciseId')::uuid=c.exercise_id then c.exercise_id else c.alternative_id end,
   'prescribedExerciseId',c.exercise_id,
   'prescribed',public.routine_training_prescription(case when (c.requested->>'exerciseId')::uuid=c.exercise_id
     then to_jsonb(c) else c.alternative end),
   'note',c.note,'restSeconds',c.rest_seconds,'supersetId',c.superset_id,'supersetRestSeconds',c.superset_rest_seconds
  ) order by c.ordinal),'[]'::jsonb)) into canonical from choices c;
  if canonical is distinct from requested_structure then
   raise exception 'La rutina prescrita cambió; conserva el registro para revisarlo' using errcode='40001';
  end if;
  return new;
 end if;
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
