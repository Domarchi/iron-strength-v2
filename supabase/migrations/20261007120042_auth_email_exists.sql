-- T42 · ¿Ya existe una cuenta con este correo? (DC-2). Solo service role: un alumno o un
-- visitante no puede usarla para averiguar qué correos están registrados.

create function public.auth_email_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users u where lower(u.email) = lower(btrim(p_email)))
$$;

revoke all on function public.auth_email_exists(text) from public, anon, authenticated;
grant execute on function public.auth_email_exists(text) to service_role;
