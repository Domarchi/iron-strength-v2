-- T22 · RLS de programs, program_sessions y session_exercises (RF-12 a RF-18, RF-44).
-- El alumno solo lee lo suyo. El coach edita lo suyo. Asignar a un alumno (crear la copia
-- con student_id) solo ocurre dentro de assign_program (security definer), nunca por INSERT directo.

-- programs ---------------------------------------------------------------------------------
create policy programs_select on public.programs
  for select to authenticated
  using (
    public.is_active_member()
    and (student_id = auth.uid() or (public.is_coach() and coach_id = auth.uid()))
  );

create policy programs_insert on public.programs
  for insert to authenticated
  with check (public.is_coach() and coach_id = auth.uid() and student_id is null);

create policy programs_update on public.programs
  for update to authenticated
  using (public.is_coach() and coach_id = auth.uid())
  with check (public.is_coach() and coach_id = auth.uid());

create policy programs_delete on public.programs
  for delete to authenticated
  using (public.is_coach() and coach_id = auth.uid());

-- program_sessions: visibles si el programa es visible; escribe solo el coach dueño ---------
create policy program_sessions_select on public.program_sessions
  for select to authenticated
  using (exists (select 1 from public.programs p where p.id = program_id));

create policy program_sessions_write on public.program_sessions
  for all to authenticated
  using (
    exists (
      select 1 from public.programs p
      where p.id = program_id and p.coach_id = auth.uid() and public.is_coach()
    )
  )
  with check (
    exists (
      select 1 from public.programs p
      where p.id = program_id and p.coach_id = auth.uid() and public.is_coach()
    )
  );

-- session_exercises ------------------------------------------------------------------------
create policy session_exercises_select on public.session_exercises
  for select to authenticated
  using (exists (select 1 from public.program_sessions ps where ps.id = program_session_id));

create policy session_exercises_write on public.session_exercises
  for all to authenticated
  using (
    exists (
      select 1
      from public.program_sessions ps
      join public.programs p on p.id = ps.program_id
      where ps.id = program_session_id and p.coach_id = auth.uid() and public.is_coach()
    )
  )
  with check (
    exists (
      select 1
      from public.program_sessions ps
      join public.programs p on p.id = ps.program_id
      where ps.id = program_session_id and p.coach_id = auth.uid() and public.is_coach()
    )
  );

-- Un ejercicio archivado sigue visible para quien lo tiene en un programa que puede ver
-- (caso límite de la spec: "se mantiene visible en lo asignado").
drop policy exercises_select on public.exercises;
create policy exercises_select on public.exercises
  for select to authenticated
  using (
    public.is_active_member()
    and (
      (archived_at is null and (coach_id is null or coach_id = public.current_coach_id()))
      or (public.is_coach() and coach_id = auth.uid())
      or exists (select 1 from public.session_exercises se where se.exercise_id = exercises.id)
    )
  );
