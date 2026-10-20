-- T154: parches de campos explícitos, con la misma revisión y recibo atómico.
create or replace function public.mutate_routine_session(
  p_session_id uuid, p_expected_revision integer, p_request_id uuid,
  p_rows jsonb default null, p_ordered_ids uuid[] default null, p_title text default null
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
  if p_title is not null and (length(btrim(p_title)) > 80 or p_ordered_ids is not null) then raise exception 'Título inválido' using errcode='22023'; end if;
  select * into v_session from public.program_sessions where id=p_session_id;
  if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
  -- Mismo orden de bloqueos que duplicación: programa antes de sesión.
  select * into v_program from public.programs where id=v_session.program_id and coach_id=auth.uid() for update;
  if not found then raise exception 'Programa no encontrado' using errcode='P0002'; end if;
  select * into v_session from public.program_sessions where id=p_session_id for update;
  if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
  v_payload := jsonb_build_object('rows',p_rows,'order',p_ordered_ids,'base',p_expected_revision);
  if p_title is not null then v_payload:=v_payload||jsonb_build_object('title',p_title); end if;
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
    if (jsonb_array_length(p_rows) > 15 or (jsonb_array_length(p_rows)=0 and p_title is null)) or
      (select count(distinct value->>'id') from jsonb_array_elements(p_rows)) <> jsonb_array_length(p_rows) then
      raise exception 'Lote inválido' using errcode='22023';
    end if;
    for v_row in select value from jsonb_array_elements(p_rows) loop
      if v_row ? 'fields' then
        if jsonb_typeof(v_row->'fields') <> 'array' or jsonb_array_length(v_row->'fields') not between 1 and 7 then
          raise exception 'Campos inválidos' using errcode='22023'; end if;
        if exists (select 1 from jsonb_array_elements_text(v_row->'fields') f(value) where
          f.value not in ('sets','repsMin','repsMax','targetWeightKg','note','restSeconds','supersetRestSeconds') or not (v_row ? f.value))
          or (select count(distinct value) from jsonb_array_elements_text(v_row->'fields')) <> jsonb_array_length(v_row->'fields') then
          raise exception 'Campos inválidos' using errcode='22023'; end if;
      end if;
      update public.session_exercises set
        sets=case when (not (v_row ? 'fields') or (v_row->'fields') ? 'sets') then (v_row->>'sets')::smallint else sets end,
        reps_min=case when (not (v_row ? 'fields') or (v_row->'fields') ? 'repsMin') then (v_row->>'repsMin')::smallint else reps_min end,
        reps_max=case when (not (v_row ? 'fields') or (v_row->'fields') ? 'repsMax') then (v_row->>'repsMax')::smallint else reps_max end,
        target_weight_kg=case when (not (v_row ? 'fields') or (v_row->'fields') ? 'targetWeightKg') then (v_row->>'targetWeightKg')::numeric else target_weight_kg end,
        note=case when (not (v_row ? 'fields') or (v_row->'fields') ? 'note') then (v_row->>'note') else note end,
        rest_seconds=case when v_row ? 'restSeconds' and (not (v_row ? 'fields') or (v_row->'fields') ? 'restSeconds') then (v_row->>'restSeconds')::smallint else rest_seconds end,
        superset_rest_seconds=case when v_row ? 'supersetRestSeconds' and (not (v_row ? 'fields') or (v_row->'fields') ? 'supersetRestSeconds') then (v_row->>'supersetRestSeconds')::smallint else superset_rest_seconds end
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
  if p_title is not null then update public.program_sessions set title=nullif(btrim(p_title),'') where id=p_session_id; end if;
  select revision into v_revision from public.program_sessions where id=p_session_id;
  insert into public.routine_mutations(id,session_id,coach_id,payload,revision)
    values(p_request_id,p_session_id,auth.uid(),v_payload,v_revision);
  return v_revision;
end;
$$;
revoke all on function public.mutate_routine_session(uuid,integer,uuid,jsonb,uuid[],text) from public,anon;
grant execute on function public.mutate_routine_session(uuid,integer,uuid,jsonb,uuid[],text) to authenticated;

