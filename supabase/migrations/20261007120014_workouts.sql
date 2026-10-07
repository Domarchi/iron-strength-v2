-- T14 · Entrenamientos y series (RF-20 a RF-24, DC-6, DC-8).
-- El id lo genera el cliente: guardar dos veces el mismo id no duplica (idempotencia).

create table public.workouts (
  id uuid primary key,
  student_id uuid not null references public.profiles (id) on delete cascade,
  program_id uuid references public.programs (id) on delete set null,
  program_session_id uuid references public.program_sessions (id) on delete set null,
  session_label text check (session_label is null or char_length(session_label) <= 10),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  -- El día y la semana se derivan en el servidor, siempre en hora de Santiago.
  performed_on date generated always as (((started_at at time zone 'America/Santiago'))::date) stored,
  week_start date generated always as (
    (date_trunc('week', started_at at time zone 'America/Santiago'))::date
  ) stored,
  created_at timestamptz not null default now(),
  constraint workouts_finished_after_started check (finished_at >= started_at),
  unique (id, student_id)
);

create index workouts_student_performed_idx on public.workouts (student_id, performed_on desc);
create index workouts_student_week_idx on public.workouts (student_id, week_start);

alter table public.workouts enable row level security;

create function public.workouts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.started_at > now() + interval '5 minutes' then
    raise exception 'started_at no puede estar en el futuro' using errcode = '23514';
  end if;

  if new.program_session_id is not null then
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
  end if;

  return new;
end;
$$;

create trigger workouts_guard
  before insert or update on public.workouts
  for each row execute function public.workouts_guard();

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null,
  student_id uuid not null,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  exercise_name text not null check (char_length(exercise_name) between 1 and 100),
  position smallint not null check (position >= 0), -- orden del ejercicio dentro de la sesión
  set_number smallint not null check (set_number >= 1),
  weight_kg numeric(6, 2) not null check (weight_kg between 0 and 500),
  reps smallint not null check (reps between 1 and 100), -- solo series completadas (RF-23)
  is_warmup boolean not null default false,
  -- student_id desnormalizado y garantizado igual al del entrenamiento (RLS e índices simples).
  constraint workout_sets_workout_fk foreign key (workout_id, student_id)
    references public.workouts (id, student_id) on delete cascade,
  unique (workout_id, position, set_number)
);

create index workout_sets_student_exercise_idx on public.workout_sets (student_id, exercise_id);
create index workout_sets_workout_idx on public.workout_sets (workout_id);

alter table public.workout_sets enable row level security;
