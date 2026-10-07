-- T15 · Comentarios por entrenamiento (RF-36, DC-14) y medidas corporales (RF-38, DC-15).

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index comments_workout_idx on public.comments (workout_id, created_at);
create index comments_author_idx on public.comments (author_id);

alter table public.comments enable row level security;

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5, 2) check (weight_kg is null or weight_kg between 20 and 300),
  waist_cm numeric(5, 1) check (waist_cm is null or waist_cm between 10 and 250),
  chest_cm numeric(5, 1) check (chest_cm is null or chest_cm between 10 and 250),
  arm_cm numeric(5, 1) check (arm_cm is null or arm_cm between 10 and 250),
  created_at timestamptz not null default now(),
  constraint body_measurements_one_per_day unique (student_id, measured_on),
  constraint body_measurements_not_empty check (
    weight_kg is not null or waist_cm is not null or chest_cm is not null or arm_cm is not null
  )
);

alter table public.body_measurements enable row level security;
