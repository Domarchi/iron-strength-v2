-- T219 · One coherent, RLS-authorized history for review, progress and CSV.
create function public.get_visible_training_history(p_student_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare person record; result jsonb;
begin
 if auth.uid() is null or not public.is_active_member() then
  raise exception 'Sin acceso' using errcode='42501';
 end if;
 select p.id,p.full_name into person from public.profiles p where p.id=p_student_id;
 if not found then return null; end if;
 -- Match the existing typed progress bound. Never return a partial export.
 if (select count(*) from public.workouts where student_id=p_student_id)>10000
    or (select count(*) from public.workout_sets where student_id=p_student_id)>100000 then
  raise exception 'Historial excede esta versión' using errcode='0A000';
 end if;
 select jsonb_build_object('version',1,
  'student',jsonb_build_object('id',person.id,'name',person.full_name),
  'today',(now() at time zone 'America/Santiago')::date,
  'workouts',coalesce(jsonb_agg(jsonb_build_object(
   'id',w.id,'studentId',w.student_id,'startedAt',w.started_at,'finishedAt',w.finished_at,
   'date',w.performed_on,'durationSeconds',w.duration_seconds,
   'sourceKind',w.source_kind,'title',w.title,
   'personalRoutineId',w.personal_routine_id,'personalRoutineRevision',w.personal_routine_revision,
   'programId',w.program_id,'programSessionId',w.program_session_id,'programName',p.name,
   'sessionLabel',w.session_label,'perceivedEffort',w.perceived_effort,'note',w.note,
   'editRevision',w.edit_revision,'structure',w.structure,'exerciseNotes',w.exercise_notes,
   'exerciseNames',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.name) order by e.id)
    from public.exercises e where e.id in (
     select (r->>'exerciseId')::uuid from jsonb_array_elements(coalesce(w.structure->'exercises','[]'::jsonb)) r
     union select (r->>'prescribedExerciseId')::uuid from jsonb_array_elements(coalesce(w.structure->'exercises','[]'::jsonb)) r
    )),'[]'::jsonb),
   'sets',coalesce((select jsonb_agg(jsonb_build_object(
    'id',s.id,'exerciseId',s.exercise_id,'name',s.exercise_name,
    'prescribedExerciseId',s.prescribed_exercise_id,'prescribedExerciseName',s.prescribed_exercise_name,
    'muscleGroup',e.muscle_group,'position',s.position,'setNumber',s.set_number,
    'metrics',jsonb_build_object('recordType',s.record_type,'weightKg',s.weight_kg,'reps',s.reps,
     'durationSeconds',s.duration_seconds,'distanceMeters',s.distance_meters),
    'setType',coalesce(s.set_type,case when s.is_warmup then 'warmup' else 'working' end),
    'effort',s.effort) order by s.position,s.set_number,s.id)
    from public.workout_sets s left join public.exercises e on e.id=s.exercise_id
    where s.workout_id=w.id and s.student_id=p_student_id),'[]'::jsonb)
  ) order by w.started_at,w.id),'[]'::jsonb)) into result
 from public.workouts w left join public.programs p on p.id=w.program_id
 where w.student_id=p_student_id;
 return result;
end;
$$;
revoke all on function public.get_visible_training_history(uuid) from public,anon,authenticated;
grant execute on function public.get_visible_training_history(uuid) to authenticated;
