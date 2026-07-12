-- Preserve explicit created_at values for service/system and actor-mismatch
-- imports. Authenticated own inserts, including admin inserts, still receive
-- a trusted server timestamp before rate-limit/admin handling.

create or replace function public.enforce_message_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or v_uid is distinct from new.sender_id then
    return new;
  end if;

  new.created_at := now();

  if public.is_admin() then
    return new;
  end if;

  perform public.enforce_insert_rate_limit(
    v_uid,
    'public.messages'::regclass,
    new.sender_id,
    'sender_id',
    '[
      {"scope":"message_burst","limit":30,"seconds":60},
      {"scope":"message_hour","limit":600,"seconds":3600}
    ]'::jsonb
  );

  return new;
end;
$$;

create or replace function public.enforce_ride_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or v_uid is distinct from new.driver_id then
    return new;
  end if;

  new.created_at := now();

  if public.is_admin() then
    return new;
  end if;

  perform public.enforce_insert_rate_limit(
    v_uid,
    'public.rides'::regclass,
    new.driver_id,
    'driver_id',
    '[
      {"scope":"ride_burst","limit":5,"seconds":600},
      {"scope":"ride_day","limit":25,"seconds":86400}
    ]'::jsonb
  );

  return new;
end;
$$;

create or replace function public.enforce_request_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or v_uid is distinct from new.rider_id then
    return new;
  end if;

  new.created_at := now();

  if public.is_admin() then
    return new;
  end if;

  perform public.enforce_insert_rate_limit(
    v_uid,
    'public.ride_requests'::regclass,
    new.rider_id,
    'rider_id',
    '[
      {"scope":"request_burst","limit":5,"seconds":600},
      {"scope":"request_day","limit":25,"seconds":86400}
    ]'::jsonb
  );

  return new;
end;
$$;

revoke all on function public.enforce_message_rate() from public, anon, authenticated;
revoke all on function public.enforce_ride_rate() from public, anon, authenticated;
revoke all on function public.enforce_request_rate() from public, anon, authenticated;

do $$
declare
  v_fn text;
  v_def text;
begin
  foreach v_fn in array array[
    'public.enforce_message_rate()',
    'public.enforce_ride_rate()',
    'public.enforce_request_rate()'
  ]
  loop
    if has_function_privilege('anon', v_fn, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception '% must not be directly executable', v_fn;
    end if;

    v_def := lower(pg_get_functiondef(v_fn::regprocedure));
    if strpos(v_def, 'v_uid is null or v_uid is distinct from new.') = 0
       or strpos(v_def, 'v_uid is null or v_uid is distinct from new.')
          > strpos(v_def, 'new.created_at := now()')
       or strpos(v_def, 'new.created_at := now()')
          > strpos(v_def, 'if public.is_admin()') then
      raise exception '% timestamp/bypass order is incorrect', v_fn;
    end if;

    if v_def not like '%search_path%public%' then
      raise exception '% must set search_path = public', v_fn;
    end if;
  end loop;
end
$$;
