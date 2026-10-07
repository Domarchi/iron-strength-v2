-- T12 · Programas (RF-12, RF-16, RF-18, DC-10).
-- student_id nulo = plantilla. Un programa asignado es una copia profunda de una plantilla.

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid references public.profiles (id) on delete cascade,
  source_program_id uuid references public.programs (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  weeks_count smallint not null check (weeks_count between 1 and 16),
  start_date date,
  ends_on date,
  created_at timestamptz not null default now(),
  constraint programs_kind check (
    (student_id is null and start_date is null and ends_on is null)
    or (student_id is not null and start_date is not null and ends_on is not null)
  ),
  constraint programs_start_is_monday check (
    start_date is null or extract(isodow from start_date) = 1
  ),
  constraint programs_ends_after_start check (ends_on is null or ends_on >= start_date),
  -- Un alumno no puede tener dos programas en el mismo rango de fechas.
  constraint programs_no_overlap exclude using gist (
    student_id with =,
    daterange(start_date, ends_on, '[]') with &&
  ) where (student_id is not null)
);

create index programs_coach_id_idx on public.programs (coach_id);
create index programs_student_id_idx on public.programs (student_id, start_date);

alter table public.programs enable row level security;
