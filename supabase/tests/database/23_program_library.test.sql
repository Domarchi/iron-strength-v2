begin;
select plan(13);
select tests.setup_basic();
insert into public.programs(id,coach_id,name,weeks_count) values('b1000000-0000-0000-0000-000000000001',tests.coach_id(),'Biblioteca',2);
insert into public.program_sessions(id,program_id,week_number,label,title) values('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001',1,'A','Tren superior');
select isnt_definer('public','duplicate_program',array['uuid','uuid','text'],'copia con permisos de quien llama');
select tests.authenticate_as(tests.coach_id());
select is(public.duplicate_program('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002','Copia'),
'b1000000-0000-0000-0000-000000000002'::uuid,'copia completa');
select is((select title from public.program_sessions where program_id='b1000000-0000-0000-0000-000000000002'),'Tren superior','conserva título');
select is((select count(*)::int from public.program_copy_receipts),1,'coach ve recibo');
select is(public.duplicate_program('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002','Copia'),
'b1000000-0000-0000-0000-000000000002'::uuid,'reintento confirma misma copia');
select throws_ok($$ select public.duplicate_program('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002','Otro contenido') $$,'22023',null,'no cambia contenido del recibo');
select throws_ok($$ update public.program_sessions set title=repeat('a',81) where id='b2000000-0000-0000-0000-000000000001' $$,'23514',null,'limita título también directamente');
reset role;
select tests.authenticate_as(tests.student_a_id());
select is((select count(*)::int from public.program_copy_receipts),0,'alumno no ve recibos');
select throws_ok($$ select public.duplicate_program('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003','Ajeno') $$,'42501',null,'alumno no duplica');
select throws_ok($$ insert into public.program_copy_receipts(id,coach_id,payload) values('b1000000-0000-0000-0000-000000000001',auth.uid(),'{}') $$,'42501',null,'alumno no fabrica recibos');
reset role;
select tests.authenticate_as_anon();
select throws_ok($$ select public.duplicate_program('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003','Ajeno') $$,'42501',null,'visitante no duplica');
reset role;
select tests.authenticate_as(tests.coach_id());
delete from public.programs where id='b1000000-0000-0000-0000-000000000001';
select is(public.duplicate_program('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002','Copia'),
'b1000000-0000-0000-0000-000000000002'::uuid,'recibo confirma aun borrado el origen');
delete from public.programs where id='b1000000-0000-0000-0000-000000000002';
select is((select count(*)::int from public.program_copy_receipts),0,'recibo cae con la copia');
reset role;
select * from finish();
rollback;
