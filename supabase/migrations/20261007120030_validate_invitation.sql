-- T30 · validate_invitation (RF-2, RF-3, DC-5).
-- Única superficie pública de las invitaciones: recibe el HASH del token y responde su estado.
-- Solo devuelve el correo invitado cuando la invitación es válida. No expone la tabla.

create function public.validate_invitation(p_token_hash text)
returns table (status text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when i.id is null then 'inexistente'
      when i.used_at is not null then 'usada'
      when i.expires_at <= now() then 'vencida'
      else 'valida'
    end as status,
    case
      when i.used_at is null and i.expires_at > now() then i.email
      else null
    end as email
  from (select 1) as one
  left join public.invitations i on i.token_hash = p_token_hash
$$;

revoke all on function public.validate_invitation(text) from public;
grant execute on function public.validate_invitation(text) to anon, authenticated;
