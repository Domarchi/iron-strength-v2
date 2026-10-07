-- T26 · RLS de comments, body_measurements, progress_photos, invitations y login_attempts
-- (RF-1, RF-6, RF-36, RF-38, RF-40 a RF-42, RF-44; DC-5, DC-14, DC-15, DC-18).

-- comments: visibles si el entrenamiento es visible (la RLS de workouts aplica en la subconsulta).
-- Sin política de update: los comentarios no se editan. Solo el autor borra el suyo.
create policy comments_select on public.comments
  for select to authenticated
  using (
    public.is_active_member()
    and exists (select 1 from public.workouts w where w.id = workout_id)
  );

create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    public.is_active_member()
    and author_id = auth.uid()
    and exists (select 1 from public.workouts w where w.id = workout_id)
  );

create policy comments_delete on public.comments
  for delete to authenticated
  using (public.is_active_member() and author_id = auth.uid());

-- body_measurements: el alumno gestiona las suyas; el coach solo lee las de sus alumnos.
create policy body_measurements_select on public.body_measurements
  for select to authenticated
  using (
    public.is_active_member()
    and (student_id = auth.uid() or public.is_coach_of(student_id))
  );

create policy body_measurements_insert on public.body_measurements
  for insert to authenticated
  with check (public.is_active_member() and student_id = auth.uid());

create policy body_measurements_update on public.body_measurements
  for update to authenticated
  using (public.is_active_member() and student_id = auth.uid())
  with check (student_id = auth.uid());

create policy body_measurements_delete on public.body_measurements
  for delete to authenticated
  using (public.is_active_member() and student_id = auth.uid());

-- progress_photos: igual que las medidas, sin update (para cambiar una foto se borra y se sube otra).
create policy progress_photos_select on public.progress_photos
  for select to authenticated
  using (
    public.is_active_member()
    and (student_id = auth.uid() or public.is_coach_of(student_id))
  );

create policy progress_photos_insert on public.progress_photos
  for insert to authenticated
  with check (public.is_active_member() and student_id = auth.uid());

create policy progress_photos_delete on public.progress_photos
  for delete to authenticated
  using (public.is_active_member() and student_id = auth.uid());

-- invitations: solo el coach dueño las gestiona.
create policy invitations_coach_all on public.invitations
  for all to authenticated
  using (public.is_coach() and coach_id = auth.uid())
  with check (public.is_coach() and coach_id = auth.uid());

-- login_attempts: solo service role. Se revoca el acceso por completo.
revoke all on public.login_attempts from anon, authenticated;
