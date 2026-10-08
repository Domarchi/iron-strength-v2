-- T120 · Logros (RF-31, RF-66; DC-17, DC-28). Permanentes: se insertan y nunca se actualizan ni se
-- borran (salvo la cascada al borrar la cuenta del alumno).

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (
    kind in ('first_workout', 'first_record', 'workouts_10', 'streak_4', 'workouts_25', 'workouts_50')
  ),
  earned_at timestamptz not null default now(),
  constraint achievements_one_per_kind unique (student_id, kind)
);
create index achievements_student_idx on public.achievements (student_id);

alter table public.achievements enable row level security;

-- El alumno ve los suyos y el coach los de sus alumnos.
create policy achievements_select on public.achievements
  for select to authenticated
  using (
    public.is_active_member()
    and (student_id = auth.uid() or public.is_coach_of(student_id))
  );

-- Solo el propio alumno inserta los suyos (DC-28: dato cosmético, ver la revisión de seguridad).
create policy achievements_insert on public.achievements
  for insert to authenticated
  with check (public.is_active_member() and student_id = auth.uid());

-- Sin políticas de update ni delete: los logros son permanentes. Se quitan también los permisos de
-- tabla, para que el rechazo no dependa solo de la RLS.
revoke update, delete on public.achievements from authenticated;
