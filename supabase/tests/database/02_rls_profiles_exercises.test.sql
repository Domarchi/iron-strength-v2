-- T19 · RLS de profiles y exercises (RF-9 a RF-11, RF-44, DC-5, DC-12).
begin;
select plan(21);

select tests.setup_basic();

-- Catálogo base + ejercicio propio del coach + ejercicio archivado
insert into public.exercises (id, coach_id, name, muscle_group) values
  ('e0000000-0000-0000-0000-000000000001', null, 'Sentadilla', 'Piernas'),
  ('e0000000-0000-0000-0000-000000000002', tests.coach_id(), 'Mi ejercicio', 'Core');
insert into public.exercises (id, coach_id, name, muscle_group, archived_at) values
  ('e0000000-0000-0000-0000-000000000003', tests.coach_id(), 'Viejo', 'Core', now());

-- ===== Alumno A =====
select tests.authenticate_as(tests.student_a_id());

select is((select count(*)::int from public.profiles), 1, 'el alumno ve solo su propio perfil');
select is((select id from public.profiles), tests.student_a_id(), 'y es el suyo');
select is((select count(*)::int from public.profiles where id = tests.student_b_id()), 0,
  'el alumno no ve al otro alumno');
select is((select count(*)::int from public.profiles where id = tests.coach_id()), 0,
  'el alumno no ve el perfil del coach');

update public.profiles set full_name = 'Nuevo nombre' where id = tests.student_a_id();
select is((select full_name from public.profiles where id = tests.student_a_id()), 'Nuevo nombre',
  'el alumno puede cambiar su nombre');
select throws_ok(
  $$ update public.profiles set role = 'coach' where id = 'a0000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'el alumno no puede cambiar su rol');
select throws_ok(
  $$ update public.profiles set coach_id = id where id = 'a0000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'el alumno no puede cambiar su coach_id');
select throws_ok(
  $$ update public.profiles set is_active = false where id = 'a0000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'el alumno no puede desactivarse a sí mismo');
update public.profiles set full_name = 'Hackeado' where id = tests.student_b_id();
select is((select count(*)::int from public.profiles where full_name = 'Hackeado'), 0,
  'el alumno no puede modificar a otro alumno');

select is((select count(*)::int from public.exercises), 2,
  'el alumno ve el catálogo base y los ejercicios de su coach, sin archivados');
select throws_ok(
  $$ insert into public.exercises (coach_id, name, muscle_group)
     values (null, 'Intruso', 'Pecho') $$,
  '42501', null, 'el alumno no crea ejercicios globales');
select throws_ok(
  $$ insert into public.exercises (coach_id, name, muscle_group)
     values ('c0000000-0000-0000-0000-000000000001', 'Intruso 2', 'Pecho') $$,
  '42501', null, 'el alumno no crea ejercicios en nombre del coach');

reset role;

-- ===== Coach =====
select tests.authenticate_as(tests.coach_id());

select is((select count(*)::int from public.profiles), 3, 'el coach ve su perfil y el de sus 2 alumnos');
update public.profiles set is_active = false where id = tests.student_b_id();
select is((select is_active from public.profiles where id = tests.student_b_id()), false,
  'el coach puede desactivar a un alumno');
select throws_ok(
  $$ update public.profiles set is_active = false where id = 'c0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'el coach no puede desactivarse a sí mismo');

insert into public.exercises (coach_id, name, muscle_group)
values (tests.coach_id(), 'Otro propio', 'Pecho');
select is((select count(*)::int from public.exercises where coach_id = tests.coach_id()), 3,
  'el coach crea ejercicios propios y ve también los archivados');
update public.exercises set archived_at = now() where id = 'e0000000-0000-0000-0000-000000000002';
select isnt((select archived_at from public.exercises where id = 'e0000000-0000-0000-0000-000000000002'),
  null, 'el coach archiva sus ejercicios');
update public.exercises set name = 'Editado' where id = 'e0000000-0000-0000-0000-000000000001';
select is((select name from public.exercises where id = 'e0000000-0000-0000-0000-000000000001'),
  'Sentadilla', 'el coach no edita ejercicios del catálogo base');

reset role;

-- ===== Alumno desactivado =====
select tests.authenticate_as(tests.student_b_id());
select is((select count(*)::int from public.profiles), 0, 'un alumno desactivado no ve ni su perfil');
select is((select count(*)::int from public.exercises), 0, 'ni ejercicios');
reset role;

-- ===== Anónimo =====
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.profiles $$, '42501', null, 'el anónimo no accede a profiles');

select * from finish();
rollback;
