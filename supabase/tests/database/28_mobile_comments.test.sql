-- T195: reintentos sin duplicar ni revivir comentarios borrados.
begin;
select plan(29);
select tests.setup_basic();
select has_table('public','mobile_comment_receipts','hay recibos privados');
select ok((select relrowsecurity from pg_class where oid='public.mobile_comment_receipts'::regclass),'RLS activa');
select ok(not (select prosecdef from pg_proc where oid='public.publish_mobile_comment(uuid,uuid,text)'::regprocedure),'RPC invoker');
select hasnt_column('public','mobile_comment_receipts','body','no conserva cuerpo borrado');
insert into public.workouts(id,student_id,started_at,finished_at,duration_seconds) values
 ('d1950000-0000-4000-8000-000000000001',tests.student_a_id(),now()-interval '1 hour',now(),3600),
 ('d1950000-0000-4000-8000-000000000002',tests.student_b_id(),now()-interval '1 hour',now(),3600),
 ('d1950000-0000-4000-8000-000000000003',tests.coach_id(),now()-interval '1 hour',now(),3600);
insert into public.comments(id,workout_id,author_id,body) values
 ('c1950000-0000-4000-8000-000000000005','d1950000-0000-4000-8000-000000000001',tests.coach_id(),'Comentario ya existente');
select tests.authenticate_as(tests.student_a_id());
select is(public.publish_mobile_comment('c1950000-0000-4000-8000-000000000001','d1950000-0000-4000-8000-000000000001','Mensaje'),'created','crea A');
select is(public.publish_mobile_comment('c1950000-0000-4000-8000-000000000001','d1950000-0000-4000-8000-000000000001','Mensaje'),'duplicate','confirma mismo intento');
select is((select count(*)::int from public.comments where id='c1950000-0000-4000-8000-000000000001'),1,'una sola fila');
select is(public.publish_mobile_comment('c1950000-0000-4000-8000-000000000001','d1950000-0000-4000-8000-000000000001','Otro'),'conflict','no sobrescribe');
select matches((select body_hash from public.mobile_comment_receipts where comment_id='c1950000-0000-4000-8000-000000000001'),'^[a-f0-9]{64}$','huella SHA-256');
select is(public.publish_mobile_comment(gen_random_uuid(),'d1950000-0000-4000-8000-000000000001',E' \n\t '),'invalid','rechaza vacío');
select is(public.publish_mobile_comment(gen_random_uuid(),'d1950000-0000-4000-8000-000000000001',repeat('x',501)),'invalid','límite SQL de texto');
select is(public.publish_mobile_comment(null,'d1950000-0000-4000-8000-000000000001','Hola'),'invalid','ID obligatorio');
select throws_ok($$insert into public.mobile_comment_receipts(comment_id,workout_id,author_id,body_hash) values(gen_random_uuid(),'d1950000-0000-4000-8000-000000000001',tests.student_b_id(),repeat('0',64))$$,'42501',null,'no suplanta autor');
select throws_ok($$insert into public.mobile_comment_receipts(comment_id,workout_id,author_id,body_hash) values(gen_random_uuid(),'d1950000-0000-4000-8000-000000000002',tests.student_a_id(),repeat('0',64))$$,'42501',null,'no inserta en entrenamiento ajeno');
select throws_ok($$update public.mobile_comment_receipts set body_hash=repeat('0',64)$$,'42501',null,'recibo inmutable');
select throws_ok($$delete from public.mobile_comment_receipts$$,'42501',null,'no elimina recibo para reintentar');
reset role;
select tests.authenticate_as(tests.student_b_id());
select is((select count(*)::int from public.mobile_comment_receipts),0,'B no ve recibos A');
select is(public.publish_mobile_comment(gen_random_uuid(),'d1950000-0000-4000-8000-000000000001','Ajeno'),'not_found','B no publica sobre A');
reset role;
select tests.authenticate_as(tests.coach_id());
select is((select count(*)::int from public.mobile_comment_receipts),0,'coach no ve recibos ajenos');
select is(public.publish_mobile_comment(gen_random_uuid(),'d1950000-0000-4000-8000-000000000001','Ajeno'),'not_found','coach nativo solo propio');
select is(public.publish_mobile_comment('c1950000-0000-4000-8000-000000000003','d1950000-0000-4000-8000-000000000003','Entrené'),'created','coach entrena y comenta');
reset role;
select tests.authenticate_as_anon();
select throws_ok($$select * from public.mobile_comment_receipts$$,'42501',null,'anon no lee recibos');
select throws_ok($$select public.publish_mobile_comment(gen_random_uuid(),'d1950000-0000-4000-8000-000000000001','Ajeno')$$,'42501',null,'anon no ejecuta');
reset role;
select tests.authenticate_as(tests.student_a_id());
select lives_ok($$delete from public.comments where id='c1950000-0000-4000-8000-000000000001'$$,'A borra comentario');
select is(public.publish_mobile_comment('c1950000-0000-4000-8000-000000000001','d1950000-0000-4000-8000-000000000001','Mensaje'),'removed','reintento no revive');
select is((select count(*)::int from public.comments where id='c1950000-0000-4000-8000-000000000001'),0,'permanece borrado');
select is(public.publish_mobile_comment('c1950000-0000-4000-8000-000000000005','d1950000-0000-4000-8000-000000000001','Colisión'),'conflict','ID existente revierte intento entero');
select is((select count(*)::int from public.mobile_comment_receipts where comment_id='c1950000-0000-4000-8000-000000000005'),0,'sin recibo parcial');
reset role;
delete from public.workouts where id='d1950000-0000-4000-8000-000000000003';
select is((select count(*)::int from public.mobile_comment_receipts where comment_id='c1950000-0000-4000-8000-000000000003'),0,'cascada por entrenamiento');
select * from finish();
rollback;
