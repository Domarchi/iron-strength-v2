-- T218 · RF-26b: borrado propio completo con revisión y recibo independiente.
-- Reutiliza la tabla privada existente; la huella distingue eliminación de corrección.
create function public.get_own_workout_removal(p_workout_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); result jsonb;
begin
 if owner is null or not public.is_active_member() then raise exception 'Sin acceso' using errcode='42501'; end if;
 select jsonb_build_object('version',1,'userId',owner,'today',(now() at time zone 'America/Santiago')::date,
  'workout',jsonb_build_object('id',w.id,'revision',w.edit_revision,'sourceKind',w.source_kind,
   'title',w.title,'sessionLabel',w.session_label,'performedOn',w.performed_on,
   'setCount',(select count(*) from public.workout_sets s where s.workout_id=w.id and s.student_id=owner),
   'commentCount',(select count(*) from public.comments c where c.workout_id=w.id))) into result
 from public.workouts w where w.id=p_workout_id and w.student_id=owner;
 return result;
end;
$$;

create function public.remove_own_workout(p_removal jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); wid uuid; rid uuid; fingerprint text;
 saved public.workout_correction_receipts%rowtype; w public.workouts%rowtype; removed uuid; next_revision integer;
begin
 if owner is null or not public.is_active_member() then raise exception 'Sin acceso' using errcode='42501'; end if;
 if jsonb_typeof(p_removal) is distinct from 'object'
  or not(p_removal ?& array['version','requestId','workoutId','expectedRevision'])
  or p_removal-array['version','requestId','workoutId','expectedRevision']<>'{}'
  or p_removal->'version' is distinct from '1'::jsonb
  or not public.valid_training_uuid(p_removal->'requestId')
  or not public.valid_training_uuid(p_removal->'workoutId')
  or not public.valid_training_number(p_removal->'expectedRevision',0,2147483647,1) then
   raise exception 'Eliminación inválida' using errcode='22023';
 end if;
 wid:=(p_removal->>'workoutId')::uuid; rid:=(p_removal->>'requestId')::uuid;
 fingerprint:=encode(extensions.digest(jsonb_build_object('operation','delete','request',p_removal)::text,'sha256'),'hex');
 -- Mismo bloqueo que las correcciones: no reutilizar un intento entre operaciones.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':'||rid::text,218));
 select * into saved from public.workout_correction_receipts where owner_id=owner and request_id=rid;
 if found then
  if saved.workout_id<>wid or saved.payload_hash<>fingerprint then
   raise exception 'Intento con contenido distinto' using errcode='22023';
  end if;
  if exists(select 1 from public.workouts where id=wid and student_id=owner) then
   raise exception 'El resultado sigue disponible; revisa su versión' using errcode='40001';
  end if;
  return jsonb_build_object('version',1,'requestId',rid,'workoutId',wid,'revision',saved.revision,'status','duplicate');
 end if;
 -- Distinguir plazo vencido antes de que la política de UPDATE oculte el bloqueo.
 select * into w from public.workouts where id=wid and student_id=owner;
 if not found then raise exception 'Resultado no disponible' using errcode='P0002'; end if;
 if w.performed_on<public.edit_window_start() then raise exception 'Fuera de la ventana de edición' using errcode='55000'; end if;
 select * into w from public.workouts where id=wid and student_id=owner for update;
 if not found or w.edit_revision<>(p_removal->>'expectedRevision')::integer then
  raise exception 'El resultado cambió; revisa la versión actual' using errcode='40001';
 end if;
 if w.performed_on<public.edit_window_start() then raise exception 'Fuera de la ventana de edición' using errcode='55000'; end if;
 if w.edit_revision=2147483647 then raise exception 'Revisión agotada' using errcode='22023'; end if;
 next_revision:=w.edit_revision+1;
 delete from public.workouts where id=wid and student_id=owner returning id into removed;
 if removed is null then raise exception 'No se confirmó esta eliminación' using errcode='40001'; end if;
 -- Si este último paso falla también se revierten cabecera, series y comentarios.
 insert into public.workout_correction_receipts(owner_id,request_id,workout_id,payload_hash,revision)
  values(owner,rid,wid,fingerprint,next_revision);
 return jsonb_build_object('version',1,'requestId',rid,'workoutId',wid,'revision',next_revision,'status','deleted');
end;
$$;
revoke all on function public.get_own_workout_removal(uuid),public.remove_own_workout(jsonb) from public,anon,authenticated;
grant execute on function public.get_own_workout_removal(uuid),public.remove_own_workout(jsonb) to authenticated;
