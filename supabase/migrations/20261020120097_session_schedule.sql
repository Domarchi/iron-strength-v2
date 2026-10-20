-- T155: día prescrito y elección personal dentro de la semana vigente.
alter table public.program_sessions add column weekday smallint check(weekday between 0 and 6);
create function public.guard_session_weekday() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_user not in ('postgres','supabase_admin','service_role') then
    if tg_op='UPDATE' then
      if old.weekday is distinct from new.weekday and not public.can_edit_routine_session(old.id) then
        raise exception 'Semana bloqueada' using errcode='55000'; end if;
    elsif new.weekday is not null and not exists(select 1 from public.programs p where p.id=new.program_id and public.is_coach() and p.coach_id=auth.uid() and
      (p.student_id is null or (p.start_date+(new.week_number-1)*7 > date_trunc('week',now() at time zone 'America/Santiago')::date
        and p.start_date+(new.week_number-1)*7 <= p.ends_on and (now() at time zone 'America/Santiago')::date <= p.ends_on))) then
      raise exception 'Semana bloqueada' using errcode='55000';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_session_weekday before insert or update of weekday on public.program_sessions for each row execute function public.guard_session_weekday();
create table public.session_day_overrides(
  session_id uuid primary key references public.program_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check(weekday between 0 and 6)
);
create index session_day_overrides_student_idx on public.session_day_overrides(student_id);
alter table public.session_day_overrides enable row level security;
revoke all on public.session_day_overrides from anon,authenticated;
grant select,insert,update,delete on public.session_day_overrides to authenticated;
create policy session_days_read on public.session_day_overrides for select to authenticated
 using(public.is_active_member() and exists(select 1 from public.program_sessions s join public.programs p on p.id=s.program_id where s.id=session_id and p.student_id=session_day_overrides.student_id));
create policy session_days_insert on public.session_day_overrides for insert to authenticated
 with check(public.is_active_member() and student_id=auth.uid() and exists(select 1 from public.program_sessions s join public.programs p on p.id=s.program_id
 where s.id=session_id and p.student_id=auth.uid() and (now() at time zone 'America/Santiago')::date between p.start_date and p.ends_on
 and p.start_date+(s.week_number-1)*7=date_trunc('week',now() at time zone 'America/Santiago')::date));
create policy session_days_update on public.session_day_overrides for update to authenticated
 using(public.is_active_member() and student_id=auth.uid())
 with check(public.is_active_member() and student_id=auth.uid() and exists(select 1 from public.program_sessions s join public.programs p on p.id=s.program_id
 where s.id=session_id and p.student_id=auth.uid() and (now() at time zone 'America/Santiago')::date between p.start_date and p.ends_on
 and p.start_date+(s.week_number-1)*7=date_trunc('week',now() at time zone 'America/Santiago')::date));
create policy session_days_delete on public.session_day_overrides for delete to authenticated
 using(public.is_active_member() and student_id=auth.uid() and exists(select 1 from public.program_sessions s join public.programs p on p.id=s.program_id
 where s.id=session_id and p.student_id=auth.uid() and (now() at time zone 'America/Santiago')::date between p.start_date and p.ends_on
 and p.start_date+(s.week_number-1)*7=date_trunc('week',now() at time zone 'America/Santiago')::date));

drop function public.mutate_routine_session(uuid,integer,uuid,jsonb,uuid[],text);
create function public.mutate_routine_session(
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
        if jsonb_typeof(v_row->'fields') <> 'array' or jsonb_array_length(v_row->'fields') not between 1 and 7 then
          raise exception 'Campos inválidos' using errcode='22023'; end if;
        if exists (select 1 from jsonb_array_elements_text(v_row->'fields') f(value) where
          f.value not in ('sets','repsMin','repsMax','targetWeightKg','note','restSeconds','supersetRestSeconds') or not (v_row ? f.value))
          or (select count(distinct value) from jsonb_array_elements_text(v_row->'fields')) <> jsonb_array_length(v_row->'fields') then
          raise exception 'Campos inválidos' using errcode='22023'; end if;
      end if;
      update public.session_exercises set
        sets=case when (not (v_row ? 'fields') or (v_row->'fields') ? 'sets') then (v_row->>'sets')::smallint else sets end,
        reps_min=case when (not (v_row ? 'fields') or (v_row->'fields') ? 'repsMin') then (v_row->>'repsMin')::smallint else reps_min end,
        reps_max=case when (not (v_row ? 'fields') or (v_row->'fields') ? 'repsMax') then (v_row->>'repsMax')::smallint else reps_max end,
        target_weight_kg=case when (not (v_row ? 'fields') or (v_row->'fields') ? 'targetWeightKg') then (v_row->>'targetWeightKg')::numeric else target_weight_kg end,
        note=case when (not (v_row ? 'fields') or (v_row->'fields') ? 'note') then (v_row->>'note') else note end,
        rest_seconds=case when v_row ? 'restSeconds' and (not (v_row ? 'fields') or (v_row->'fields') ? 'restSeconds') then (v_row->>'restSeconds')::smallint else rest_seconds end,
        superset_rest_seconds=case when v_row ? 'supersetRestSeconds' and (not (v_row ? 'fields') or (v_row->'fields') ? 'supersetRestSeconds') then (v_row->>'supersetRestSeconds')::smallint else superset_rest_seconds end
        where id=(v_row->>'id')::uuid and program_session_id=p_session_id
          and exercise_id=(v_row->>'exerciseId')::uuid;
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
revoke all on function public.mutate_routine_session(uuid,integer,uuid,jsonb,uuid[],text,integer) from public,anon;
grant execute on function public.mutate_routine_session(uuid,integer,uuid,jsonb,uuid[],text,integer) to authenticated;


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
      insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,note,rest_seconds,superset_id,superset_rest_seconds)
      values(v_copy_exercise,v_new_session,v_copy_item.exercise_id,v_copy_item.position,v_copy_item.sets,v_copy_item.reps_min,v_copy_item.reps_max,
        v_copy_item.target_weight_kg,v_copy_item.note,v_copy_item.rest_seconds,v_copy_group,v_copy_item.superset_rest_seconds);
      insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg)
      select v_copy_exercise,exercise_id,position,sets,reps_min,reps_max,target_weight_kg
        from public.session_exercise_alternatives where session_exercise_id=v_copy_item.id;
    end loop;
  end loop;

  return v_new_program;
end;
$$;

revoke all on function public.assign_program(uuid, uuid, date) from public, anon;
grant execute on function public.assign_program(uuid, uuid, date) to authenticated;

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
      insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,note,rest_seconds,superset_id,superset_rest_seconds)
      values(v_copy_exercise,v_new_session,v_copy_item.exercise_id,v_copy_item.position,v_copy_item.sets,v_copy_item.reps_min,v_copy_item.reps_max,
        v_copy_item.target_weight_kg,v_copy_item.note,v_copy_item.rest_seconds,v_copy_group,v_copy_item.superset_rest_seconds);
      insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg)
      select v_copy_exercise,exercise_id,position,sets,reps_min,reps_max,target_weight_kg
        from public.session_exercise_alternatives where session_exercise_id=v_copy_item.id;
    end loop;

    v_copied := v_copied + 1;
  end loop;

  return v_copied;
end;
$$;

revoke all on function public.copy_program_week(uuid, smallint, smallint, boolean) from public, anon;
grant execute on function public.copy_program_week(uuid, smallint, smallint, boolean) to authenticated;

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
      insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,note,rest_seconds,superset_id,superset_rest_seconds)
      values(v_copy_exercise,p_copy_id,v_copy_item.exercise_id,v_copy_item.position,v_copy_item.sets,v_copy_item.reps_min,v_copy_item.reps_max,
        v_copy_item.target_weight_kg,v_copy_item.note,v_copy_item.rest_seconds,v_copy_group,v_copy_item.superset_rest_seconds);
      insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg)
      select v_copy_exercise,exercise_id,position,sets,reps_min,reps_max,target_weight_kg
        from public.session_exercise_alternatives where session_exercise_id=v_copy_item.id;
    end loop;
  else
    if (select count(*) from public.session_exercises where program_session_id = p_session_id) >= 15 then
      raise exception 'Máximo 15 ejercicios por sesión' using errcode = '23514';
    end if;
    select coalesce(max(position), -1) + 1 into v_position from public.session_exercises
      where program_session_id = p_session_id;
    insert into public.session_exercises
      (id, program_session_id, exercise_id, position, sets, reps_min, reps_max, target_weight_kg, note, rest_seconds)
      values (p_copy_id, p_session_id, v_exercise.exercise_id, v_position, v_exercise.sets,
        v_exercise.reps_min, v_exercise.reps_max, v_exercise.target_weight_kg, v_exercise.note, v_exercise.rest_seconds);
    insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg)
      select p_copy_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg
      from public.session_exercise_alternatives where session_exercise_id=p_exercise_id;
  end if;
  return p_copy_id;
end;
$$;
revoke all on function public.duplicate_routine_item(uuid, uuid, uuid) from public, anon;
grant execute on function public.duplicate_routine_item(uuid, uuid, uuid) to authenticated;

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
      insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,note,rest_seconds,superset_id,superset_rest_seconds)
        values(v_item_id,v_session_id,v_item.exercise_id,v_item.position,v_item.sets,v_item.reps_min,v_item.reps_max,v_item.target_weight_kg,v_item.note,v_item.rest_seconds,v_group_id,v_item.superset_rest_seconds);
      for v_alt_json in select value from jsonb_array_elements(v_item_json->'alternatives') loop
        v_alt:=jsonb_populate_record(null::public.session_exercise_alternatives,v_alt_json);
        insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg)
          values(v_item_id,v_alt.exercise_id,v_alt.position,v_alt.sets,v_alt.reps_min,v_alt.reps_max,v_alt.target_weight_kg);
      end loop;
    end loop;
  end loop;
  insert into public.program_copy_receipts(id,coach_id,payload) values(p_copy_id,auth.uid(),v_payload);
  return p_copy_id;
end;
$$;
revoke all on function public.duplicate_program(uuid,uuid,text) from public,anon;
grant execute on function public.duplicate_program(uuid,uuid,text) to authenticated;
