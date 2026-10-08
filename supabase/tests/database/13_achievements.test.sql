-- T120 · Logros: RLS, restricciones y permanencia (RF-31, RF-66; DC-28).
begin;
select plan(13);

select tests.setup_basic();

insert into public.achievements (student_id, kind) values
  (tests.student_b_id(), 'first_workout');

-- ===== Alumno A =====
select tests.authenticate_as(tests.student_a_id());

select lives_ok(
  $$ insert into public.achievements (student_id, kind)
     values ('a0000000-0000-0000-0000-00000000000a', 'first_workout') $$,
  'A obtiene su primer logro');
select throws_ok(
  $$ insert into public.achievements (student_id, kind)
     values ('a0000000-0000-0000-0000-00000000000a', 'first_workout') $$,
  '23505', null, 'el mismo logro no se repite');
select throws_ok(
  $$ insert into public.achievements (student_id, kind)
     values ('a0000000-0000-0000-0000-00000000000a', 'inventado') $$,
  '23514', null, 'solo se aceptan tipos del catálogo');
select throws_ok(
  $$ insert into public.achievements (student_id, kind)
     values ('b0000000-0000-0000-0000-00000000000b', 'workouts_10') $$,
  '42501', null, 'A no otorga logros a B');
select is((select count(*)::int from public.achievements), 1, 'A ve solo los suyos');
select throws_ok(
  $$ delete from public.achievements where student_id = 'a0000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'los logros no se borran');
select throws_ok(
  $$ update public.achievements set kind = 'workouts_50' where student_id = 'a0000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'los logros no se modifican');

-- ===== Coach =====
reset role;
select tests.authenticate_as(tests.coach_id());
select is((select count(*)::int from public.achievements), 2, 'el coach ve los logros de sus alumnos');
select throws_ok(
  $$ insert into public.achievements (student_id, kind)
     values ('a0000000-0000-0000-0000-00000000000a', 'workouts_25') $$,
  '42501', null, 'el coach no otorga logros a sus alumnos');

-- ===== Alumno desactivado =====
reset role;
update public.profiles set is_active = false where id = tests.student_a_id();
select tests.authenticate_as(tests.student_a_id());
select is((select count(*)::int from public.achievements), 0, 'un alumno desactivado no ve logros');
select throws_ok(
  $$ insert into public.achievements (student_id, kind)
     values ('a0000000-0000-0000-0000-00000000000a', 'workouts_10') $$,
  '42501', null, 'un alumno desactivado no obtiene logros');

-- ===== Sin sesión =====
reset role;
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.achievements $$, '42501', null, 'sin sesión no se accede a logros');

-- ===== Cascada al borrar la cuenta =====
reset role;
delete from public.profiles where id = tests.student_b_id();
select is((select count(*)::int from public.achievements where student_id = tests.student_b_id()), 0,
  'al borrar al alumno se borran sus logros');

select * from finish();
rollback;
