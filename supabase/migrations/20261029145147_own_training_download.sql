-- T220 · One read-only, own-account snapshot for a complete offline download.
create function public.get_own_training_download() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare
 owner uuid:=auth.uid(); today date:=(now() at time zone 'America/Santiago')::date;
 program public.programs%rowtype; v_week_number integer; v_week_start date;
 session_ids uuid[]; catalog_ids uuid[]; required_ids uuid[];
 catalog jsonb; refs jsonb; sessions jsonb; week jsonb:='null'::jsonb; result jsonb;
begin
 if owner is null or not public.is_active_member() then raise exception 'Sin acceso' using errcode='42501'; end if;
 -- Bound collections before constructing JSON; never accept REST's implicit row limit.
 select array_agg(b.id order by b.id) into catalog_ids from (
  select e.id from public.exercises e where e.archived_at is null limit 1001
 ) b;
 if coalesce(cardinality(catalog_ids),0)>1000
  or (select count(*) from (select r.id from public.personal_routines r where r.owner_id=owner limit 1001) b)>1000
  or (select count(*) from (select f.id from public.personal_folders f where f.owner_id=owner limit 1001) b)>1000 then
  raise exception 'Descarga excede esta versión' using errcode='0A000';
 end if;
 select p.* into program from public.programs p where p.student_id=owner and today between p.start_date and p.ends_on
  order by p.start_date desc,p.id limit 1;
 if found then
  v_week_number:=(today-program.start_date)/7+1; v_week_start:=program.start_date+(v_week_number-1)*7;
  select array_agg(s.id order by s.label,s.id) into session_ids from public.program_sessions s
   where s.program_id=program.id and s.week_number=v_week_number;
  select coalesce(jsonb_agg(jsonb_build_object('weekday',coalesce(o.weekday,s.weekday),'context',jsonb_build_object(
   'version',5,'userId',owner,'previousSets','[]'::jsonb,
   'origin',jsonb_build_object('kind','assigned','programId',program.id,'programSessionId',s.id),
   'title',s.title,'sessionLabel',s.label,
   'session',jsonb_build_object('id',s.id,'label',s.label,'title',s.title,'programId',program.id,'programName',program.name,
    'weekNumber',s.week_number,'weeksCount',program.weeks_count,'revision',s.revision,'startDate',program.start_date,'endsOn',program.ends_on),
   'exercises',coalesce((select jsonb_agg(jsonb_build_object(
    'sessionExerciseId',r.id,'exerciseId',r.exercise_id,'name',e.name,'isBodyweight',e.is_bodyweight,
    'prescribed',public.routine_training_prescription(to_jsonb(r)),'lastMetrics',null,'note',r.note,
    'restSeconds',r.rest_seconds,'supersetId',r.superset_id,'supersetRestSeconds',r.superset_rest_seconds,
    'alternatives',coalesce((select jsonb_agg(jsonb_build_object(
      'exerciseId',a.exercise_id,'name',ae.name,'isBodyweight',ae.is_bodyweight,
      'prescribed',public.routine_training_prescription(to_jsonb(a)),'lastMetrics',null) order by a.position,a.id)
      from public.session_exercise_alternatives a left join public.exercises ae on ae.id=a.exercise_id
      where a.session_exercise_id=r.id),'[]'::jsonb)) order by r.position,r.id)
    from public.session_exercises r left join public.exercises e on e.id=r.exercise_id
    where r.program_session_id=s.id),'[]'::jsonb))) order by s.label,s.id),'[]'::jsonb) into sessions
   from public.program_sessions s left join public.session_day_overrides o on o.session_id=s.id and o.student_id=owner
   where s.id=any(session_ids);
  week:=jsonb_build_object('program',jsonb_build_object('id',program.id,'name',program.name,
   'startDate',program.start_date,'endsOn',program.ends_on,'weeksCount',program.weeks_count),
   'weekNumber',v_week_number,'weekStart',v_week_start,'weekEnd',v_week_start+6,
   'sessionCount',coalesce(cardinality(session_ids),0),'sessions',sessions);
 end if;
 select array_agg(ids.id order by ids.id) into required_ids from (
  select unnest(catalog_ids) id
  union select i.exercise_id from public.personal_routine_items i where i.owner_id=owner
  union select r.exercise_id from public.session_exercises r where r.program_session_id=any(session_ids)
  union select a.exercise_id from public.session_exercise_alternatives a join public.session_exercises r on r.id=a.session_exercise_id
   where r.program_session_id=any(session_ids)
 ) ids;
 if coalesce(cardinality(required_ids),0)>20000 then raise exception 'Descarga excede esta versión' using errcode='0A000'; end if;
 if (select count(*) from public.exercises e where e.id=any(required_ids))<>coalesce(cardinality(required_ids),0) then
  raise exception 'Referencia no disponible' using errcode='42501';
 end if;
 with metadata as (
  select e.id,e.name,jsonb_build_object('id',e.id,'name',e.name,'muscleGroup',e.muscle_group,'equipment',e.equipment,
   'isBodyweight',e.is_bodyweight,'progressionIncrementKg',e.progression_increment_kg,'recordType',e.record_type) entry
  from public.exercises e where e.id=any(required_ids)
 ) select coalesce(jsonb_agg(entry order by name,id) filter(where id=any(catalog_ids)),'[]'::jsonb),
  coalesce(jsonb_agg(entry order by id) filter(where not coalesce(id=any(catalog_ids),false)),'[]'::jsonb)
 into catalog,refs from metadata;
 result:=jsonb_build_object('version',1,'userId',owner,'downloadedAt',now(),
  'catalog',jsonb_build_object('version',2,'exercises',catalog),'references',refs,
  'library',public.get_training_library(),'week',week,'history',public.get_visible_training_history(owner));
 if octet_length(result::text)>16777216 then raise exception 'Descarga excede esta versión' using errcode='0A000'; end if;
 return result;
end;
$$;
revoke all on function public.get_own_training_download() from public,anon,authenticated;
grant execute on function public.get_own_training_download() to authenticated;
