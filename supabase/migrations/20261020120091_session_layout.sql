-- T146: configuración completa de grupos/descansos/orden con revisión y recibo.
create function public.configure_session_layout(
  p_session_id uuid,p_expected_revision integer,p_request_id uuid,p_layout jsonb
) returns integer language plpgsql security invoker set search_path='' as $$
declare
  v_session public.program_sessions%rowtype;
  v_program public.programs%rowtype;
  v_receipt public.routine_mutations%rowtype;
  v_payload jsonb;
  v_count integer;
  v_revision integer;
begin
  if not public.is_coach() then raise exception 'Solo el coach puede editar' using errcode='42501'; end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_layout is null then
    raise exception 'Solicitud inválida' using errcode='22023'; end if;
  select * into v_session from public.program_sessions where id=p_session_id;
  if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
  select * into v_program from public.programs where id=v_session.program_id and coach_id=auth.uid() for update;
  if not found then raise exception 'Programa no encontrado' using errcode='P0002'; end if;
  select * into v_session from public.program_sessions where id=p_session_id for update;
  if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
  v_payload:=jsonb_build_object('layout',p_layout,'base',p_expected_revision);
  select * into v_receipt from public.routine_mutations where id=p_request_id;
  if found then
    if v_receipt.session_id<>p_session_id or v_receipt.payload<>v_payload then raise exception 'Solicitud reutilizada con otro contenido' using errcode='22023'; end if;
    return v_receipt.revision;
  end if;
  if v_program.student_id is not null and (
    v_program.start_date + ((v_session.week_number-1)*7) <= date_trunc('week',now() at time zone 'America/Santiago')::date
    or v_program.start_date + ((v_session.week_number-1)*7) > v_program.ends_on
    or (now() at time zone 'America/Santiago')::date > v_program.ends_on
  ) then raise exception 'Semana bloqueada' using errcode='55000'; end if;
  if v_session.revision<>p_expected_revision then raise exception 'La sesión cambió' using errcode='40001'; end if;
  if jsonb_typeof(p_layout)<>'array' then raise exception 'Configuración inválida' using errcode='22023'; end if;
  select count(*) into v_count from public.session_exercises where program_session_id=p_session_id;
  if jsonb_array_length(p_layout) not between 1 and 15 or jsonb_array_length(p_layout)<>v_count
    or (select count(distinct value->>'id') from jsonb_array_elements(p_layout))<>v_count
    or exists(select 1 from jsonb_array_elements(p_layout) r where not exists(
      select 1 from public.session_exercises e where e.id=(r->>'id')::uuid and e.program_session_id=p_session_id)) then
    raise exception 'La configuración debe incluir toda la sesión' using errcode='22023'; end if;
  update public.session_exercises e set position=r.ordinal-1,
    rest_seconds=(r.value->>'restSeconds')::smallint,
    superset_id=(r.value->>'supersetId')::uuid,
    superset_rest_seconds=(r.value->>'supersetRestSeconds')::smallint
    from jsonb_array_elements(p_layout) with ordinality r(value,ordinal)
    where e.id=(r.value->>'id')::uuid and e.program_session_id=p_session_id;
  -- Los triggers diferidos comprobarán también cambios hechos fuera de esta función.
  select revision into v_revision from public.program_sessions where id=p_session_id;
  insert into public.routine_mutations(id,session_id,coach_id,payload,revision)
    values(p_request_id,p_session_id,auth.uid(),v_payload,v_revision);
  return v_revision;
end;
$$;
revoke all on function public.configure_session_layout(uuid,integer,uuid,jsonb) from public,anon;
grant execute on function public.configure_session_layout(uuid,integer,uuid,jsonb) to authenticated;
