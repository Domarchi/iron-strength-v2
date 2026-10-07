-- T29 · validate_invitation: lo único que un visitante sin sesión puede consultar (RF-2, RF-3, DC-5).
begin;
select plan(13);

select tests.setup_basic();

insert into public.invitations (coach_id, email, token_hash, expires_at, used_at) values
  (tests.coach_id(), 'vigente@test.local', 'h-vigente', now() + interval '3 days', null),
  (tests.coach_id(), 'vencida@test.local', 'h-vencida', now() - interval '1 day', null),
  (tests.coach_id(), 'usada@test.local', 'h-usada', now() + interval '3 days', now() - interval '1 hour');

select is_definer('public', 'validate_invitation', array['text'], 'es security definer');

select tests.authenticate_as_anon();

select is((select status from public.validate_invitation('h-vigente')), 'valida', 'invitación vigente');
select is((select email from public.validate_invitation('h-vigente')), 'vigente@test.local',
  'una invitación vigente devuelve el correo invitado');
select is((select status from public.validate_invitation('h-vencida')), 'vencida', 'invitación vencida');
select is((select email from public.validate_invitation('h-vencida')), null,
  'una vencida no revela el correo');
select is((select status from public.validate_invitation('h-usada')), 'usada', 'invitación usada');
select is((select email from public.validate_invitation('h-usada')), null, 'una usada no revela el correo');
select is((select status from public.validate_invitation('no-existe')), 'inexistente', 'token desconocido');
select is((select status from public.validate_invitation('')), 'inexistente', 'token vacío');

select throws_ok($$ select * from public.invitations $$, '42501', null,
  'el visitante no puede leer la tabla de invitaciones');
select throws_ok($$ select * from public.profiles $$, '42501', null,
  'el visitante no puede leer perfiles');
reset role;

select tests.authenticate_as(tests.student_a_id());
select is((select status from public.validate_invitation('h-vigente')), 'valida',
  'también funciona con sesión iniciada');
select is((select count(*)::int from public.invitations), 0, 'y un alumno sigue sin ver la tabla');
reset role;

select * from finish();
rollback;
