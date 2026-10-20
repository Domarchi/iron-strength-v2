-- T141 · Copias completas con RLS e identificador estable para reintentos.
create function public.duplicate_routine_item(
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
    insert into public.session_exercises
      (program_session_id, exercise_id, position, sets, reps_min, reps_max, target_weight_kg, note)
      select p_copy_id, exercise_id, position, sets, reps_min, reps_max, target_weight_kg, note
      from public.session_exercises where program_session_id = p_session_id order by position, id;
  else
    if (select count(*) from public.session_exercises where program_session_id = p_session_id) >= 15 then
      raise exception 'Máximo 15 ejercicios por sesión' using errcode = '23514';
    end if;
    select coalesce(max(position), -1) + 1 into v_position from public.session_exercises
      where program_session_id = p_session_id;
    insert into public.session_exercises
      (id, program_session_id, exercise_id, position, sets, reps_min, reps_max, target_weight_kg, note)
      values (p_copy_id, p_session_id, v_exercise.exercise_id, v_position, v_exercise.sets,
        v_exercise.reps_min, v_exercise.reps_max, v_exercise.target_weight_kg, v_exercise.note);
  end if;
  return p_copy_id;
end;
$$;
revoke all on function public.duplicate_routine_item(uuid, uuid, uuid) from public, anon;
grant execute on function public.duplicate_routine_item(uuid, uuid, uuid) to authenticated;
