-- Corrige workouts_guard: las acciones ON DELETE SET NULL de las claves foráneas (al borrar un
-- programa o una sesión planificada) actualizan program_id y program_session_id por separado.
-- La coherencia programa/sesión se exige al INSERTAR o al cambiar a valores no nulos; poner
-- program_id en nulo por una FK no debe bloquear el borrado del programa.

create or replace function public.workouts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.started_at > now() + interval '5 minutes' then
    raise exception 'started_at no puede estar en el futuro' using errcode = '23514';
  end if;

  if new.program_session_id is not null and new.program_id is not null then
    if not exists (
      select 1
      from public.program_sessions ps
      join public.programs p on p.id = ps.program_id
      where ps.id = new.program_session_id
        and p.id = new.program_id
        and p.student_id = new.student_id
    ) then
      raise exception 'program_session_id no pertenece al programa del alumno' using errcode = '23514';
    end if;
  elsif new.program_session_id is not null and new.program_id is null and tg_op = 'INSERT' then
    raise exception 'program_session_id requiere program_id' using errcode = '23514';
  end if;

  return new;
end;
$$;
