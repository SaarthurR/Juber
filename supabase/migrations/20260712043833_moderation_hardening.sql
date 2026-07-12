-- Moderation hardening: location RPC ban guards, RPC-only report/appeal inserts,
-- serialized submit_report rate-limit, and grant/policy closure.

-- ============================================================
-- Location definer RPC ban guards (0035/0036 surface)
-- ============================================================
create or replace function public.get_home_address()
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is not null and public.is_banned(auth.uid()) then
    raise exception 'account_suspended';
  end if;

  return (
    select c.home_address
    from public.profile_contacts c
    where c.user_id = auth.uid()
  );
end;
$$;

create or replace function public.set_home_address(p_home_address text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_home_address text;
begin
  if v_user_id is null then
    return false;
  end if;
  if public.is_banned(v_user_id) then
    raise exception 'account_suspended';
  end if;

  v_home_address := nullif(trim(coalesce(p_home_address, '')), '');
  if v_home_address is not null and char_length(v_home_address) > 500 then
    raise exception 'Home address must be 500 characters or fewer';
  end if;

  insert into public.profile_contacts (user_id, home_address)
  values (v_user_id, v_home_address)
  on conflict (user_id) do update
    set home_address = excluded.home_address,
        updated_at = now();

  return true;
end;
$$;

create or replace function public.ride_meetup_location(p_ride_id uuid)
returns table (
  pickup_location text,
  dropoff_location text,
  pickup_note text,
  passenger_id uuid
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is not null and public.is_banned(auth.uid()) then
    raise exception 'account_suspended';
  end if;

  return query
  select
    r.pickup_location,
    r.dropoff_location,
    pn.pickup_note,
    rp.passenger_id
  from public.rides r
  left join public.ride_passengers rp
    on rp.ride_id = r.id
   and rp.status in ('pending', 'confirmed')
   and (
     r.driver_id = auth.uid()
     or public.is_admin()
     or (
       rp.passenger_id = auth.uid()
       and rp.status = 'confirmed'
     )
   )
  left join public.ride_passenger_pickup_notes pn
    on pn.ride_passenger_id = rp.id
  where r.id = p_ride_id
    and auth.uid() is not null
    and (
      r.driver_id = auth.uid()
      or public.is_admin()
      or exists (
        select 1
        from public.ride_passengers self_rp
        where self_rp.ride_id = r.id
          and self_rp.passenger_id = auth.uid()
          and self_rp.status = 'confirmed'
          and public.shares_booking(r.driver_id)
      )
    );
end;
$$;

revoke execute on function public.ride_meetup_location(uuid) from public, anon;
grant execute on function public.ride_meetup_location(uuid) to authenticated;

revoke execute on function public.get_home_address() from public, anon;
grant execute on function public.get_home_address() to authenticated;

revoke execute on function public.set_home_address(text) from public, anon;
grant execute on function public.set_home_address(text) to authenticated;

-- ============================================================
-- RPC-only report/appeal creation (close PostgREST bypass)
-- ============================================================
drop policy if exists "reports_insert_own" on public.reports;
drop policy if exists "appeals_insert_banned_self" on public.appeals;

revoke insert on table public.reports from authenticated;
revoke insert on table public.appeals from authenticated;

-- ============================================================
-- submit_report: per-reporter advisory lock for rate-limit/dedupe
-- ============================================================
create or replace function public.submit_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_user_id uuid;
  v_evidence jsonb := '{}'::jsonb;
  v_report_id uuid;
  v_msg public.messages%rowtype;
  v_context jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if public.is_banned(v_user_id) then
    raise exception 'account_suspended';
  end if;
  if p_target_type not in ('user', 'ride', 'ride_request', 'message') then
    raise exception 'Invalid report target type';
  end if;
  if p_reason is null or char_length(trim(p_reason)) = 0 or char_length(trim(p_reason)) > 200 then
    raise exception 'Reason must be 1-200 characters';
  end if;
  if p_details is not null and char_length(p_details) > 2000 then
    raise exception 'Details must be 2000 characters or fewer';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('submit_report'),
    hashtext(v_user_id::text)
  );

  if (
    select count(*)
    from public.reports r
    where r.reporter_id = v_user_id
      and r.created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'Report rate limit exceeded';
  end if;
  if (
    select count(*)
    from public.reports r
    where r.reporter_id = v_user_id
      and r.created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'Report rate limit exceeded';
  end if;

  case p_target_type
    when 'user' then
      if not exists (select 1 from public.profiles p where p.id = p_target_id) then
        raise exception 'Report target not found';
      end if;
      v_target_user_id := p_target_id;
      v_evidence := jsonb_build_object('note', nullif(trim(coalesce(p_details, '')), ''));
    when 'message' then
      select * into v_msg
      from public.messages m
      where m.id = p_target_id;
      if v_msg.id is null then
        raise exception 'Report target not found';
      end if;
      v_target_user_id := v_msg.sender_id;
      select coalesce(jsonb_agg(jsonb_build_object(
        'sender_id', ctx.sender_id,
        'body', ctx.body,
        'created_at', ctx.created_at
      ) order by ctx.created_at), '[]'::jsonb)
      into v_context
      from (
        select m2.sender_id, m2.body, m2.created_at
        from public.messages m2
        where m2.conversation_id = v_msg.conversation_id
        order by abs(extract(epoch from (m2.created_at - v_msg.created_at))), m2.created_at
        limit 11
      ) ctx;
      v_evidence := jsonb_build_object(
        'body', v_msg.body,
        'sender_id', v_msg.sender_id,
        'created_at', v_msg.created_at,
        'conversation_id', v_msg.conversation_id,
        'context', v_context
      );
    when 'ride' then
      select r.driver_id,
        jsonb_build_object(
          'origin_label', r.origin_label,
          'destination_label', r.destination_label,
          'depart_at', r.depart_at,
          'notes', r.notes,
          'status', r.status
        )
      into v_target_user_id, v_evidence
      from public.rides r
      where r.id = p_target_id;
      if v_target_user_id is null then
        raise exception 'Report target not found';
      end if;
    when 'ride_request' then
      select rr.rider_id,
        jsonb_build_object(
          'origin_label', rr.origin_label,
          'destination_label', rr.destination_label,
          'depart_at', rr.depart_at,
          'notes', rr.notes,
          'status', rr.status
        )
      into v_target_user_id, v_evidence
      from public.ride_requests rr
      where rr.id = p_target_id;
      if v_target_user_id is null then
        raise exception 'Report target not found';
      end if;
  end case;

  insert into public.reports (
    reporter_id, target_type, target_id, target_user_id,
    reason, details, evidence
  )
  values (
    v_user_id, p_target_type, p_target_id, v_target_user_id,
    trim(p_reason), nullif(trim(coalesce(p_details, '')), ''), v_evidence
  )
  returning id into v_report_id;

  insert into public.moderation_actions (actor_id, action, target_user_id, report_id, detail)
  values (
    v_user_id,
    'report_submitted',
    v_target_user_id,
    v_report_id,
    jsonb_build_object('target_type', p_target_type, 'target_id', p_target_id)
  );

  return v_report_id;
end;
$$;

revoke all on function public.submit_report(text, uuid, text, text) from public, anon;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;

-- ============================================================
-- Assertions
-- ============================================================
do $$
declare
  v_fn text;
  v_fns text[] := array[
    'public.ride_meetup_location(uuid)',
    'public.get_home_address()',
    'public.set_home_address(text)'
  ];
begin
  foreach v_fn in array v_fns loop
    if pg_get_functiondef(v_fn::regprocedure) not ilike '%is_banned%' then
      raise exception '% must guard with is_banned', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'authenticated must execute %', v_fn;
    end if;
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception 'anon must not execute %', v_fn;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'public.reports', 'INSERT') then
    raise exception 'authenticated must not directly insert reports';
  end if;
  if has_table_privilege('authenticated', 'public.appeals', 'INSERT') then
    raise exception 'authenticated must not directly insert appeals';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reports'
      and policyname = 'reports_insert_own'
  ) then
    raise exception 'reports_insert_own bypass policy must be dropped';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'appeals'
      and policyname = 'appeals_insert_banned_self'
  ) then
    raise exception 'appeals_insert_banned_self bypass policy must be dropped';
  end if;

  if pg_get_functiondef('public.submit_report(text,uuid,text,text)'::regprocedure)
     not ilike '%pg_advisory_xact_lock%' then
    raise exception 'submit_report must serialize with pg_advisory_xact_lock';
  end if;
end $$;
