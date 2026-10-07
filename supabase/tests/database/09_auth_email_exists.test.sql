-- T42 · auth_email_exists: solo el servidor puede preguntar si un correo está registrado (DC-2).
begin;
select plan(6);

select tests.setup_basic();

select is_definer('public', 'auth_email_exists', array['text'], 'es security definer');

-- Como service_role (el servidor)
set local role service_role;
select is(public.auth_email_exists(tests.student_a_id()::text || '@test.local'), true, 'detecta un correo registrado');
select is(public.auth_email_exists('  ' || upper(tests.student_a_id()::text) || '@TEST.local '), true,
  'sin distinguir mayúsculas ni espacios');
select is(public.auth_email_exists('nadie@test.local'), false, 'un correo libre da false');
reset role;

-- Alumno y visitante no pueden ejecutarla
select tests.authenticate_as(tests.student_a_id());
select throws_ok($$ select public.auth_email_exists('nadie@test.local') $$, '42501', null,
  'un alumno no puede averiguar correos registrados');
reset role;
select tests.authenticate_as_anon();
select throws_ok($$ select public.auth_email_exists('nadie@test.local') $$, '42501', null,
  'un visitante tampoco');
reset role;

select * from finish();
rollback;
