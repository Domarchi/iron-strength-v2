-- T151 · Hasta tres alternativas prescritas por ejercicio, privadas y versionadas.
create table public.session_exercise_alternatives (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position smallint not null check(position between 0 and 2),
  sets smallint not null check(sets between 1 and 10),
  reps_min smallint not null check(reps_min between 1 and 100),
  reps_max smallint not null check(reps_max between 1 and 100 and reps_max>=reps_min),
  target_weight_kg numeric(6,2) check(target_weight_kg is null or target_weight_kg between 0 and 500),
  unique(session_exercise_id,position), unique(session_exercise_id,exercise_id)
);
alter table public.session_exercise_alternatives enable row level security;
revoke all on public.session_exercise_alternatives from anon,authenticated;
grant select,insert,update,delete on public.session_exercise_alternatives to authenticated;

create function public.can_edit_routine_session(p_session_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.program_sessions s join public.programs p on p.id=s.program_id
    where s.id=p_session_id and public.is_coach() and p.coach_id=auth.uid() and (
      p.student_id is null or (
        p.start_date + ((s.week_number-1)*7) > date_trunc('week',now() at time zone 'America/Santiago')::date
        and p.start_date + ((s.week_number-1)*7) <= p.ends_on
        and (now() at time zone 'America/Santiago')::date <= p.ends_on
      )
    ));
$$;
revoke all on function public.can_edit_routine_session(uuid) from public,anon;
grant execute on function public.can_edit_routine_session(uuid) to authenticated;
create policy alternatives_select on public.session_exercise_alternatives for select to authenticated
 using(exists(select 1 from public.session_exercises e where e.id=session_exercise_id));
create policy alternatives_write on public.session_exercise_alternatives for all to authenticated
 using(exists(select 1 from public.session_exercises e where e.id=session_exercise_id and public.can_edit_routine_session(e.program_session_id)))
 with check(exists(select 1 from public.session_exercises e where e.id=session_exercise_id and public.can_edit_routine_session(e.program_session_id)));

create function public.validate_routine_alternative() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.session_exercises e where e.id=new.session_exercise_id and e.exercise_id=new.exercise_id)
    or not exists(select 1 from public.exercises x join public.session_exercises e on e.id=new.session_exercise_id
      join public.program_sessions s on s.id=e.program_session_id join public.programs p on p.id=s.program_id
      where x.id=new.exercise_id and x.archived_at is null and (x.coach_id is null or x.coach_id=p.coach_id)) then
    raise exception 'Alternativa no disponible o igual al ejercicio original' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger validate_routine_alternative before insert or update on public.session_exercise_alternatives
 for each row execute function public.validate_routine_alternative();
create function public.prevent_self_alternative() returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.session_exercise_alternatives a where a.session_exercise_id=new.id and a.exercise_id=new.exercise_id) then
    raise exception 'El ejercicio original no puede ser su propia alternativa' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger prevent_self_alternative before update of exercise_id on public.session_exercises
 for each row execute function public.prevent_self_alternative();
-- Privilegios limitados a invalidar la revisión del padre; también permite cascadas de Auth.
create function public.touch_alternative_session() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op<>'INSERT' then
    update public.program_sessions set revision=revision+1 where id=(select program_session_id from public.session_exercises where id=old.session_exercise_id);
  end if;
  if tg_op='INSERT' or (tg_op='UPDATE' and old.session_exercise_id<>new.session_exercise_id) then
    update public.program_sessions set revision=revision+1 where id=(select program_session_id from public.session_exercises where id=new.session_exercise_id);
  end if;
  return null;
end;
$$;
revoke all on function public.touch_alternative_session() from public,anon,authenticated;
create trigger touch_alternative_session after insert or update or delete on public.session_exercise_alternatives
 for each row execute function public.touch_alternative_session();

-- Las alternativas archivadas ya asignadas siguen siendo legibles; no se admiten nuevas copias.
drop policy exercises_select on public.exercises;
create policy exercises_select on public.exercises for select to authenticated using(
 public.is_active_member() and (
  (archived_at is null and (coach_id is null or coach_id=public.current_coach_id()))
  or (public.is_coach() and coach_id=auth.uid())
  or exists(select 1 from public.session_exercises e where e.exercise_id=exercises.id)
  or exists(select 1 from public.session_exercise_alternatives a where a.exercise_id=exercises.id)
 ));

create function public.configure_session_alternatives(
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
 delete from public.session_exercise_alternatives where session_exercise_id=p_exercise_row_id;
 insert into public.session_exercise_alternatives(session_exercise_id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg)
 select p_exercise_row_id,(r.value->>'exerciseId')::uuid,r.ordinal-1,(r.value->>'sets')::smallint,
  (r.value->>'repsMin')::smallint,(r.value->>'repsMax')::smallint,(r.value->>'targetWeightKg')::numeric
 from jsonb_array_elements(p_alternatives) with ordinality r(value,ordinal);
 select revision into v_revision from public.program_sessions where id=p_session_id;
 insert into public.routine_mutations(id,session_id,coach_id,payload,revision) values(p_request_id,p_session_id,auth.uid(),v_payload,v_revision);
 return v_revision;
end;
$$;
revoke all on function public.configure_session_alternatives(uuid,uuid,integer,uuid,jsonb) from public,anon;
grant execute on function public.configure_session_alternatives(uuid,uuid,integer,uuid,jsonb) to authenticated;

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
    select id, week_number, label, position
    from public.program_sessions
    where program_id = v_template.id
    order by week_number, label
  loop
    insert into public.program_sessions (program_id, week_number, label, position)
    values (v_new_program, v_session.week_number, v_session.label, v_session.position)
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
    select id, label, position
    from public.program_sessions
    where program_id = p_program_id and week_number = p_from
    order by label
  loop
    insert into public.program_sessions (program_id, week_number, label, position)
    values (p_program_id, p_to, v_session.label, v_session.position)
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
    insert into public.program_sessions (id, program_id, week_number, label, position)
      values (p_copy_id, v_program.id, v_session.week_number, v_label, v_position);
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
