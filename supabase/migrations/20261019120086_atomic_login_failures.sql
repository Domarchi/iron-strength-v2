-- T131 · RF-6: incremento atómico entre todas las instancias del servidor.
-- Solo service_role puede llamar esta función o acceder a login_attempts.
create function public.record_login_failure(p_email_hash text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash de correo inválido' using errcode = '22023';
  end if;

  insert into public.login_attempts as attempts
    (email_hash, failed_count, window_started_at, locked_until)
  values (p_email_hash, 1, v_now, null)
  on conflict (email_hash) do update set
    failed_count = case
      when attempts.locked_until is not null
        or attempts.window_started_at <= v_now - interval '15 minutes' then 1
      else attempts.failed_count + 1
    end,
    window_started_at = case
      when attempts.locked_until is not null
        or attempts.window_started_at <= v_now - interval '15 minutes' then v_now
      else attempts.window_started_at
    end,
    locked_until = case
      when attempts.locked_until is not null
        or attempts.window_started_at <= v_now - interval '15 minutes' then null
      when attempts.failed_count + 1 >= 5 then v_now + interval '15 minutes'
      else null
    end
  -- Un fallo que ya estaba en vuelo no modifica un bloqueo activo.
  where attempts.locked_until is null or attempts.locked_until <= v_now;
end;
$$;

revoke all on function public.record_login_failure(text) from public, anon, authenticated;
grant execute on function public.record_login_failure(text) to service_role;
