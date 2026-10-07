-- T24 · RLS de workouts y workout_sets (RF-20 a RF-24, RF-26b, RF-34, RF-44).
-- El alumno crea y ve lo suyo y solo edita o borra dentro de 7 días (hora de Santiago).
-- El coach solo lee. Las series solo se agregan a un entrenamiento recién creado o dentro
-- de la ventana de edición, para que no se pueda "reescribir" un entrenamiento antiguo.

-- Primer día (hora de Santiago) en que todavía se puede editar un entrenamiento.
create function public.edit_window_start()
returns date
language sql
stable
set search_path = ''
as $$
  select ((now() at time zone 'America/Santiago'))::date - 7
$$;

grant execute on function public.edit_window_start() to authenticated;

-- workouts ---------------------------------------------------------------------------------
create policy workouts_select on public.workouts
  for select to authenticated
  using (
    public.is_active_member()
    and (student_id = auth.uid() or public.is_coach_of(student_id))
  );

create policy workouts_insert on public.workouts
  for insert to authenticated
  with check (public.is_active_member() and student_id = auth.uid());

create policy workouts_update on public.workouts
  for update to authenticated
  using (
    public.is_active_member() and student_id = auth.uid()
    and performed_on >= public.edit_window_start()
  )
  with check (student_id = auth.uid());

create policy workouts_delete on public.workouts
  for delete to authenticated
  using (
    public.is_active_member() and student_id = auth.uid()
    and performed_on >= public.edit_window_start()
  );

-- workout_sets -----------------------------------------------------------------------------
create policy workout_sets_select on public.workout_sets
  for select to authenticated
  using (
    public.is_active_member()
    and (student_id = auth.uid() or public.is_coach_of(student_id))
  );

create policy workout_sets_insert on public.workout_sets
  for insert to authenticated
  with check (
    public.is_active_member()
    and student_id = auth.uid()
    and exists (
      select 1 from public.workouts w
      where w.id = workout_id
        and w.student_id = auth.uid()
        and (w.created_at >= now() - interval '10 minutes' or w.performed_on >= public.edit_window_start())
    )
  );

create policy workout_sets_update on public.workout_sets
  for update to authenticated
  using (
    public.is_active_member() and student_id = auth.uid()
    and exists (
      select 1 from public.workouts w
      where w.id = workout_id and w.performed_on >= public.edit_window_start()
    )
  )
  with check (student_id = auth.uid());

create policy workout_sets_delete on public.workout_sets
  for delete to authenticated
  using (
    public.is_active_member() and student_id = auth.uid()
    and exists (
      select 1 from public.workouts w
      where w.id = workout_id and w.performed_on >= public.edit_window_start()
    )
  );
