-- T152: identidad prescrita y realizada; la autorización también se aplica a INSERT directo.
alter table public.workout_sets
  add column session_exercise_id uuid references public.session_exercises(id) on delete set null,
  add column prescribed_exercise_id uuid references public.exercises(id) on delete restrict,
  add column prescribed_exercise_name text;

create function public.guard_workout_exercise_identity() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_session uuid;
  v_source record;
  v_name text;
begin
  if TG_OP = 'UPDATE' then
    if (new.workout_id, new.student_id, new.exercise_id, new.exercise_name, new.position,
        new.prescribed_exercise_id, new.prescribed_exercise_name)
       is distinct from
       (old.workout_id, old.student_id, old.exercise_id, old.exercise_name, old.position,
        old.prescribed_exercise_id, old.prescribed_exercise_name)
       or (new.session_exercise_id is distinct from old.session_exercise_id and
           not (new.session_exercise_id is null and not exists
             (select 1 from public.session_exercises where id = old.session_exercise_id))) then
      raise exception 'La identidad de una serie guardada no se puede cambiar' using errcode = 'P0001';
    end if;
    return new;
  end if;

  select program_session_id into v_session from public.workouts where id = new.workout_id;
  -- Entrenamientos históricos/libres sin rutina siguen admitidos, sin procedencia inventada.
  if v_session is null then
    if new.session_exercise_id is not null or new.prescribed_exercise_id is not null
      or new.prescribed_exercise_name is not null then
      raise exception 'La sustitución requiere una rutina vigente' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- Serializa inserciones concurrentes del mismo entrenamiento sin exigir permiso de edición
  -- sobre entrenamientos antiguos que se sincronizan por primera vez.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.workout_id::text, 152));
  select * into v_source from (
    select se.id, se.exercise_id, e.name,
      row_number() over (order by se.position, se.id) - 1 as ordinal
    from public.session_exercises se join public.exercises e on e.id = se.exercise_id
    where se.program_session_id = v_session
  ) source where ordinal = new.position;
  if not found or (new.session_exercise_id is not null and new.session_exercise_id <> v_source.id)
    or (new.prescribed_exercise_id is not null and new.prescribed_exercise_id <> v_source.exercise_id)
    or (new.exercise_id <> v_source.exercise_id and not exists (
      select 1 from public.session_exercise_alternatives a
      where a.session_exercise_id = v_source.id and a.exercise_id = new.exercise_id
    )) then
    raise exception 'Ejercicio o alternativa no autorizado en esta posición' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.workout_sets s where s.workout_id = new.workout_id
    and s.position = new.position and s.exercise_id <> new.exercise_id) then
    raise exception 'No se pueden mezclar ejercicios en una posición' using errcode = 'P0001';
  end if;
  select name into v_name from public.exercises where id = new.exercise_id;
  new.exercise_name := v_name;
  new.session_exercise_id := v_source.id;
  new.prescribed_exercise_id := v_source.exercise_id;
  new.prescribed_exercise_name := v_source.name;
  return new;
end;
$$;
revoke all on function public.guard_workout_exercise_identity() from public, anon, authenticated;
create trigger workout_exercise_identity before insert or update on public.workout_sets
  for each row execute function public.guard_workout_exercise_identity();

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

  begin
    insert into public.workouts
      (id, student_id, program_id, program_session_id, session_label, started_at, finished_at, duration_seconds)
    values (
      v_id,
      v_student,
      (p_workout ->> 'programId')::uuid,
      (p_workout ->> 'programSessionId')::uuid,
      p_workout ->> 'sessionLabel',
      (p_workout ->> 'startedAt')::timestamptz,
      (p_workout ->> 'finishedAt')::timestamptz,
      (p_workout ->> 'durationSeconds')::integer
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

-- La procedencia no puede quitarse para convertir una sesión planificada en una libre.
-- Las cascadas al borrar la rutina sí limpian las referencias sin perder el historial.
create function public.guard_workout_origin() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if (new.program_session_id is distinct from old.program_session_id and not (
    new.program_session_id is null and not exists (
      select 1 from public.program_sessions where id = old.program_session_id)))
    or (new.program_id is distinct from old.program_id and not (
      new.program_id is null and not exists (
        select 1 from public.programs where id = old.program_id))) then
    raise exception 'No se puede cambiar la rutina de un entrenamiento guardado' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_workout_origin() from public, anon, authenticated;
create trigger workout_origin before update on public.workouts
  for each row execute function public.guard_workout_origin();
