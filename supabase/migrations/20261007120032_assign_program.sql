-- T32 · assign_program (RF-16, RF-18, RF-49, DC-10).
-- Asigna una plantilla a un alumno (o al propio coach) creando una copia profunda e independiente.
-- Todo ocurre en una sola transacción: si algo falla no queda nada a medias.
--
-- Reglas:
--  * La fecha de inicio se ajusta al lunes de su semana y no puede ser anterior al lunes actual.
--  * Un programa del alumno que se solapa y empieza antes se recorta (termina el domingo previo).
--  * Uno que empieza en la misma fecha o después se reemplaza, salvo que ya tenga entrenamientos.

create function public.assign_program(p_template_id uuid, p_student_id uuid, p_start_date date)
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
  where id = p_template_id and coach_id = auth.uid() and student_id is null;

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

    insert into public.session_exercises
      (program_session_id, exercise_id, position, sets, reps_min, reps_max, target_weight_kg, note)
    select v_new_session, exercise_id, position, sets, reps_min, reps_max, target_weight_kg, note
    from public.session_exercises
    where program_session_id = v_session.id;
  end loop;

  return v_new_program;
end;
$$;

revoke all on function public.assign_program(uuid, uuid, date) from public, anon;
grant execute on function public.assign_program(uuid, uuid, date) to authenticated;
