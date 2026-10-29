-- T219 · Complete, minimal constancy snapshot; no nested REST row limit.
create function public.get_visible_constancy(p_student_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare
 program_ids uuid[]; workout_ids uuid[]; set_counts bigint[]; session_count bigint;
begin
 if auth.uid() is null or not public.is_active_member() then
  raise exception 'Sin acceso' using errcode='42501';
 end if;
 perform 1 from public.profiles p where p.id=p_student_id;
 if not found then return null; end if;
 select array_agg(b.id order by b.id) into program_ids from (
  select p.id from public.programs p where p.student_id=p_student_id limit 10001
 ) b;
 if coalesce(cardinality(program_ids),0)>10000 then
  raise exception 'Constancia excede esta versión' using errcode='0A000';
 end if;
 if program_ids is null then
  return jsonb_build_object('version',1,'studentId',p_student_id,'programs','[]'::jsonb,'sessions','[]'::jsonb,'workouts','[]'::jsonb);
 end if;
 select count(*) into session_count from (
  select s.id from public.program_sessions s where s.program_id=any(program_ids) limit 100001
 ) b;
 if session_count>100000 then
  raise exception 'Constancia excede esta versión' using errcode='0A000';
 end if;
 -- Start with visible non-empty workout IDs; indexed parent lookup avoids scanning empty headers.
 with visible_sets as materialized (
  select s.workout_id,count(*) set_count from public.workout_sets s
  where s.student_id=p_student_id group by s.workout_id
 ), bounded as (
  select w.id,v.set_count from visible_sets v cross join lateral (
   select w.id from public.workouts w where w.id=v.workout_id
   and w.student_id=p_student_id and w.program_id=any(program_ids) limit 1
  ) w limit 10001
 ) select array_agg(b.id order by b.id),array_agg(b.set_count order by b.id)
 into workout_ids,set_counts from bounded b;
 if coalesce(cardinality(workout_ids),0)>10000 then
  raise exception 'Constancia excede esta versión' using errcode='0A000';
 end if;
 return jsonb_build_object('version',1,'studentId',p_student_id,
  'programs',coalesce((select jsonb_agg(jsonb_build_object(
   'id',p.id,'weeksCount',p.weeks_count,'startDate',p.start_date,'endsOn',p.ends_on)
   order by p.start_date,p.id) from public.programs p where p.id=any(program_ids) and p.student_id=p_student_id),'[]'::jsonb),
  'sessions',coalesce((select jsonb_agg(jsonb_build_object(
   'id',s.id,'programId',s.program_id,'weekNumber',s.week_number,'label',s.label)
   order by s.program_id,s.week_number,s.label,s.id) from public.program_sessions s where s.program_id=any(program_ids)),'[]'::jsonb),
  'workouts',coalesce((select jsonb_agg(jsonb_build_object(
   'id',w.id,'programId',w.program_id,'programSessionId',w.program_session_id,
   'startedAt',w.started_at,'setCount',v.set_count) order by w.started_at,w.id)
   from unnest(workout_ids,set_counts) v(id,set_count) cross join lateral (
    select w.id,w.program_id,w.program_session_id,w.started_at from public.workouts w
    where w.id=v.id and w.student_id=p_student_id limit 1
   ) w),'[]'::jsonb));
end;
$$;
revoke all on function public.get_visible_constancy(uuid) from public,anon,authenticated;
grant execute on function public.get_visible_constancy(uuid) to authenticated;
