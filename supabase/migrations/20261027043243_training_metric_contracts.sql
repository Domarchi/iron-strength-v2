-- T215 preparation: pure contracts only. No historical rows or pending receipts change.
create function public.training_metric_dimensions(p_kind text) returns text[]
language sql immutable security invoker set search_path='' as $$
 select case p_kind
  when 'weight_reps' then array['weightKg','reps']
  when 'bodyweight_reps' then array['reps']
  when 'weighted_bodyweight' then array['weightKg','reps']
  when 'assisted_bodyweight' then array['weightKg','reps']
  when 'duration' then array['durationSeconds']
  when 'weight_duration' then array['weightKg','durationSeconds']
  when 'distance_duration' then array['distanceMeters','durationSeconds']
  when 'weight_distance' then array['weightKg','distanceMeters']
  else case when p_kind is null then array['weightKg','reps'] end
 end
$$;

create function public.valid_training_number(p_value jsonb,p_min numeric,p_max numeric,p_step numeric) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare n numeric;
begin
 if jsonb_typeof(p_value) is distinct from 'number' or p_min is null or p_max is null or p_step is null or p_step<=0 or p_max<p_min then return false; end if;
 n:=p_value::text::numeric;
 return n between p_min and p_max and mod(n,p_step)=0;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end;
$$;

create function public.valid_training_metrics(p_metrics jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare dims text[]; k text; v jsonb;
begin
 if jsonb_typeof(p_metrics) is distinct from 'object'
  or not(p_metrics ?& array['recordType','weightKg','reps','durationSeconds','distanceMeters'])
  or p_metrics-array['recordType','weightKg','reps','durationSeconds','distanceMeters']<>'{}'
  or jsonb_typeof(p_metrics->'recordType') not in ('null','string') then return false; end if;
 dims:=public.training_metric_dimensions(p_metrics->>'recordType');
 if dims is null then return false; end if;
 foreach k in array array['weightKg','reps','durationSeconds','distanceMeters'] loop
  v:=p_metrics->k;
  if k=any(dims) then
   if not (case k
    when 'weightKg' then public.valid_training_number(v,0,500,0.01)
    when 'reps' then public.valid_training_number(v,1,100,1)
    when 'durationSeconds' then public.valid_training_number(v,1,86400,1)
    when 'distanceMeters' then public.valid_training_number(v,0.01,1000000,0.01)
   end) then return false; end if;
  elsif v is distinct from 'null'::jsonb then return false;
  end if;
 end loop;
 return true;
end;
$$;

create function public.valid_training_set_details(p_details jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_details) is distinct from 'object'
  or not(p_details ?& array['setType','effort']) or p_details-array['setType','effort']<>'{}'
  or jsonb_typeof(p_details->'setType') is distinct from 'string'
  or p_details->>'setType' not in ('working','warmup','failure','drop') then return false; end if;
 return p_details->'effort'='null'::jsonb or public.valid_training_number(p_details->'effort',1,10,0.5);
end;
$$;

create function public.valid_training_note(p_note jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
 -- PostgREST maps a scalar JSON null RPC argument to SQL NULL. Containers still
 -- require the note key; this scalar helper only checks its nullable value.
 select case when p_note is null or p_note='null'::jsonb then true
  when jsonb_typeof(p_note)='string' then char_length(p_note#>>'{}')<=500
  else false end
$$;

create function public.valid_training_target(p_kind text,p_target jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare dims text[]; v jsonb; k text; dimension text;
begin
 if jsonb_typeof(p_target) is distinct from 'object'
  or not(p_target ?& array['repsMin','repsMax','targetWeightKg','targetDurationSeconds','targetDistanceMeters'])
  or p_target-array['repsMin','repsMax','targetWeightKg','targetDurationSeconds','targetDistanceMeters']<>'{}' then return false; end if;
 dims:=public.training_metric_dimensions(p_kind);
 if dims is null then return false; end if;
 if 'reps'=any(dims) then
  if not public.valid_training_number(p_target->'repsMin',1,100,1)
   or not public.valid_training_number(p_target->'repsMax',1,100,1) then return false; end if;
  if (p_target->>'repsMin')::numeric>(p_target->>'repsMax')::numeric then return false; end if;
 elsif p_target->'repsMin' is distinct from 'null'::jsonb or p_target->'repsMax' is distinct from 'null'::jsonb then return false;
 end if;
 foreach k in array array['targetWeightKg','targetDurationSeconds','targetDistanceMeters'] loop
  v:=p_target->k;
  dimension:=case k when 'targetWeightKg' then 'weightKg' when 'targetDurationSeconds' then 'durationSeconds' else 'distanceMeters' end;
  if v<>'null'::jsonb then
   if not(dimension=any(dims)) then return false; end if;
   if not (case k
    when 'targetWeightKg' then public.valid_training_number(v,0,500,0.01)
    when 'targetDurationSeconds' then public.valid_training_number(v,1,86400,1)
    when 'targetDistanceMeters' then public.valid_training_number(v,0.01,1000000,0.01)
   end) then return false; end if;
  end if;
 end loop;
 return true;
end;
$$;

create function public.valid_training_prescription(p_prescription jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare kind text; target jsonb; series jsonb; t jsonb; summary jsonb:='{}'; k text; value jsonb;
begin
 if jsonb_typeof(p_prescription) is distinct from 'object'
  or not(p_prescription ?& array['recordType','sets','target','series'])
  or p_prescription-array['recordType','sets','target','series']<>'{}'
  or jsonb_typeof(p_prescription->'recordType') not in ('null','string')
  or not public.valid_training_number(p_prescription->'sets',1,10,1) then return false; end if;
 kind:=p_prescription->>'recordType'; target:=p_prescription->'target'; series:=p_prescription->'series';
 if not public.valid_training_target(kind,target) then return false; end if;
 if series='null'::jsonb then return true; end if;
 if jsonb_typeof(series) is distinct from 'array' then return false; end if;
 if jsonb_array_length(series)<>(p_prescription->>'sets')::numeric or jsonb_array_length(series) not between 1 and 10 then return false; end if;
 for t in select item.value from jsonb_array_elements(series) item(value) loop
  if not public.valid_training_target(kind,t) then return false; end if;
 end loop;
 foreach k in array array['repsMin','repsMax','targetWeightKg','targetDurationSeconds','targetDistanceMeters'] loop
  if k='repsMin' then
   select to_jsonb(min((item.value->>k)::numeric)) into value from jsonb_array_elements(series) item(value);
  elsif k='repsMax' then
   select to_jsonb(max((item.value->>k)::numeric)) into value from jsonb_array_elements(series) item(value);
  else
   select case when count(distinct item.value->k)=1 then jsonb_agg(item.value->k)->0 else 'null'::jsonb end into value from jsonb_array_elements(series) item(value);
  end if;
  summary:=summary||jsonb_build_object(k,coalesce(value,'null'::jsonb));
 end loop;
 return summary=target;
end;
$$;

revoke all on function public.training_metric_dimensions(text) from public,anon;
revoke all on function public.valid_training_number(jsonb,numeric,numeric,numeric) from public,anon;
revoke all on function public.valid_training_metrics(jsonb) from public,anon;
revoke all on function public.valid_training_set_details(jsonb) from public,anon;
revoke all on function public.valid_training_note(jsonb) from public,anon;
revoke all on function public.valid_training_target(text,jsonb) from public,anon;
revoke all on function public.valid_training_prescription(jsonb) from public,anon;
grant execute on function public.training_metric_dimensions(text) to authenticated;
grant execute on function public.valid_training_number(jsonb,numeric,numeric,numeric) to authenticated;
grant execute on function public.valid_training_metrics(jsonb) to authenticated;
grant execute on function public.valid_training_set_details(jsonb) to authenticated;
grant execute on function public.valid_training_note(jsonb) to authenticated;
grant execute on function public.valid_training_target(text,jsonb) to authenticated;
grant execute on function public.valid_training_prescription(jsonb) to authenticated;
