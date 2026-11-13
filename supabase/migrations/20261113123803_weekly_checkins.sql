-- T256 · Check-in semanal alumno → coach: cómo se sintió la persona esta semana.
-- Uno por alumno y semana (lunes en America/Santiago). El alumno lo crea y lo corrige; el coach de
-- ese alumno solo lo lee. RLS cerrada; sin borrado directo (se elimina en cascada con la cuenta).
create table public.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  sleep smallint not null check (sleep between 1 and 5),
  energy smallint not null check (energy between 1 and 5),
  soreness smallint not null check (soreness between 1 and 5),
  motivation smallint not null check (motivation between 1 and 5),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_checkins_week_is_monday check (extract(isodow from week_start) = 1),
  constraint weekly_checkins_one_per_week unique (student_id, week_start)
);
create index weekly_checkins_student_week_idx on public.weekly_checkins(student_id, week_start desc);
alter table public.weekly_checkins enable row level security;
revoke all on public.weekly_checkins from public, anon, authenticated;
grant select, insert, update on public.weekly_checkins to authenticated;

create policy weekly_checkins_select on public.weekly_checkins
  for select to authenticated
  using (public.is_active_member() and (student_id = auth.uid() or public.is_coach_of(student_id)));
create policy weekly_checkins_insert on public.weekly_checkins
  for insert to authenticated
  with check (public.is_active_member() and student_id = auth.uid());
-- El alumno corrige su propio check-in; no puede mover la semana ni cambiar de dueño.
create policy weekly_checkins_update on public.weekly_checkins
  for update to authenticated
  using (public.is_active_member() and student_id = auth.uid())
  with check (public.is_active_member() and student_id = auth.uid());

create function public.weekly_checkins_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.student_id is distinct from old.student_id or new.week_start is distinct from old.week_start then
      raise exception 'weekly_checkin_identity' using errcode = '23514';
    end if;
    new.updated_at := pg_catalog.now();
  end if;
  return new;
end;
$$;
create trigger weekly_checkins_guard before update on public.weekly_checkins
  for each row execute function public.weekly_checkins_guard();
