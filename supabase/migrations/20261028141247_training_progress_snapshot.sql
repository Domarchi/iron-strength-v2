-- T218 · One coherent snapshot, including every own historical metric.
-- JSON aggregation avoids Data API row truncation without broadening RLS.
create function public.get_own_training_progress() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); result jsonb;
begin
 if owner is null or not public.is_active_member() then
  raise exception 'Sin acceso' using errcode='42501';
 end if;
 if (select count(*) from public.workouts where student_id=owner)>10000
    or (select count(*) from public.workout_sets where student_id=owner)>100000 then
  raise exception 'Historial excede esta versión' using errcode='0A000';
 end if;
 select jsonb_build_object('version',1,'userId',owner,
  'today',(now() at time zone 'America/Santiago')::date,
  'workouts',coalesce(jsonb_agg(jsonb_build_object(
   'id',w.id,'startedAt',w.started_at,'date',w.performed_on,
   'sourceKind',w.source_kind,'title',w.title,'sessionLabel',w.session_label,
   'durationSeconds',w.duration_seconds,'perceivedEffort',w.perceived_effort,'note',w.note,
   'sets',coalesce((select jsonb_agg(jsonb_build_object(
    'id',s.id,'exerciseId',s.exercise_id,'name',s.exercise_name,'muscleGroup',e.muscle_group,
    'position',s.position,'setNumber',s.set_number,
    'metrics',jsonb_build_object('recordType',s.record_type,'weightKg',s.weight_kg,'reps',s.reps,
      'durationSeconds',s.duration_seconds,'distanceMeters',s.distance_meters),
    'setType',coalesce(s.set_type,case when s.is_warmup then 'warmup' else 'working' end),
    'effort',s.effort) order by s.position,s.set_number,s.id)
    from public.workout_sets s left join public.exercises e on e.id=s.exercise_id
    where s.workout_id=w.id and s.student_id=owner),'[]'::jsonb)
  ) order by w.started_at,w.id),'[]'::jsonb)) into result
 from public.workouts w where w.student_id=owner;
 return result;
end;
$$;
revoke all on function public.get_own_training_progress() from public,anon,authenticated;
grant execute on function public.get_own_training_progress() to authenticated;
