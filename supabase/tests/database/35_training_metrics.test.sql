begin;
select no_plan();
select has_function('public','valid_training_metrics',array['jsonb'],'contrato canónico también en SQL');
select has_function('public','valid_training_prescription',array['jsonb'],'objetivos también en SQL');
create function tests.training_metrics(kind text) returns jsonb language sql immutable as $$
 select jsonb_build_object('recordType',kind,
  'weightKg',case when kind is null or kind in('weight_reps','weighted_bodyweight','assisted_bodyweight','weight_duration','weight_distance') then 30 end,
  'reps',case when kind is null or kind in('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight') then 8 end,
  'durationSeconds',case when kind in('duration','weight_duration','distance_duration') then 60 end,
  'distanceMeters',case when kind in('distance_duration','weight_distance') then 30.5 end)
$$;
select ok(public.valid_training_metrics(tests.training_metrics(kind)),coalesce(kind,'legado')||' admite sus dimensiones')
 from unnest(array[null,'weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration','weight_duration','distance_duration','weight_distance']) t(kind);
select ok(not public.valid_training_metrics(jsonb_set(tests.training_metrics(t.kind),array[k.key],case when tests.training_metrics(t.kind)->k.key='null' then '1'::jsonb else 'null'::jsonb end)),coalesce(t.kind,'legado')||' rechaza dimensión incorrecta '||k.key)
 from unnest(array[null,'weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration','weight_duration','distance_duration','weight_distance']) t(kind)
 cross join unnest(array['weightKg','reps','durationSeconds','distanceMeters']) k(key);
select ok(not public.valid_training_metrics(jsonb_set(tests.training_metrics('weight_reps'),'{weightKg}',v)), 'peso inválido '||v::text)
 from unnest(array['-1','500.01','0.001','"30"','true','[]','{}']::jsonb[]) t(v);
select ok(not public.valid_training_metrics(jsonb_set(tests.training_metrics('duration'),'{durationSeconds}',v)), 'duración inválida '||v::text)
 from unnest(array['0','86401','1.5','"60"']::jsonb[]) t(v);
select ok(not public.valid_training_metrics(jsonb_set(tests.training_metrics('weight_distance'),'{distanceMeters}',v)), 'distancia inválida '||v::text)
 from unnest(array['0','-1','1000000.01','0.001','"10"']::jsonb[]) t(v);
select ok(not public.valid_training_metrics(tests.training_metrics('future')),'tipo futuro no se degrada al legado');
select ok(not public.valid_training_metrics(tests.training_metrics(null)-'recordType'),'tipo ausente no equivale a null explícito');
select ok(not public.valid_training_metrics(tests.training_metrics(null)||'{"extra":1}'),'campos desconocidos rechazados');
select ok(not public.valid_training_metrics(null),'SQL null no es contrato válido');
select ok(not public.valid_training_metrics('[]'),'array no es contrato válido');
select ok(public.valid_training_set_details(jsonb_build_object('setType',t.kind,'effort',e.effort)),'serie '||t.kind||' y esfuerzo '||coalesce(e.effort::text,'null'))
 from unnest(array['working','warmup','failure','drop']) t(kind) cross join unnest(array[null,1,5.5,10]::numeric[]) e(effort);
select ok(not public.valid_training_set_details(jsonb_build_object('setType','working','effort',v)), 'esfuerzo inválido '||v::text)
 from unnest(array['0','10.5','5.1','"8"','true']::jsonb[]) t(v);
select ok(not public.valid_training_set_details('{"setType":"future","effort":null}'),'tipo de serie futuro no se ignora');
select ok(not public.valid_training_set_details('{"setType":"working"}'),'esfuerzo ausente no equivale a null');
select ok(public.valid_training_note(to_jsonb(repeat(chr(128170),500))),'nota admite500 caracteres Unicode');
select ok(not public.valid_training_note(to_jsonb(repeat(chr(128170),501))),'nota no recorta501 caracteres');
select ok(public.valid_training_note('null'),'nota nullable');
select ok(public.valid_training_note('""'),'nota vacía');
select ok(not public.valid_training_note('5'),'nota no convierte números');
select ok(public.valid_training_note(null),'SQL null de RPC representa nota nullable');
create function tests.training_target(kind text) returns jsonb language sql immutable as $$
 select jsonb_build_object('repsMin',case when kind is null or kind in('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight') then 8 end,
 'repsMax',case when kind is null or kind in('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight') then 12 end,
 'targetWeightKg',case when kind is null or kind in('weight_reps','weighted_bodyweight','assisted_bodyweight','weight_duration','weight_distance') then 30 end,
 'targetDurationSeconds',case when kind in('duration','weight_duration','distance_duration') then 60 end,
 'targetDistanceMeters',case when kind in('distance_duration','weight_distance') then 30.5 end)
$$;
select ok(public.valid_training_prescription(jsonb_build_object('recordType',kind,'sets',2,'target',tests.training_target(kind),'series',null)),coalesce(kind,'legado')||' objetivos uniformes')
 from unnest(array[null,'weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration','weight_duration','distance_duration','weight_distance']) t(kind);
select ok(public.valid_training_prescription(jsonb_build_object('recordType','weight_reps','sets',2,'target',jsonb_set(tests.training_target('weight_reps'),'{targetWeightKg}','null'),
 'series',jsonb_build_array(tests.training_target('weight_reps'),jsonb_set(tests.training_target('weight_reps'),'{targetWeightKg}','25')))),'detalle diferente y resumen coherente');
select ok(not public.valid_training_prescription(jsonb_build_object('recordType','weight_reps','sets',2,'target',tests.training_target('weight_reps'),
 'series',jsonb_build_array(tests.training_target('weight_reps'),jsonb_set(tests.training_target('weight_reps'),'{targetWeightKg}','25')))),'resumen engañoso rechazado');
select ok(not public.valid_training_prescription(jsonb_build_object('recordType','weight_reps','sets',1,'target',tests.training_target('weight_reps'),'series',jsonb_build_array(tests.training_target('weight_reps'),tests.training_target('weight_reps')))),'cantidad exacta de objetivos');
select ok(not public.valid_training_prescription(jsonb_build_object('recordType','duration','sets',2,'target',tests.training_target('weight_reps'),'series',null)),'tiempo no admite reps ficticias');
select ok(not public.valid_training_prescription(jsonb_build_object('recordType','duration','sets',11,'target',tests.training_target('duration'),'series',null)),'límites de prescripción actuales');
select isnt_definer('public','valid_training_metrics',array['jsonb'],'métricas sin privilegios ampliados');
select isnt_definer('public','valid_training_prescription',array['jsonb'],'objetivos sin privilegios ampliados');
select ok(not has_function_privilege('anon','public.valid_training_metrics(jsonb)','EXECUTE'),'anónimo no ejecuta validador');
select ok(has_function_privilege('authenticated','public.valid_training_metrics(jsonb)','EXECUTE'),'cliente autenticado puede validar');
set local role authenticated;
select ok(public.valid_training_metrics('{"recordType":"duration","weightKg":null,"reps":null,"durationSeconds":60,"distanceMeters":null}'),'funciona invoker para cliente autenticado');
reset role;
select * from finish();
rollback;
