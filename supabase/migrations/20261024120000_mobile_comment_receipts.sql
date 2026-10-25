-- T195: guardar comentario y recibo en la misma transacción, incluso ante reintentos.
create table public.mobile_comment_receipts (
  comment_id uuid primary key,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body_hash text not null check (body_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
create index mobile_comment_receipts_workout_idx on public.mobile_comment_receipts(workout_id);
create index mobile_comment_receipts_author_idx on public.mobile_comment_receipts(author_id);
alter table public.mobile_comment_receipts enable row level security;
revoke all on public.mobile_comment_receipts from public, anon, authenticated;
grant select, insert on public.mobile_comment_receipts to authenticated;
create policy mobile_comment_receipts_select on public.mobile_comment_receipts
  for select to authenticated using (public.is_active_member() and author_id = auth.uid());
create policy mobile_comment_receipts_insert on public.mobile_comment_receipts
  for insert to authenticated with check (
    public.is_active_member() and author_id = auth.uid()
    and exists(select 1 from public.workouts w where w.id = workout_id and w.student_id = auth.uid())
  );

create function public.publish_mobile_comment(p_comment_id uuid,p_workout_id uuid,p_body text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_author uuid := auth.uid();
  v_body text := pg_catalog.regexp_replace(coalesce(p_body,''),'^[[:space:]]+|[[:space:]]+$','','g');
  v_hash text;
  v_inserted uuid;
  v_receipt public.mobile_comment_receipts%rowtype;
begin
  if v_author is null or not public.is_active_member() then return 'forbidden'; end if;
  if p_comment_id is null or p_workout_id is null or pg_catalog.char_length(v_body) not between 1 and 500 then return 'invalid'; end if;
  if not exists(select 1 from public.workouts w where w.id=p_workout_id and w.student_id=v_author) then return 'not_found'; end if;
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_body,'UTF8')),'hex');
  insert into public.mobile_comment_receipts(comment_id,workout_id,author_id,body_hash)
    values(p_comment_id,p_workout_id,v_author,v_hash)
    on conflict(comment_id) do nothing returning comment_id into v_inserted;
  if v_inserted is not null then
    insert into public.comments(id,workout_id,author_id,body) values(p_comment_id,p_workout_id,v_author,v_body);
    return 'created';
  end if;
  select * into v_receipt from public.mobile_comment_receipts r where r.comment_id=p_comment_id;
  if not found or v_receipt.workout_id<>p_workout_id or v_receipt.author_id<>v_author or v_receipt.body_hash<>v_hash then return 'conflict'; end if;
  if exists(select 1 from public.comments c where c.id=p_comment_id and c.workout_id=p_workout_id and c.author_id=v_author and c.body=v_body) then return 'duplicate'; end if;
  if exists(select 1 from public.comments c where c.id=p_comment_id) then return 'conflict'; end if;
  return 'removed';
exception when unique_violation then
  -- This block also rolls back a new receipt if its comment ID already existed.
  return 'conflict';
end;
$$;
revoke all on function public.publish_mobile_comment(uuid,uuid,text) from public, anon;
grant execute on function public.publish_mobile_comment(uuid,uuid,text) to authenticated;
