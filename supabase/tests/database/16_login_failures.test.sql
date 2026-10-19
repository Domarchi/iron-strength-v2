-- T131 · RF-6: permisos, umbral, ventanas y bloqueo que no se acorta ni prolonga.
begin;
select plan(11);

select ok(not has_function_privilege('anon', 'public.record_login_failure(text)', 'execute'),
  'anon no puede registrar intentos');
select ok(not has_function_privilege('authenticated', 'public.record_login_failure(text)', 'execute'),
  'authenticated no puede registrar intentos');
select ok(has_function_privilege('service_role', 'public.record_login_failure(text)', 'execute'),
  'solo el servidor registra intentos');

set local role service_role;
delete from public.login_attempts;
select public.record_login_failure(repeat('a', 64));
select is((select failed_count from public.login_attempts), 1, 'primer fallo');
select public.record_login_failure(repeat('a', 64));
select public.record_login_failure(repeat('a', 64));
select public.record_login_failure(repeat('a', 64));
select is((select failed_count from public.login_attempts), 4, 'cuatro fallos');
select is((select locked_until from public.login_attempts), null::timestamptz, 'todavía no bloquea');
select public.record_login_failure(repeat('a', 64));
select is((select failed_count from public.login_attempts), 5, 'quinto fallo');
select ok((select locked_until between now() + interval '14 minutes' and now() + interval '16 minutes'
  from public.login_attempts), 'bloquea quince minutos');

update public.login_attempts set locked_until = now() + interval '10 minutes',
  window_started_at = now() - interval '20 minutes';
select public.record_login_failure(repeat('a', 64));
select is((select locked_until from public.login_attempts), now() + interval '10 minutes',
  'un fallo en vuelo conserva el bloqueo aunque venza la ventana');

update public.login_attempts set locked_until = now() - interval '1 second';
select public.record_login_failure(repeat('a', 64));
select is((select failed_count from public.login_attempts), 1, 'tras vencer el bloqueo reinicia');
select is((select locked_until from public.login_attempts), null::timestamptz, 'ya no está bloqueado');
reset role;
select * from finish();
rollback;
