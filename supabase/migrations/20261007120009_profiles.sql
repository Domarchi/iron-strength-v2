-- T9 · Perfiles, roles y protección de campos sensibles (RF-4, RF-8, RF-44, DC-5).
-- Un solo coach; el coach es su propio alumno (coach_id = id) para poder entrenar (RF-49).

create extension if not exists btree_gist with schema extensions;

create type public.user_role as enum ('coach', 'student');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 100),
  coach_id uuid not null references public.profiles (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint coach_is_own_coach check (role <> 'coach' or coach_id = id)
);

create unique index profiles_single_coach on public.profiles (role) where role = 'coach';
create index profiles_coach_id_idx on public.profiles (coach_id);

alter table public.profiles enable row level security;

-- Quien cambia role, coach_id o is_active: solo el coach (is_active) o el servidor (todo).
create function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  privileged boolean := current_user in ('postgres', 'supabase_admin', 'service_role');
begin
  if tg_op = 'INSERT' then
    if new.role = 'student' and not exists (
      select 1 from public.profiles c where c.id = new.coach_id and c.role = 'coach'
    ) then
      raise exception 'coach_id debe referenciar al coach' using errcode = '23514';
    end if;
    return new;
  end if;

  if (new.role <> old.role or new.coach_id <> old.coach_id) and not privileged then
    raise exception 'No se puede cambiar role ni coach_id' using errcode = '42501';
  end if;

  if new.is_active <> old.is_active and not privileged then
    if old.role = 'coach' or old.coach_id is distinct from auth.uid() then
      raise exception 'Solo el coach puede cambiar is_active de sus alumnos' using errcode = '42501';
    end if;
  end if;

  if new.id <> old.id then
    raise exception 'No se puede cambiar el id' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard
  before insert or update on public.profiles
  for each row execute function public.profiles_guard();
