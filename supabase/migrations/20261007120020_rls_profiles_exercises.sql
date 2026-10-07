-- T20 · Políticas RLS de profiles y exercises (RF-9 a RF-11, RF-44, DC-5, DC-12).
-- Todo denegado por defecto. Altas y bajas de perfiles: solo service role (sin política).
-- Los campos sensibles (role, coach_id, is_active) los protege el trigger profiles_guard.

-- profiles ---------------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.is_coach_of(id) or (id = auth.uid() and public.is_active_member()));

create policy profiles_update on public.profiles
  for update to authenticated
  using (public.is_coach_of(id) or (id = auth.uid() and public.is_active_member()))
  with check (public.is_coach_of(id) or (id = auth.uid() and public.is_active_member()));

-- exercises --------------------------------------------------------------------------------
-- Un alumno ve el catálogo base y los ejercicios de su coach, sin archivados.
-- El coach ve además todos los suyos, archivados incluidos.
create policy exercises_select on public.exercises
  for select to authenticated
  using (
    public.is_active_member()
    and (
      (archived_at is null and (coach_id is null or coach_id = public.current_coach_id()))
      or (public.is_coach() and coach_id = auth.uid())
    )
  );

create policy exercises_insert on public.exercises
  for insert to authenticated
  with check (public.is_coach() and coach_id = auth.uid());

create policy exercises_update on public.exercises
  for update to authenticated
  using (public.is_coach() and coach_id = auth.uid())
  with check (public.is_coach() and coach_id = auth.uid());

-- Si el ejercicio ya se usó, la FK `on delete restrict` impide borrarlo: se archiva (RF-11).
create policy exercises_delete on public.exercises
  for delete to authenticated
  using (public.is_coach() and coach_id = auth.uid());
