-- Anti-spam insert rate limits: BEFORE INSERT triggers on messages, rides,
-- ride_requests. Direct PostgREST inserts cannot bypass.

-- ---------------------------------------------------------------------------
-- Composite indexes for bounded per-owner created_at counts
-- ---------------------------------------------------------------------------
create index if not exists messages_sender_created_idx
  on public.messages (sender_id, created_at desc);

create index if not exists rides_driver_created_idx
  on public.rides (driver_id, created_at desc);

create index if not exists ride_requests_rider_created_idx
  on public.ride_requests (rider_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Shared rate-limit checker (trigger-only; not callable from clients)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_insert_rate_limit(
  p_actor_id uuid,
  p_table regclass,
  p_owner_id uuid,
  p_owner_column text,
  p_checks jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check jsonb;
  v_count int;
  v_oldest timestamptz;
  v_retry int;
  v_limit int;
  v_seconds int;
  v_scope text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_actor_id::text || ':' || p_table::text, 0)
  );

  for v_check in select value from jsonb_array_elements(p_checks)
  loop
    v_scope := v_check ->> 'scope';
    v_limit := (v_check ->> 'limit')::int;
    v_seconds := (v_check ->> 'seconds')::int;

    execute format(
      'select count(*)::int, min(created_at)
         from public.%I
        where %I = $1
          and created_at > now() - make_interval(secs => $2)',
      p_table::text,
      p_owner_column
    )
    into v_count, v_oldest
    using p_owner_id, v_seconds;

    if v_count >= v_limit then
      v_retry := greatest(
        1,
        ceil(extract(epoch from (v_oldest + make_interval(secs => v_seconds) - now())))::int
      );
      raise exception using
        errcode = 'JB429',
        message = 'rate_limit_exceeded',
        detail = format('scope=%s', v_scope),
        hint = format('retry_after_seconds=%s', v_retry);
    end if;
  end loop;
end;
$$;

revoke all on function public.enforce_insert_rate_limit(uuid, regclass, uuid, text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Per-table BEFORE INSERT triggers
-- ---------------------------------------------------------------------------
create or replace function public.enforce_message_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  new.created_at := now();

  if v_uid is null then
    return new;
  end if;

  if v_uid is distinct from new.sender_id then
    return new;
  end if;

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
  new.created_at := now();

  if v_uid is null then
    return new;
  end if;

  if v_uid is distinct from new.driver_id then
    return new;
  end if;

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
  new.created_at := now();

  if v_uid is null then
    return new;
  end if;

  if v_uid is distinct from new.rider_id then
    return new;
  end if;

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

drop trigger if exists messages_enforce_rate on public.messages;
create trigger messages_enforce_rate
  before insert on public.messages
  for each row
  execute function public.enforce_message_rate();

drop trigger if exists rides_enforce_rate on public.rides;
create trigger rides_enforce_rate
  before insert on public.rides
  for each row
  execute function public.enforce_ride_rate();

drop trigger if exists ride_requests_enforce_rate on public.ride_requests;
create trigger ride_requests_enforce_rate
  before insert on public.ride_requests
  for each row
  execute function public.enforce_request_rate();

-- ---------------------------------------------------------------------------
-- Contract assertions: grants, search_path, ban_lockout unchanged
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_tables text[] := array[
    'profiles', 'events', 'places', 'rides', 'ride_requests', 'ride_passengers',
    'conversations', 'conversation_participants', 'messages', 'notifications',
    'conversation_hides', 'event_requests', 'profile_contacts', 'reports'
  ];
  v_fn text;
  v_fns text[] := array[
    'public.enforce_insert_rate_limit(uuid,regclass,uuid,text,jsonb)',
    'public.enforce_message_rate()',
    'public.enforce_ride_rate()',
    'public.enforce_request_rate()'
  ];
  v_def text;
begin
  foreach v_table in array v_tables loop
    if not exists (
      select 1
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = v_table
        and p.policyname = 'ban_lockout'
    ) then
      raise exception 'ban_lockout policy missing on %', v_table;
    end if;
  end loop;

  foreach v_fn in array v_fns loop
    if has_function_privilege('anon', v_fn, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception '% must not be directly executable', v_fn;
    end if;

    v_def := pg_get_functiondef(v_fn::regprocedure);
    if v_def not ilike '%search_path%public%' then
      raise exception '% must set search_path = public', v_fn;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'messages'
      and t.tgname = 'messages_enforce_rate'
      and not t.tgisinternal
  ) then
    raise exception 'messages_enforce_rate trigger missing';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'rides'
      and t.tgname = 'rides_enforce_rate'
      and not t.tgisinternal
  ) then
    raise exception 'rides_enforce_rate trigger missing';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'ride_requests'
      and t.tgname = 'ride_requests_enforce_rate'
      and not t.tgisinternal
  ) then
    raise exception 'ride_requests_enforce_rate trigger missing';
  end if;
end $$;
