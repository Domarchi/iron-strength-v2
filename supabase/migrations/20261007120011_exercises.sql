-- T11 · Biblioteca de ejercicios (RF-9 a RF-11, DC-12). coach_id nulo = catálogo base global.

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  muscle_group text not null
    check (muscle_group in ('Pecho', 'Espalda', 'Hombros', 'Brazos', 'Piernas', 'Core', 'Cardio')),
  equipment text check (equipment is null or char_length(equipment) <= 50),
  is_bodyweight boolean not null default false,
  progression_increment_kg numeric(4, 2) not null default 2.5
    check (progression_increment_kg > 0 and progression_increment_kg <= 20),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index exercises_unique_name_per_owner on public.exercises (
  coalesce(coach_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(btrim(name))
);
create index exercises_coach_id_idx on public.exercises (coach_id);

alter table public.exercises enable row level security;
