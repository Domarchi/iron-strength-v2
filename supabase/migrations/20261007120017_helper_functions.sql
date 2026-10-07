-- T17 · Funciones auxiliares de autorización. Base de todas las políticas RLS (RF-44).
-- security definer + search_path vacío: no heredan RLS de profiles y no se pueden suplantar.

create function public.current_coach_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.coach_id from public.profiles p where p.id = auth.uid() and p.is_active
$$;

-- ¿Quien llama es un usuario activo?
create function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
$$;

-- ¿Quien llama es el coach (activo)?
create function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'coach' and p.is_active
  )
$$;

-- ¿Quien llama es el coach (activo) del alumno dado? El coach es su propio coach (RF-49).
create function public.is_coach_of(student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles me
    join public.profiles s on s.coach_id = me.id
    where me.id = auth.uid() and me.role = 'coach' and me.is_active and s.id = student
  )
$$;

revoke all on function public.current_coach_id(), public.is_active_member(),
  public.is_coach(), public.is_coach_of(uuid) from public, anon;
grant execute on function public.current_coach_id(), public.is_active_member(),
  public.is_coach(), public.is_coach_of(uuid) to authenticated;

-- Defensa en profundidad: el rol anónimo no toca ninguna tabla ni función por defecto.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon;
