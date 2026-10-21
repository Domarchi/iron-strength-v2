-- T177: copiar y asignar desde una revisión completa, con confirmación estable.
create table public.planning_mutations (
 id uuid primary key,
 program_id uuid not null references public.programs(id) on delete cascade,
 coach_id uuid not null references public.profiles(id) on delete cascade,
 student_id uuid references public.profiles(id) on delete cascade,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 result jsonb not null check(jsonb_typeof(result)='object'),
 created_at timestamptz not null default now()
);
create index planning_mutations_program_idx on public.planning_mutations(program_id);
create index planning_mutations_student_idx on public.planning_mutations(student_id);
alter table public.planning_mutations enable row level security;
create policy planning_mutations_select on public.planning_mutations for select to authenticated
 using(public.is_coach() and coach_id=auth.uid());
create policy planning_mutations_insert on public.planning_mutations for insert to authenticated
 with check(public.is_coach() and coach_id=auth.uid() and
   (student_id is null or public.is_coach_of(student_id)) and
   exists(select 1 from public.programs p where p.id=program_id and p.coach_id=auth.uid()));
revoke all on public.planning_mutations from anon,authenticated;
grant select,insert on public.planning_mutations to authenticated;

create function public.routine_week_snapshot(p_program_id uuid,p_week integer) returns jsonb
 language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'revision',s.revision) order by s.id),'[]'::jsonb)
 from public.program_sessions s where s.program_id=p_program_id and s.week_number=p_week;
$$;
create function public.routine_program_snapshot(p_program_id uuid) returns jsonb
 language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',p.id,'name',p.name,'weeksCount',p.weeks_count,'studentId',p.student_id,
 'startDate',p.start_date,'endsOn',p.ends_on,'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'revision',s.revision,'weekNumber',s.week_number) order by s.id) from public.program_sessions s where s.program_id=p.id),'[]'::jsonb))
 from public.programs p where p.id=p_program_id;
$$;
create function public.planning_assignment_snapshot(p_student_id uuid,p_start_date date,p_end_date date) returns jsonb
 language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'startDate',p.start_date,'endsOn',p.ends_on,
   'workouts',(select count(*) from public.workouts w where w.program_id=p.id)) order by p.id),'[]'::jsonb)
 from public.programs p where p.coach_id=auth.uid() and p.student_id=p_student_id
   and daterange(p.start_date,p.ends_on,'[]') && daterange(p_start_date,p_end_date,'[]');
$$;
revoke all on function public.routine_week_snapshot(uuid,integer),public.routine_program_snapshot(uuid),public.planning_assignment_snapshot(uuid,date,date) from public,anon;
grant execute on function public.routine_week_snapshot(uuid,integer),public.routine_program_snapshot(uuid),public.planning_assignment_snapshot(uuid,date,date) to authenticated;

create function public.copy_program_weeks(p_program_id uuid,p_request_id uuid,p_request jsonb)
 returns integer language plpgsql security invoker set search_path='' as $$
declare
 v_program public.programs%rowtype;
 v_receipt public.planning_mutations%rowtype;
 v_payload jsonb;
 v_from integer;
 v_to integer;
 v_target jsonb;
 v_count integer:=0;
begin
 if not public.is_coach() then raise exception 'Solo el coach puede copiar' using errcode='42501'; end if;
 if p_request_id is null or p_request is null or jsonb_typeof(p_request)<>'object' or
   not(p_request ?& array['sourceWeek','sourceSessions','targets']) or
   jsonb_typeof(p_request->'sourceWeek')<>'number' or jsonb_typeof(p_request->'sourceSessions')<>'array' or jsonb_typeof(p_request->'targets')<>'array' or
   exists(select 1 from jsonb_object_keys(p_request) k where k not in ('sourceWeek','sourceSessions','targets')) then
   raise exception 'Solicitud inválida' using errcode='22023'; end if;
 select * into v_program from public.programs where id=p_program_id and coach_id=auth.uid() for update;
 if not found then raise exception 'Programa no encontrado' using errcode='P0002'; end if;
 v_payload:=jsonb_build_object('operation','copy','request',p_request);
 select * into v_receipt from public.planning_mutations where id=p_request_id;
 if found then
   if v_receipt.program_id<>p_program_id or v_receipt.payload<>v_payload then raise exception 'Petición reutilizada con otro contenido' using errcode='22023'; end if;
   return (v_receipt.result->>'sessions')::integer;
 end if;
 v_from:=(p_request->>'sourceWeek')::integer;
 if v_from not between 1 and v_program.weeks_count or jsonb_array_length(p_request->'targets') not between 1 and 15 then raise exception 'Semanas inválidas' using errcode='22023'; end if;
 for v_target in select value from jsonb_array_elements(p_request->'targets') loop
   if jsonb_typeof(v_target)<>'object' or not(v_target ?& array['week','replace','sessions']) or
     jsonb_typeof(v_target->'week')<>'number' or jsonb_typeof(v_target->'replace')<>'boolean' or jsonb_typeof(v_target->'sessions')<>'array' or
     exists(select 1 from jsonb_object_keys(v_target) k where k not in ('week','replace','sessions')) then
     raise exception 'Destino inválido' using errcode='22023'; end if;
   v_to:=(v_target->>'week')::integer;
   if v_to=v_from or v_to not between 1 and v_program.weeks_count then raise exception 'Destino inválido' using errcode='22023'; end if;
 end loop;
 if (select count(distinct (value->>'week')::integer) from jsonb_array_elements(p_request->'targets'))<>jsonb_array_length(p_request->'targets') then raise exception 'Destinos repetidos' using errcode='22023'; end if;
 -- El bloqueo del programa impide altas concurrentes; las filas bloqueadas estabilizan revisiones.
 perform s.id from public.program_sessions s where s.program_id=p_program_id order by s.id for update;
 if public.routine_week_snapshot(p_program_id,v_from)<>p_request->'sourceSessions' then raise exception 'El origen cambió' using errcode='40001'; end if;
 for v_target in select value from jsonb_array_elements(p_request->'targets') loop
   v_to:=(v_target->>'week')::integer;
   if v_program.student_id is not null and (
     v_program.start_date+((v_to-1)*7)<=date_trunc('week',now() at time zone 'America/Santiago')::date or
     v_program.start_date+((v_to-1)*7)>v_program.ends_on or (now() at time zone 'America/Santiago')::date>v_program.ends_on
   ) then raise exception 'Semana bloqueada' using errcode='55000'; end if;
   if public.routine_week_snapshot(p_program_id,v_to)<>v_target->'sessions' then raise exception 'El destino cambió' using errcode='40001'; end if;
   if not(v_target->>'replace')::boolean and jsonb_array_length(v_target->'sessions')>0 then raise exception 'Confirma el reemplazo del destino' using errcode='P0001'; end if;
 end loop;
 for v_target in select value from jsonb_array_elements(p_request->'targets') order by (value->>'week')::integer loop
   v_count:=v_count+public.copy_program_week(p_program_id,v_from::smallint,(v_target->>'week')::smallint,(v_target->>'replace')::boolean);
 end loop;
 insert into public.planning_mutations(id,program_id,coach_id,payload,result) values(p_request_id,p_program_id,auth.uid(),v_payload,jsonb_build_object('sessions',v_count));
 return v_count;
end;
$$;

create function public.assign_program_reviewed(p_template_id uuid,p_request_id uuid,p_request jsonb)
 returns uuid language plpgsql security invoker set search_path='' as $$
declare
 v_program public.programs%rowtype;
 v_receipt public.planning_mutations%rowtype;
 v_payload jsonb;
 v_student uuid;
 v_start date;
 v_end date;
 v_result uuid;
 v_active boolean;
begin
 if not public.is_coach() then raise exception 'Solo el coach puede asignar' using errcode='42501'; end if;
 if p_request_id is null or p_request is null or jsonb_typeof(p_request)<>'object' or
   not(p_request ?& array['studentId','startDate','source','existing']) or
   jsonb_typeof(p_request->'studentId')<>'string' or jsonb_typeof(p_request->'startDate')<>'string' or
   jsonb_typeof(p_request->'source')<>'object' or jsonb_typeof(p_request->'existing')<>'array' or
   exists(select 1 from jsonb_object_keys(p_request) k where k not in ('studentId','startDate','source','existing')) then
   raise exception 'Solicitud inválida' using errcode='22023'; end if;
 select * into v_program from public.programs where id=p_template_id and coach_id=auth.uid() for update;
 if not found then raise exception 'Programa no encontrado' using errcode='P0002'; end if;
 v_payload:=jsonb_build_object('operation','assign','request',p_request);
 select * into v_receipt from public.planning_mutations where id=p_request_id;
 if found then
   if v_receipt.program_id<>p_template_id or v_receipt.payload<>v_payload then raise exception 'Petición reutilizada con otro contenido' using errcode='22023'; end if;
   v_result:=(v_receipt.result->>'programId')::uuid;
   if not exists(select 1 from public.programs where id=v_result and coach_id=auth.uid()) then raise exception 'La copia confirmada ya no existe' using errcode='P0002'; end if;
   return v_result;
 end if;
 v_student:=(p_request->>'studentId')::uuid;
 v_start:=(p_request->>'startDate')::date;
 v_end:=v_start+v_program.weeks_count*7-1;
 if v_program.student_id is not null or v_start<>date_trunc('week',v_start::timestamp)::date or v_start<date_trunc('week',now() at time zone 'America/Santiago')::date then raise exception 'Revisa la plantilla y el lunes de inicio' using errcode='22023'; end if;
 select is_active into v_active from public.profiles where id=v_student and public.is_coach_of(id) for update;
 if not found then raise exception 'Alumno no autorizado' using errcode='42501'; end if;
 if not v_active then raise exception 'Alumno desactivado' using errcode='22023'; end if;
 -- Las filas de programas impiden que un entrenamiento nuevo aparezca entre revisión y reemplazo.
 perform p.id from public.programs p where p.student_id=v_student and p.coach_id=auth.uid() order by p.id for update;
 perform s.id from public.program_sessions s where s.program_id=p_template_id order by s.id for update;
 if public.routine_program_snapshot(p_template_id)<>p_request->'source' or
    public.planning_assignment_snapshot(v_student,v_start,v_end)<>p_request->'existing' then raise exception 'La planificación cambió desde la revisión' using errcode='40001'; end if;
 v_result:=public.assign_program(p_template_id,v_student,v_start);
 insert into public.planning_mutations(id,program_id,coach_id,student_id,payload,result) values(p_request_id,p_template_id,auth.uid(),v_student,v_payload,jsonb_build_object('programId',v_result));
 return v_result;
end;
$$;
revoke all on function public.copy_program_weeks(uuid,uuid,jsonb),public.assign_program_reviewed(uuid,uuid,jsonb) from public,anon;
grant execute on function public.copy_program_weeks(uuid,uuid,jsonb),public.assign_program_reviewed(uuid,uuid,jsonb) to authenticated;
