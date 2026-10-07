-- T64 · copy_program_week (RF-15): copia profunda, reemplazo explícito y permisos por RLS.
begin;
select plan(17);

select tests.setup_basic();

insert into public.exercises (id, coach_id, name, muscle_group) values
  ('e0000000-0000-0000-0000-000000000001', null, 'Sentadilla', 'Piernas'),
  ('e0000000-0000-0000-0000-000000000002', null, 'Press de banca', 'Pecho');

insert into public.programs (id, coach_id, name, weeks_count)
values ('a1000000-0000-0000-0000-000000000001', tests.coach_id(), 'Plantilla', 3);
insert into public.program_sessions (id, program_id, week_number, label) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 1, 'A'),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 1, 'B'),
  ('a2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 3, 'A');
insert into public.session_exercises (program_session_id, exercise_id, position, sets, reps_min, reps_max, target_weight_kg, note) values
  ('a2000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 0, 3, 8, 12, 60, 'nota'),
  ('a2000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 1, 4, 6, 8, null, null),
  ('a2000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 0, 5, 5, 5, 80, null);

select isnt_definer('public', 'copy_program_week', array['uuid', 'smallint', 'smallint', 'boolean'],
  'se ejecuta con los permisos del que llama (security invoker)');

select tests.authenticate_as(tests.coach_id());

select is(public.copy_program_week('a1000000-0000-0000-0000-000000000001', 1::smallint, 2::smallint), 2,
  'copia las 2 sesiones de la semana 1 a la semana 2');
select is((select count(*)::int from public.program_sessions
           where program_id = 'a1000000-0000-0000-0000-000000000001' and week_number = 2), 2,
  'la semana 2 tiene 2 sesiones');
select is((select count(*)::int from public.session_exercises se
           join public.program_sessions ps on ps.id = se.program_session_id
           where ps.program_id = 'a1000000-0000-0000-0000-000000000001' and ps.week_number = 2), 3,
  'con sus 3 ejercicios');
select is((select se.target_weight_kg::int from public.session_exercises se
           join public.program_sessions ps on ps.id = se.program_session_id
           where ps.program_id = 'a1000000-0000-0000-0000-000000000001' and ps.week_number = 2
             and ps.label = 'A' and se.position = 0), 60, 'conserva la prescripción');
select is((select se.note from public.session_exercises se
           join public.program_sessions ps on ps.id = se.program_session_id
           where ps.program_id = 'a1000000-0000-0000-0000-000000000001' and ps.week_number = 2
             and ps.label = 'A' and se.position = 0), 'nota', 'y las notas');

-- Independencia: editar la copia no cambia el origen
update public.session_exercises set sets = 9
 where program_session_id in (select id from public.program_sessions
   where program_id = 'a1000000-0000-0000-0000-000000000001' and week_number = 2);
select is((select max(se.sets)::int from public.session_exercises se
           join public.program_sessions ps on ps.id = se.program_session_id
           where ps.program_id = 'a1000000-0000-0000-0000-000000000001' and ps.week_number = 1), 5,
  'editar la copia no altera la semana de origen');

-- La semana destino con contenido exige reemplazo explícito
select throws_ok(
  $$ select public.copy_program_week('a1000000-0000-0000-0000-000000000001', 1::smallint, 2::smallint) $$,
  'P0001', null, 'sin reemplazo, no pisa una semana con sesiones');
select is((select count(*)::int from public.program_sessions
           where program_id = 'a1000000-0000-0000-0000-000000000001' and week_number = 2), 2,
  'y la semana destino queda intacta tras el error');
select is(public.copy_program_week('a1000000-0000-0000-0000-000000000001', 1::smallint, 2::smallint, true), 2,
  'con reemplazo, la sobrescribe');
select is((select max(se.sets)::int from public.session_exercises se
           join public.program_sessions ps on ps.id = se.program_session_id
           where ps.program_id = 'a1000000-0000-0000-0000-000000000001' and ps.week_number = 2), 5,
  'y la semana 2 vuelve a ser copia de la 1');

-- Copiar una semana vacía deja la destino vacía (semana de descarga)
select is(public.copy_program_week('a1000000-0000-0000-0000-000000000001', 3::smallint, 2::smallint, true), 1,
  'copiar la semana 3 sobre la 2 con reemplazo');

-- Argumentos inválidos
select throws_ok(
  $$ select public.copy_program_week('a1000000-0000-0000-0000-000000000001', 1::smallint, 1::smallint) $$,
  '22023', null, 'no se copia una semana sobre sí misma');
select throws_ok(
  $$ select public.copy_program_week('a1000000-0000-0000-0000-000000000001', 1::smallint, 4::smallint) $$,
  '22023', null, 'ni a una semana fuera del programa');
select throws_ok(
  $$ select public.copy_program_week('00000000-0000-0000-0000-00000000dead', 1::smallint, 2::smallint) $$,
  'P0002', null, 'programa inexistente');
reset role;

-- Permisos (RLS): un alumno ajeno no ve el programa; el coach de otro no existe
select tests.authenticate_as(tests.student_b_id());
select throws_ok(
  $$ select public.copy_program_week('a1000000-0000-0000-0000-000000000001', 1::smallint, 2::smallint, true) $$,
  'P0002', null, 'un alumno que no ve el programa recibe "no encontrado"');
reset role;

select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.copy_program_week('a1000000-0000-0000-0000-000000000001', 1::smallint, 2::smallint) $$,
  '42501', null, 'un visitante no puede ejecutarla');
reset role;

select * from finish();
rollback;
