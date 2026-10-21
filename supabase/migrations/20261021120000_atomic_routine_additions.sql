-- T175: una selección es una transacción; revisión y recibo conservan el intento.
create function public.add_routine_exercises(
 p_session_id uuid, p_expected_revision integer, p_request_id uuid, p_items jsonb
) returns integer language plpgsql security invoker set search_path='' as $$
declare
 v_session public.program_sessions%rowtype;
 v_receipt public.routine_mutations%rowtype;
 v_payload jsonb;
 v_item jsonb;
 v_count integer;
 v_position integer;
 v_revision integer;
begin
 if not public.is_coach() then raise exception 'Solo el coach puede editar' using errcode='42501'; end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or
    p_items is null or jsonb_typeof(p_items)<>'array' then
   raise exception 'Solicitud inválida' using errcode='22023'; end if;
 if jsonb_array_length(p_items) not between 1 and 15 or
    (select count(distinct value->>'id') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) or
    (select count(distinct value->>'exerciseId') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then
   raise exception 'Lote inválido' using errcode='22023'; end if;
 select * into v_session from public.program_sessions where id=p_session_id;
 if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
 perform 1 from public.programs where id=v_session.program_id and coach_id=auth.uid() for update;
 if not found then raise exception 'Programa no encontrado' using errcode='P0002'; end if;
 select * into v_session from public.program_sessions where id=p_session_id for update;
 if not found then raise exception 'Sesión no encontrada' using errcode='P0002'; end if;
 v_payload:=jsonb_build_object('operation','add','base',p_expected_revision,'items',p_items);
 select * into v_receipt from public.routine_mutations where id=p_request_id;
 if found then
   if v_receipt.session_id<>p_session_id or v_receipt.payload<>v_payload then
     raise exception 'No reutilices la identidad con otro contenido' using errcode='22023'; end if;
   return v_receipt.revision;
 end if;
 if not public.can_edit_routine_session(p_session_id) then raise exception 'Semana bloqueada' using errcode='55000'; end if;
 if v_session.revision<>p_expected_revision then raise exception 'La sesión cambió en otra pestaña' using errcode='40001'; end if;
 select count(*),coalesce(max(position),-1)+1 into v_count,v_position from public.session_exercises where program_session_id=p_session_id;
 if v_count+jsonb_array_length(p_items)>15 then raise exception 'Máximo 15 ejercicios' using errcode='23514'; end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
   if jsonb_typeof(v_item)<>'object' or not (v_item ?& array['id','exerciseId']) or
     exists(select 1 from jsonb_object_keys(v_item) k where k not in ('id','exerciseId')) then
     raise exception 'Miembro inválido' using errcode='22023'; end if;
   if not exists(select 1 from public.exercises where id=(v_item->>'exerciseId')::uuid and archived_at is null) then
     raise exception 'Ejercicio no disponible' using errcode='22023'; end if;
   insert into public.session_exercises(id,program_session_id,exercise_id,position,sets,reps_min,reps_max)
     values((v_item->>'id')::uuid,p_session_id,(v_item->>'exerciseId')::uuid,v_position,3,8,12);
   v_position:=v_position+1;
 end loop;
 select revision into v_revision from public.program_sessions where id=p_session_id;
 insert into public.routine_mutations(id,session_id,coach_id,payload,revision)
   values(p_request_id,p_session_id,auth.uid(),v_payload,v_revision);
 return v_revision;
end;
$$;
revoke all on function public.add_routine_exercises(uuid,integer,uuid,jsonb) from public,anon;
grant execute on function public.add_routine_exercises(uuid,integer,uuid,jsonb) to authenticated;
