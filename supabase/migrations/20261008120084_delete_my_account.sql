-- T126 · Borrar la propia cuenta (RF-48; DC-4, DC-32). Solo un alumno activo, solo la suya. Borra el
-- usuario de autenticación y las claves foráneas en cascada eliminan perfil, entrenamientos, series,
-- medidas, fotos (filas), programas asignados, comentarios, marcas de lectura y logros. Los ARCHIVOS
-- de fotos de Storage los borra antes la aplicación con la sesión del propio alumno: borrar filas no
-- borra archivos. No usa la clave de servicio: la función fija su search_path y valida quién llama.

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;

  -- El coach no borra su cuenta desde la app (DC-4); un alumno desactivado tampoco.
  if not exists (
    select 1 from public.profiles p where p.id = uid and p.role = 'student' and p.is_active
  ) then
    raise exception 'Solo un alumno activo puede borrar su cuenta' using errcode = '42501';
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
