-- T18 · Utilidades compartidas por los tests de base de datos.
-- Este archivo NO usa transacción: deja el esquema `tests` instalado en la base LOCAL de pruebas.
-- Nunca se aplica a producción (vive en supabase/tests, no en supabase/migrations).

create extension if not exists pgtap with schema extensions;
create schema if not exists tests;

-- Identificadores fijos para leer mejor los tests.
create or replace function tests.coach_id() returns uuid language sql immutable
  as $$ select 'c0000000-0000-0000-0000-000000000001'::uuid $$;
create or replace function tests.student_a_id() returns uuid language sql immutable
  as $$ select 'a0000000-0000-0000-0000-00000000000a'::uuid $$;
create or replace function tests.student_b_id() returns uuid language sql immutable
  as $$ select 'b0000000-0000-0000-0000-00000000000b'::uuid $$;

-- Crea un usuario de auth y su perfil (se ejecuta como superusuario, sin RLS).
create or replace function tests.create_profile(
  uid uuid, user_role public.user_role, full_name text, coach uuid default null
) returns void language plpgsql as $$
begin
  insert into auth.users (id, aud, role, email)
  values (uid, 'authenticated', 'authenticated', uid::text || '@test.local');
  insert into public.profiles (id, role, full_name, coach_id)
  values (uid, user_role, full_name, coalesce(coach, uid));
end;
$$;

-- Coach + alumno A + alumno B, todos activos.
create or replace function tests.setup_basic() returns void language plpgsql as $$
begin
  -- Los tests no dependen del catálogo base de seed.sql: dentro de cada transacción parten vacíos.
  delete from public.exercises;
  perform tests.create_profile(tests.coach_id(), 'coach', 'Coach');
  perform tests.create_profile(tests.student_a_id(), 'student', 'Alumno A', tests.coach_id());
  perform tests.create_profile(tests.student_b_id(), 'student', 'Alumno B', tests.coach_id());
end;
$$;

-- Actúa como un usuario autenticado (rol + claims). Volver con `reset role;`.
create or replace function tests.authenticate_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Actúa como visitante sin sesión.
create or replace function tests.authenticate_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
end;
$$;

grant usage on schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- Lunes de la semana actual en hora de Santiago (para tests independientes de la fecha de hoy).
create or replace function tests.current_monday() returns date language sql stable as $$
  select (date_trunc('week', now() at time zone 'America/Santiago'))::date
$$;

select plan(1);
select ok(true, 'utilidades de test instaladas');
select * from finish();
