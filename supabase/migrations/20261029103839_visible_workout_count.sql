-- T219 · Count visible non-empty workouts, without building a nested REST response.
create function public.count_visible_workouts(p_student_id uuid) returns bigint
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.is_active_member() then
  raise exception 'Sin acceso' using errcode='42501';
 end if;
 -- The composite FK guarantees the parent and owner; SELECT policies share membership.
 -- Count only the visible sets, without scanning thousands of empty headers.
 return (
  select count(distinct s.workout_id)
  from public.workout_sets s
  where s.student_id=p_student_id
 );
end;
$$;
revoke all on function public.count_visible_workouts(uuid) from public,anon,authenticated;
grant execute on function public.count_visible_workouts(uuid) to authenticated;
