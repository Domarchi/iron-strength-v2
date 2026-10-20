-- T143: revisión de sesión y mutaciones completas con reintento estable.
alter table public.program_sessions add column revision integer not null default 0 check (revision >= 0);
create function public.bump_session_revision() returns trigger language plpgsql set search_path='' as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;
create trigger bump_session_revision before update on public.program_sessions
  for each row execute function public.bump_session_revision();
-- El trigger solo toca la revisión del padre de una fila ya autorizada por RLS.
-- Definer permite la cascada de Auth (supabase_auth_admin no tiene UPDATE sobre sesiones).
create function public.touch_exercise_session() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op <> 'INSERT' then
    update public.program_sessions set revision=revision+1 where id=old.program_session_id;
  end if;
  if tg_op = 'INSERT' or (tg_op='UPDATE' and new.program_session_id <> old.program_session_id) then
    update public.program_sessions set revision=revision+1 where id=new.program_session_id;
  end if;
  return null;
end;
$$;
revoke all on function public.touch_exercise_session() from public, anon, authenticated;
create trigger touch_exercise_session after insert or update or delete on public.session_exercises
  for each row execute function public.touch_exercise_session();

create table public.routine_mutations (
  id uuid primary key,
  session_id uuid not null references public.program_sessions(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  payload jsonb not null,
  revision integer not null,
  created_at timestamptz not null default now()
);
create index routine_mutations_session_idx on public.routine_mutations(session_id);
alter table public.routine_mutations enable row level security;
create policy routine_mutations_select on public.routine_mutations for select to authenticated
  using (public.is_coach() and coach_id=auth.uid());
create policy routine_mutations_insert on public.routine_mutations for insert to authenticated
  with check (public.is_coach() and coach_id=auth.uid() and exists (
    select 1 from public.program_sessions s join public.programs p on p.id=s.program_id
    where s.id=session_id and p.coach_id=auth.uid()
  ));
revoke all on public.routine_mutations from anon, authenticated;
grant select,insert on public.routine_mutations to authenticated;

create function public.mutate_routine_session(
  p_session_id uuid, p_expected_revision integer, p_request_id uuid,
  p_rows jsonb default null, p_ordered_ids uuid[] default null
) returns integer language plpgsql security invoker set search_path='' as $$
declare
  v_session public.program_sessions%rowtype;
  v_program public.programs%rowtype;
  v_receipt public.routine_mutations%rowtype;
  v_payload jsonb;
  v_row jsonb;
  v_revision integer;
  v_count integer;
begin
  if not public.is_coach() then raise exception 'Solo el coach puede editar' using errcode='42501'; end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision < 0 or
    (p_rows is null) = (p_ordered_ids is null) then
    raise exception 'Solicitud inválida' using errcode='22023';
  end if;
  select * into v_session from public.program_sessions where id=p_session_id;
  if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
  -- Mismo orden de bloqueos que duplicación: programa antes de sesión.
  select * into v_program from public.programs where id=v_session.program_id and coach_id=auth.uid() for update;
  if not found then raise exception 'Programa no encontrado' using errcode='P0002'; end if;
  select * into v_session from public.program_sessions where id=p_session_id for update;
  if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
  v_payload := jsonb_build_object('rows',p_rows,'order',p_ordered_ids,'base',p_expected_revision);
  select * into v_receipt from public.routine_mutations where id=p_request_id;
  if found then
    if v_receipt.session_id <> p_session_id or v_receipt.payload <> v_payload then
      raise exception 'No reutilices la identidad con otro contenido' using errcode='22023';
    end if;
    return v_receipt.revision;
  end if;
  if v_program.student_id is not null and (
    v_program.start_date + ((v_session.week_number-1)*7) <= date_trunc('week',now() at time zone 'America/Santiago')::date
    or v_program.start_date + ((v_session.week_number-1)*7) > v_program.ends_on
    or (now() at time zone 'America/Santiago')::date > v_program.ends_on
  ) then raise exception 'Semana bloqueada' using errcode='55000'; end if;
  if v_session.revision <> p_expected_revision then
    raise exception 'La sesión cambió en otra pestaña' using errcode='40001';
  end if;
  if p_rows is not null then
    if jsonb_typeof(p_rows) <> 'array' then raise exception 'Lote inválido' using errcode='22023'; end if;
    if jsonb_array_length(p_rows) not between 1 and 15 or
      (select count(distinct value->>'id') from jsonb_array_elements(p_rows)) <> jsonb_array_length(p_rows) then
      raise exception 'Lote inválido' using errcode='22023';
    end if;
    for v_row in select value from jsonb_array_elements(p_rows) loop
      update public.session_exercises set
        sets=(v_row->>'sets')::smallint, reps_min=(v_row->>'repsMin')::smallint,
        reps_max=(v_row->>'repsMax')::smallint, target_weight_kg=(v_row->>'targetWeightKg')::numeric,
        note=v_row->>'note'
        where id=(v_row->>'id')::uuid and program_session_id=p_session_id
          and exercise_id=(v_row->>'exerciseId')::uuid;
      if not found then raise exception 'Ejercicio ajeno o eliminado' using errcode='P0002'; end if;
    end loop;
  else
    select count(*) into v_count from public.session_exercises where program_session_id=p_session_id;
    if cardinality(p_ordered_ids) not between 1 and 15 or cardinality(p_ordered_ids) <> v_count
      or (select count(distinct id) from unnest(p_ordered_ids) id) <> v_count
      or exists (select 1 from unnest(p_ordered_ids) o(id) where not exists (
        select 1 from public.session_exercises e where e.id=o.id and e.program_session_id=p_session_id)) then
      raise exception 'Orden inválido' using errcode='22023';
    end if;
    update public.session_exercises e set position=o.n-1
      from unnest(p_ordered_ids) with ordinality o(id,n) where e.id=o.id and e.program_session_id=p_session_id;
  end if;
  select revision into v_revision from public.program_sessions where id=p_session_id;
  insert into public.routine_mutations(id,session_id,coach_id,payload,revision)
    values(p_request_id,p_session_id,auth.uid(),v_payload,v_revision);
  return v_revision;
end;
$$;
revoke all on function public.mutate_routine_session(uuid,integer,uuid,jsonb,uuid[]) from public,anon;
grant execute on function public.mutate_routine_session(uuid,integer,uuid,jsonb,uuid[]) to authenticated;
