begin;
select plan(14);
select tests.setup_basic();
insert into public.programs(id,coach_id,student_id,name,weeks_count,start_date,ends_on) values
 ('90000000-0000-0000-0000-000000000155',tests.coach_id(),tests.student_a_id(),'Días',2,date_trunc('week',now() at time zone 'America/Santiago')::date,date_trunc('week',now() at time zone 'America/Santiago')::date+13);
insert into public.program_sessions(id,program_id,week_number,label,weekday) values
 ('91000000-0000-0000-0000-000000000155','90000000-0000-0000-0000-000000000155',1,'A',2),
 ('91000000-0000-0000-0000-000000000156','90000000-0000-0000-0000-000000000155',2,'A',2);
select tests.authenticate_as(tests.student_a_id());
select lives_ok($$insert into public.session_day_overrides values('91000000-0000-0000-0000-000000000155',tests.student_a_id(),6)$$,'alumno mueve sesión de esta semana');
select throws_ok($$insert into public.session_day_overrides values('91000000-0000-0000-0000-000000000156',tests.student_a_id(),6)$$,'42501',null,'no mueve semana futura');
select throws_ok($$update public.session_day_overrides set weekday=7$$,'23514',null,'día limitado a semana');
select is((select weekday::int from public.program_sessions where id='91000000-0000-0000-0000-000000000155'),2,'prescripción intacta');
reset role;
select tests.authenticate_as(tests.student_b_id());
select is((select count(*)::int from public.session_day_overrides),0,'otro alumno no lee');
select throws_ok($$insert into public.session_day_overrides values('91000000-0000-0000-0000-000000000155',tests.student_b_id(),0)$$,'42501',null,'otro alumno no escribe');
select lives_ok($$delete from public.session_day_overrides$$,'borrar filas ajenas no encuentra datos');
reset role;
select tests.authenticate_as(tests.coach_id());
select is((select count(*)::int from public.session_day_overrides),1,'coach ve el día elegido');
select lives_ok($$update public.session_day_overrides set weekday=0$$,'coach no encuentra filas para editar');
select is((select weekday::int from public.session_day_overrides),6,'elección de alumno intacta');
select throws_ok($$update public.program_sessions set weekday=0 where id='91000000-0000-0000-0000-000000000155'$$,'55000',null,'día prescrito de semana actual bloqueado también por UPDATE');
select throws_ok($$insert into public.program_sessions(program_id,week_number,label,weekday) values('90000000-0000-0000-0000-000000000155',1,'B',3)$$,'55000',null,'no inserta día prescrito en semana actual');
select lives_ok($$update public.program_sessions set weekday=0 where id='91000000-0000-0000-0000-000000000156'$$,'día futuro editable por coach');
reset role;
update public.programs set start_date=start_date-21,ends_on=ends_on-21 where id='90000000-0000-0000-0000-000000000155';
select tests.authenticate_as(tests.student_a_id());
select throws_ok($$update public.session_day_overrides set weekday=0$$,'42501',null,'semana pasada bloqueada');
select * from finish();
rollback;
