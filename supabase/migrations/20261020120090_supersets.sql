-- T145: metadatos opcionales compatibles con rutinas existentes.
-- La identidad de grupo se interpreta dentro de su sesión; no hay tabla ni permisos nuevos.
alter table public.session_exercises
  add column rest_seconds smallint check (rest_seconds=0 or rest_seconds between 15 and 600),
  add column superset_id uuid,
  add column superset_rest_seconds smallint check (superset_rest_seconds=0 or superset_rest_seconds between 15 and 600),
  add constraint superset_rest_requires_group check (superset_id is not null or superset_rest_seconds is null);

-- Valida el estado final de una transacción, permitiendo formar/separar grupos completos.
-- Definer solo lee filas para comprobar invariantes, incluidas cascadas de Auth.
create function public.validate_session_supersets() returns trigger language plpgsql security definer set search_path='' as $$
declare v_session uuid;
begin
  for v_session in select distinct id from unnest(array[
    case when tg_op <> 'INSERT' then old.program_session_id end,
    case when tg_op <> 'DELETE' then new.program_session_id end
  ]) id where id is not null loop
    if exists (
      select 1 from (
        select superset_id,superset_rest_seconds,
          row_number() over(order by position,id) as ordinal
        from public.session_exercises where program_session_id=v_session
      ) ordered where superset_id is not null group by superset_id
      having count(*) not between 2 and 4 or max(ordinal)-min(ordinal)+1<>count(*)
        or count(distinct coalesce(superset_rest_seconds,-1))<>1
    ) then raise exception 'Superserie inválida: 2 a 4 ejercicios consecutivos con igual descanso' using errcode='23514'; end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.validate_session_supersets() from public,anon,authenticated;
create constraint trigger z_validate_session_supersets after insert or update or delete on public.session_exercises
  deferrable initially deferred for each row execute function public.validate_session_supersets();

-- Quitar un ejercicio de un grupo de dos deja al restante como ejercicio independiente.
create function public.dissolve_small_superset() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.superset_id is not null and (select count(*) from public.session_exercises
      where program_session_id=old.program_session_id and superset_id=old.superset_id)<2 then
    update public.session_exercises set superset_id=null,superset_rest_seconds=null
      where program_session_id=old.program_session_id and superset_id=old.superset_id;
  end if;
  return null;
end;
$$;
revoke all on function public.dissolve_small_superset() from public,anon,authenticated;
create trigger a_dissolve_small_superset after delete on public.session_exercises
  for each row execute function public.dissolve_small_superset();
