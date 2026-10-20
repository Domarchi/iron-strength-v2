-- T148 · Las copias conservan descansos y regeneran la identidad de cada grupo por sesión.

create or replace function public.assign_program(p_template_id uuid, p_student_id uuid, p_start_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
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

    with group_ids as materialized (
      select original_id, gen_random_uuid() as copy_id
      from (select distinct superset_id as original_id from public.session_exercises
        where program_session_id = v_session.id and superset_id is not null) originals
    )
    insert into public.session_exercises
      (program_session_id, exercise_id, position, sets, reps_min, reps_max, target_weight_kg, note,
       rest_seconds, superset_id, superset_rest_seconds)
    select v_new_session, e.exercise_id, e.position, e.sets, e.reps_min, e.reps_max,
      e.target_weight_kg, e.note, e.rest_seconds, g.copy_id, e.superset_rest_seconds
    from public.session_exercises e left join group_ids g on g.original_id = e.superset_id
    where e.program_session_id = v_session.id order by e.position, e.id;
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

    with group_ids as materialized (
      select original_id, gen_random_uuid() as copy_id
      from (select distinct superset_id as original_id from public.session_exercises
        where program_session_id = v_session.id and superset_id is not null) originals
    )
    insert into public.session_exercises
      (program_session_id, exercise_id, position, sets, reps_min, reps_max, target_weight_kg, note,
       rest_seconds, superset_id, superset_rest_seconds)
    select v_new_session, e.exercise_id, e.position, e.sets, e.reps_min, e.reps_max,
      e.target_weight_kg, e.note, e.rest_seconds, g.copy_id, e.superset_rest_seconds
    from public.session_exercises e left join group_ids g on g.original_id = e.superset_id
    where e.program_session_id = v_session.id order by e.position, e.id;

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
    with group_ids as materialized (
      select original_id, gen_random_uuid() as copy_id
      from (select distinct superset_id as original_id from public.session_exercises
        where program_session_id = p_session_id and superset_id is not null) originals
    )
    insert into public.session_exercises
      (program_session_id, exercise_id, position, sets, reps_min, reps_max, target_weight_kg, note,
       rest_seconds, superset_id, superset_rest_seconds)
    select p_copy_id, e.exercise_id, e.position, e.sets, e.reps_min, e.reps_max,
      e.target_weight_kg, e.note, e.rest_seconds, g.copy_id, e.superset_rest_seconds
    from public.session_exercises e left join group_ids g on g.original_id = e.superset_id
    where e.program_session_id = p_session_id order by e.position, e.id;
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
  end if;
  return p_copy_id;
end;
$$;
revoke all on function public.duplicate_routine_item(uuid, uuid, uuid) from public, anon;
grant execute on function public.duplicate_routine_item(uuid, uuid, uuid) to authenticated;
