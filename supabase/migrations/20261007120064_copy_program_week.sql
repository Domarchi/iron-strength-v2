-- T64 · Copiar una semana de un programa a otra (RF-15). security INVOKER: se ejecuta con los
-- permisos del que llama, así que la RLS decide si puede ver y escribir ese programa.
-- Es una sola transacción: si algo falla, la semana destino queda como estaba.

create function public.copy_program_week(
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
  select weeks_count into v_weeks from public.programs where id = p_program_id;
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

    insert into public.session_exercises
      (program_session_id, exercise_id, position, sets, reps_min, reps_max, target_weight_kg, note)
    select v_new_session, exercise_id, position, sets, reps_min, reps_max, target_weight_kg, note
    from public.session_exercises
    where program_session_id = v_session.id;

    v_copied := v_copied + 1;
  end loop;

  return v_copied;
end;
$$;

revoke all on function public.copy_program_week(uuid, smallint, smallint, boolean) from public, anon;
grant execute on function public.copy_program_week(uuid, smallint, smallint, boolean) to authenticated;
