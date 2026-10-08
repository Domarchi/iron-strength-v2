-- T124 · Comentarios no leídos (RF-37; DC-30). `comment_reads` guarda cuándo abrió cada persona un
-- entrenamiento. Un comentario es "no leído" para quien no lo escribió si es posterior a esa marca.
-- Las funciones se ejecutan con los permisos de quien llama (security invoker): la RLS de comments y
-- de workouts sigue siendo la única barrera de lo que cada uno puede ver.

create table public.comment_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, workout_id)
);
create index comment_reads_workout_idx on public.comment_reads (workout_id);

alter table public.comment_reads enable row level security;

create policy comment_reads_select on public.comment_reads
  for select to authenticated
  using (public.is_active_member() and user_id = auth.uid());

-- Solo se marca leído un entrenamiento que la RLS deja ver.
create policy comment_reads_insert on public.comment_reads
  for insert to authenticated
  with check (
    public.is_active_member()
    and user_id = auth.uid()
    and exists (select 1 from public.workouts w where w.id = workout_id)
  );

create policy comment_reads_update on public.comment_reads
  for update to authenticated
  using (public.is_active_member() and user_id = auth.uid())
  with check (user_id = auth.uid());

revoke delete on public.comment_reads from authenticated;

-- Conteo de comentarios no leídos por entrenamiento, para quien llama.
create function public.unread_comments()
returns table (workout_id uuid, student_id uuid, unread_count integer, last_comment_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.workout_id, w.student_id, count(*)::integer, max(c.created_at)
  from public.comments c
  join public.workouts w on w.id = c.workout_id
  left join public.comment_reads r
    on r.workout_id = c.workout_id and r.user_id = auth.uid()
  where c.author_id <> auth.uid()
    and (r.read_at is null or c.created_at > r.read_at)
  group by c.workout_id, w.student_id
$$;

-- Marca como leído el entrenamiento de ahora en adelante.
create function public.mark_comments_read(p_workout_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.comment_reads (user_id, workout_id, read_at)
  values (auth.uid(), p_workout_id, now())
  on conflict (user_id, workout_id) do update set read_at = excluded.read_at
$$;

revoke all on function public.unread_comments() from public, anon;
grant execute on function public.unread_comments() to authenticated;
revoke all on function public.mark_comments_read(uuid) from public, anon;
grant execute on function public.mark_comments_read(uuid) to authenticated;
