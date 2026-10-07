-- T31 · assign_program (RF-16, RF-18, RF-49, DC-10): copia profunda, lunes y solapamientos.
begin;
select plan(20);

select tests.setup_basic();

insert into public.exercises (id, coach_id, name, muscle_group) values
  ('e0000000-0000-0000-0000-000000000001', null, 'Sentadilla', 'Piernas'),
  ('e0000000-0000-0000-0000-000000000002', null, 'Press de banca', 'Pecho');

-- Plantilla de 2 semanas: sesiones A(2 ej.) y B(1 ej.) en la semana 1, A(1 ej.) en la semana 2
insert into public.programs (id, coach_id, name, weeks_count)
values ('a1000000-0000-0000-0000-000000000001', tests.coach_id(), 'Plantilla', 2);
insert into public.program_sessions (id, program_id, week_number, label) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 1, 'A'),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 1, 'B'),
  ('a2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 2, 'A');
insert into public.session_exercises (program_session_id, exercise_id, position, sets, reps_min, reps_max) values
  ('a2000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 0, 3, 8, 12),
  ('a2000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 1, 3, 8, 12),
  ('a2000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 0, 4, 6, 8),
  ('a2000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 0, 5, 5, 5);

select is_definer('public', 'assign_program', array['uuid', 'uuid', 'date'], 'es security definer');

-- ===== Coach asigna a A =====
select tests.authenticate_as(tests.coach_id());

select lives_ok(
  format($$ select public.assign_program('a1000000-0000-0000-0000-000000000001', %L, %L) $$,
         tests.student_a_id(), tests.current_monday() + 9),
  'el coach asigna la plantilla a un alumno con una fecha de miércoles');
select is((select start_date from public.programs where student_id = tests.student_a_id()),
  tests.current_monday() + 7, 'la fecha se ajusta al lunes de esa semana');
select is((select ends_on from public.programs where student_id = tests.student_a_id()),
  tests.current_monday() + 7 + 13, 'ends_on = inicio + semanas × 7 - 1');
select is((select source_program_id from public.programs where student_id = tests.student_a_id()),
  'a1000000-0000-0000-0000-000000000001'::uuid, 'registra la plantilla de origen');
select is((select count(*)::int from public.program_sessions ps
           join public.programs p on p.id = ps.program_id where p.student_id = tests.student_a_id()),
  3, 'copia las 3 sesiones');
select is((select count(*)::int from public.session_exercises se
           join public.program_sessions ps on ps.id = se.program_session_id
           join public.programs p on p.id = ps.program_id where p.student_id = tests.student_a_id()),
  4, 'copia los 4 ejercicios con su prescripción');

-- Independencia (RF-16): editar la copia no cambia la plantilla, y al revés
update public.session_exercises set sets = 9
 where program_session_id in (
   select ps.id from public.program_sessions ps join public.programs p on p.id = ps.program_id
   where p.student_id = tests.student_a_id());
select is((select max(sets)::int from public.session_exercises
           where program_session_id in (select id from public.program_sessions
                                        where program_id = 'a1000000-0000-0000-0000-000000000001')),
  5, 'editar la copia no altera la plantilla');
update public.session_exercises set sets = 7
 where program_session_id = 'a2000000-0000-0000-0000-000000000003';
select is((select max(sets)::int from public.session_exercises
           where program_session_id in (
             select ps.id from public.program_sessions ps join public.programs p on p.id = ps.program_id
             where p.student_id = tests.student_a_id())),
  9, 'editar la plantilla no altera lo ya asignado');

-- Solapamiento: un programa nuevo recorta el vigente (DC-10)
select lives_ok(
  format($$ select public.assign_program('a1000000-0000-0000-0000-000000000001', %L, %L) $$,
         tests.student_a_id(), tests.current_monday() + 14),
  'asignar un programa que se solapa con el vigente');
select is((select ends_on from public.programs
           where student_id = tests.student_a_id() and start_date = tests.current_monday() + 7),
  tests.current_monday() + 13, 'el programa anterior termina el domingo previo al nuevo');

-- Mismo inicio y sin entrenamientos: se reemplaza
select lives_ok(
  format($$ select public.assign_program('a1000000-0000-0000-0000-000000000001', %L, %L) $$,
         tests.student_a_id(), tests.current_monday() + 14),
  'reasignar con el mismo inicio, sin entrenamientos, reemplaza');
select is((select count(*)::int from public.programs
           where student_id = tests.student_a_id() and start_date = tests.current_monday() + 14),
  1, 'queda un solo programa en esa fecha');

-- Errores y atomicidad
select throws_ok(
  format($$ select public.assign_program('a1000000-0000-0000-0000-000000000001', %L, %L) $$,
         tests.student_a_id(), tests.current_monday() - 7),
  '22023', null, 'no se asigna antes del lunes de la semana actual');
select is((select count(*)::int from public.programs where student_id = tests.student_a_id()),
  2, 'un intento fallido no deja filas');
select throws_ok(
  format($$ select public.assign_program(%L, %L, %L) $$,
         (select id from public.programs where student_id = tests.student_a_id() limit 1),
         tests.student_b_id(), tests.current_monday() + 7),
  'P0002', null, 'no se puede usar un programa ya asignado como plantilla');

-- El coach se asigna a sí mismo (RF-49)
select lives_ok(
  format($$ select public.assign_program('a1000000-0000-0000-0000-000000000001', %L, %L) $$,
         tests.coach_id(), tests.current_monday() + 7),
  'el coach se asigna un programa a sí mismo');
reset role;

-- Entrenamientos existentes bloquean el reemplazo
insert into public.programs (id, coach_id, student_id, name, weeks_count, start_date, ends_on)
values ('a1000000-0000-0000-0000-00000000000b', tests.coach_id(), tests.student_b_id(), 'PB', 2,
        tests.current_monday(), tests.current_monday() + 13);
insert into public.program_sessions (id, program_id, week_number, label)
values ('a2000000-0000-0000-0000-00000000000b', 'a1000000-0000-0000-0000-00000000000b', 1, 'A');
insert into public.workouts (id, student_id, program_id, program_session_id, started_at, finished_at, duration_seconds)
values ('d0000000-0000-0000-0000-0000000000b1', tests.student_b_id(), 'a1000000-0000-0000-0000-00000000000b',
        'a2000000-0000-0000-0000-00000000000b', now() - interval '2 hours', now() - interval '1 hour', 3600);
select tests.authenticate_as(tests.coach_id());
select throws_ok(
  format($$ select public.assign_program('a1000000-0000-0000-0000-000000000001', %L, %L) $$,
         tests.student_b_id(), tests.current_monday()),
  'P0001', null, 'no reemplaza un programa que ya tiene entrenamientos');
reset role;

-- ===== Quien no es coach =====
select tests.authenticate_as(tests.student_a_id());
select throws_ok(
  format($$ select public.assign_program('a1000000-0000-0000-0000-000000000001', %L, %L) $$,
         tests.student_a_id(), tests.current_monday() + 21),
  '42501', null, 'un alumno no puede asignar programas');
reset role;
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.assign_program('a1000000-0000-0000-0000-000000000001',
       'a0000000-0000-0000-0000-00000000000a', current_date) $$,
  '42501', null, 'un visitante no puede asignar programas');
reset role;

select * from finish();
rollback;
