-- T13 · Sesiones planificadas y su prescripción (RF-13, RF-14, DC-13).

create table public.program_sessions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  week_number smallint not null check (week_number >= 1),
  label text not null check (label ~ '^[A-G]$'), -- A..G = hasta 7 sesiones por semana
  position smallint not null default 0,
  unique (program_id, week_number, label)
);
create index program_sessions_program_week_idx on public.program_sessions (program_id, week_number);

alter table public.program_sessions enable row level security;

create function public.program_sessions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.week_number > (select weeks_count from public.programs where id = new.program_id) then
    raise exception 'week_number excede weeks_count del programa' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger program_sessions_guard
  before insert or update of week_number, program_id on public.program_sessions
  for each row execute function public.program_sessions_guard();

create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  program_session_id uuid not null references public.program_sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position smallint not null default 0,
  sets smallint not null check (sets between 1 and 10),
  reps_min smallint not null check (reps_min between 1 and 100),
  reps_max smallint not null check (reps_max between 1 and 100),
  target_weight_kg numeric(6, 2) check (target_weight_kg is null or target_weight_kg between 0 and 500),
  note text check (note is null or char_length(note) <= 500),
  constraint session_exercises_reps_range check (reps_min <= reps_max)
);
create index session_exercises_session_idx on public.session_exercises (program_session_id, position);

alter table public.session_exercises enable row level security;

create function public.session_exercises_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.session_exercises where program_session_id = new.program_session_id) >= 15 then
    raise exception 'Máximo 15 ejercicios por sesión' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger session_exercises_guard
  before insert on public.session_exercises
  for each row execute function public.session_exercises_guard();
