begin;
select no_plan();
select tests.setup_basic();
insert into public.exercises (id, name, muscle_group) values
  ('e0000000-0000-0000-0000-000000000001', 'Sentadilla', 'Piernas');
insert into public.programs (id, coach_id, name, weeks_count) values
  ('a1000000-0000-0000-0000-000000000001', tests.coach_id(), 'Plantilla', 2);
insert into public.program_sessions (id, program_id, week_number, label) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 1, 'A');
insert into public.session_exercises
  (id, program_session_id, exercise_id, position, sets, reps_min, reps_max, target_weight_kg, note) values
  ('a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 0, 4, 6, 9, 62.5, 'Pausa');

select isnt_definer('public', 'duplicate_routine_item', array['uuid','uuid','uuid'], 'usa RLS del invocante');
select tests.authenticate_as(tests.coach_id());
select is(public.duplicate_routine_item('a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001'),
  'a3000000-0000-0000-0000-000000000002'::uuid, 'duplica ejercicio');
select is((select note from public.session_exercises where id='a3000000-0000-0000-0000-000000000002'), 'Pausa', 'conserva nota');
select is((select target_weight_kg from public.session_exercises where id='a3000000-0000-0000-0000-000000000002'), 62.5::numeric, 'conserva carga');
select is((select position from public.session_exercises where id='a3000000-0000-0000-0000-000000000002'), 1::smallint, 'añade al final');
select lives_ok($$select public.duplicate_routine_item('a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001')$$, 'reintento idempotente');
select is((select count(*)::int from public.session_exercises), 2, 'no duplica en reintento');
select lives_ok($$select public.duplicate_routine_item('a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002')$$, 'duplica sesión');
select is((select label from public.program_sessions where id='a2000000-0000-0000-0000-000000000002'), 'B', 'usa primera letra libre');
select is((select count(*)::int from public.session_exercises where program_session_id='a2000000-0000-0000-0000-000000000002'), 2, 'copia completa');
update public.session_exercises set sets=2 where program_session_id='a2000000-0000-0000-0000-000000000002';
select is((select min(sets)::int from public.session_exercises where program_session_id='a2000000-0000-0000-0000-000000000001'),4,'copias independientes');
select throws_ok($$select public.duplicate_routine_item('a2000000-0000-0000-0000-000000000002', gen_random_uuid(), 'a3000000-0000-0000-0000-000000000001')$$,'P0002',null,'rechaza origen de otra sesión');
reset role;
create function tests.reject_partial_copy() returns trigger language plpgsql as $$
begin
  if new.program_session_id = 'a2000000-0000-0000-0000-000000000003' and new.position = 1 then
    raise exception 'Fallo simulado' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger reject_partial_copy before insert on public.session_exercises
  for each row execute function tests.reject_partial_copy();
select tests.authenticate_as(tests.coach_id());
select throws_ok($$select public.duplicate_routine_item('a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003')$$,'23514',null,'fallo en segunda fila cancela la copia');
select is((select count(*)::int from public.program_sessions where id='a2000000-0000-0000-0000-000000000003'),0,'no deja sesión parcial');
select is((select count(*)::int from public.session_exercises where program_session_id='a2000000-0000-0000-0000-000000000003'),0,'no deja primera fila parcial');
insert into public.program_sessions (program_id,week_number,label)
select 'a1000000-0000-0000-0000-000000000001',1,unnest(array['C','D','E','F','G']);
select throws_ok($$select public.duplicate_routine_item('a2000000-0000-0000-0000-000000000001', gen_random_uuid())$$,'23514',null,'límite de siete sesiones');
insert into public.session_exercises (program_session_id,exercise_id,position,sets,reps_min,reps_max)
select 'a2000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',n,3,8,12 from generate_series(2,14) n;
select throws_ok($$select public.duplicate_routine_item('a2000000-0000-0000-0000-000000000001', gen_random_uuid(), 'a3000000-0000-0000-0000-000000000001')$$,'23514',null,'límite de quince ejercicios');
reset role;
update public.exercises set archived_at=now();
select tests.authenticate_as(tests.coach_id());
select throws_ok($$select public.duplicate_routine_item('a2000000-0000-0000-0000-000000000001', gen_random_uuid())$$,'22023',null,'no copia ejercicios archivados');
reset role;
update public.exercises set archived_at=null;
update public.programs set student_id=tests.student_a_id(), start_date=tests.current_monday()-7, ends_on=tests.current_monday()+6;
select tests.authenticate_as(tests.coach_id());
select throws_ok($$select public.duplicate_routine_item('a2000000-0000-0000-0000-000000000001', gen_random_uuid())$$,'55000',null,'bloquea semana pasada');
select throws_ok($$insert into public.program_sessions(program_id,week_number,label) values
  ('a1000000-0000-0000-0000-000000000001',2,'A')$$,'55000',null,'tampoco crea una sesión directamente en semana actual');
-- Fixture existente de semana actual, fuera de la identidad autenticada.
reset role;
insert into public.program_sessions(id,program_id,week_number,label) values
  ('a2000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000001',2,'A');
select tests.authenticate_as(tests.coach_id());
select throws_ok($$select public.duplicate_routine_item('a2000000-0000-0000-0000-000000000004', gen_random_uuid())$$,'55000',null,'bloquea semana actual según RF-17');
reset role;
select tests.authenticate_as(tests.student_a_id());
select throws_ok($$select public.duplicate_routine_item('a2000000-0000-0000-0000-000000000001', gen_random_uuid())$$,'42501',null,'alumno dueño no puede copiar');
reset role;
select tests.authenticate_as(tests.student_b_id());
select throws_ok($$select public.duplicate_routine_item('a2000000-0000-0000-0000-000000000001', gen_random_uuid())$$,'42501',null,'alumno ajeno no puede copiar');
reset role;
select tests.authenticate_as_anon();
select throws_ok($$select public.duplicate_routine_item('a2000000-0000-0000-0000-000000000001', gen_random_uuid())$$,'42501',null,'anónimo sin permiso');
reset role;
update public.profiles set is_active=false where id=tests.coach_id();
select tests.authenticate_as(tests.coach_id());
select throws_ok($$select public.duplicate_routine_item('a2000000-0000-0000-0000-000000000001', gen_random_uuid())$$,'42501',null,'coach desactivado no puede copiar');
reset role;
select * from finish();
rollback;
