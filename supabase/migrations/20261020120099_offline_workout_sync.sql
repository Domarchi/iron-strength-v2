-- T161: confirmación idempotente anterior a validar la rutina y semana protegida también en SQL.
create or replace function public.save_workout(p_workout jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (p_workout ->> 'id')::uuid;
  v_student uuid := auth.uid();
  v_sets jsonb := coalesce(p_workout -> 'sets', '[]'::jsonb);
  v_owner uuid;
  v_session record;
  v_started date;
  v_week integer;
begin
  if v_student is null then
    raise exception 'Se requiere una sesión iniciada' using errcode = '42501';
  end if;

  if jsonb_typeof(v_sets) <> 'array' or jsonb_array_length(v_sets) = 0 then
    raise exception 'El entrenamiento no tiene series completadas' using errcode = '22023';
  end if;

  -- Reenvío del mismo entrenamiento (reintento tras un corte de red): no se duplica.
  select student_id into v_owner from public.workouts where id = v_id;
  if found then
    if v_owner = v_student then
      return jsonb_build_object('status', 'duplicate');
    end if;
    raise exception 'Ese entrenamiento pertenece a otro usuario' using errcode = '42501';
  end if;

  -- Validar la rutina bajo los permisos del alumno y dentro de la transacción de guardado.
  select p.start_date,p.ends_on,p.weeks_count,ps.week_number into v_session
  from public.program_sessions ps join public.programs p on p.id=ps.program_id
  where ps.id=(p_workout->>'programSessionId')::uuid
    and ps.program_id=(p_workout->>'programId')::uuid and p.student_id=v_student;
  if not found or v_session.start_date is null or v_session.ends_on is null then
    raise exception 'La sesión ya no está disponible' using errcode='P0002',detail='not_found';
  end if;
  v_started := ((p_workout->>'startedAt')::timestamptz at time zone 'America/Santiago')::date;
  v_week := (v_started-v_session.start_date)/7+1;
  if v_started is null or v_started<v_session.start_date or v_started>v_session.ends_on
    or v_week<>v_session.week_number or v_week>v_session.weeks_count then
    raise exception 'La fecha de inicio no corresponde a la semana de la sesión' using errcode='P0002',detail='wrong_week';
  end if;

  begin
    insert into public.workouts
      (id, student_id, program_id, program_session_id, session_label, started_at, finished_at, duration_seconds, perceived_effort, note)
    values (
      v_id,
      v_student,
      (p_workout ->> 'programId')::uuid,
      (p_workout ->> 'programSessionId')::uuid,
      p_workout ->> 'sessionLabel',
      (p_workout ->> 'startedAt')::timestamptz,
      (p_workout ->> 'finishedAt')::timestamptz,
      (p_workout ->> 'durationSeconds')::integer,
      (p_workout ->> 'perceivedEffort')::smallint,
      nullif(btrim(p_workout ->> 'note'),'')
    );

    insert into public.workout_sets
      (workout_id, student_id, exercise_id, exercise_name, position, set_number, weight_kg, reps, is_warmup, session_exercise_id, prescribed_exercise_id)
    select
      v_id,
      v_student,
      (s ->> 'exerciseId')::uuid,
      s ->> 'exerciseName',
      (s ->> 'position')::smallint,
      (s ->> 'setNumber')::smallint,
      (s ->> 'weightKg')::numeric,
      (s ->> 'reps')::smallint,
      coalesce((s ->> 'isWarmup')::boolean, false),
      (s ->> 'sessionExerciseId')::uuid,
      (s ->> 'prescribedExerciseId')::uuid
    from jsonb_array_elements(v_sets) as s;
  exception
    when unique_violation then
      -- Otra petición con el mismo id ganó la carrera: si es nuestra, es un duplicado; si no, conflicto.
      select student_id into v_owner from public.workouts where id = v_id;
      if found and v_owner = v_student then
        return jsonb_build_object('status', 'duplicate');
      end if;
      raise exception 'Ese identificador ya está en uso' using errcode = '23505';
  end;

  return jsonb_build_object('status', 'created');
end;
$$;

revoke all on function public.save_workout(jsonb) from public, anon;
grant execute on function public.save_workout(jsonb) to authenticated;

