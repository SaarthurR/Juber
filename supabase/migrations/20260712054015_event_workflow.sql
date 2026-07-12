-- Event workflow: source URLs, approval/rejection notifications, atomic reject RPC.

alter table public.events
  add column if not exists source_url text;

alter table public.events
  drop constraint if exists events_source_url_check,
  add constraint events_source_url_check check (
    source_url is null
    or (
      char_length(source_url) <= 2048
      and source_url ~* '^https?://[^[:space:]]+$'
    )
  );

alter table public.event_requests
  drop constraint if exists event_requests_source_url_check,
  add constraint event_requests_source_url_check check (
    source_url is null
    or (
      char_length(source_url) <= 2048
      and source_url ~* '^https?://[^[:space:]]+$'
    )
  );

alter table public.notifications
  add column if not exists event_id uuid references public.events(id) on delete cascade;

create index if not exists notifications_event_id_idx
  on public.notifications(event_id)
  where event_id is not null;

alter table public.notifications
  drop constraint if exists notifications_type_check,
  add constraint notifications_type_check check (
    type in (
      'seat_requested',
      'seat_confirmed',
      'seat_declined',
      'seat_cancelled',
      'ride_cancelled',
      'request_accepted',
      'new_message',
      'event_request_approved',
      'event_request_rejected'
    )
  );

create or replace function public.approve_event_request_v2(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_req public.event_requests%rowtype;
  v_event_id uuid;
  v_slug text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_banned(v_user_id) then
    raise exception 'account_suspended';
  end if;

  if not public.is_admin() then
    raise exception 'Only admins can approve event requests';
  end if;

  select * into v_req
  from public.event_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'missing', 'event_id', null);
  end if;

  if v_req.status = 'approved' then
    return jsonb_build_object(
      'outcome', 'already_approved',
      'event_id', v_req.approved_event_id
    );
  end if;

  if v_req.status = 'rejected' then
    return jsonb_build_object(
      'outcome', 'already_rejected',
      'event_id', null
    );
  end if;

  v_slug := trim(
    both '-' from lower(
      regexp_replace(
        coalesce(v_req.name, 'event'),
        '[^a-zA-Z0-9]+',
        '-',
        'g'
      )
    )
  );
  if v_slug = '' then
    v_slug := 'event';
  end if;
  if exists (select 1 from public.events e where e.slug = v_slug) then
    v_slug := v_slug || '-' ||
      substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  end if;

  insert into public.events (
    name,
    slug,
    description,
    venue_label,
    start_date,
    end_date,
    is_active,
    created_by,
    source_url
  )
  values (
    v_req.name,
    v_slug,
    v_req.description,
    v_req.venue_label,
    v_req.start_date,
    v_req.end_date,
    true,
    v_user_id,
    v_req.source_url
  )
  returning id into v_event_id;

  update public.event_requests
  set status = 'approved',
      reviewed_by = v_user_id,
      reviewed_at = now(),
      approved_event_id = v_event_id
  where id = p_request_id;

  if v_req.requested_by is not null then
    insert into public.notifications (recipient_id, actor_id, type, event_id)
    values (v_req.requested_by, v_user_id, 'event_request_approved', v_event_id);
  end if;

  return jsonb_build_object(
    'outcome', 'approved',
    'event_id', v_event_id
  );
end;
$$;

create or replace function public.reject_event_request_v2(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_req public.event_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_banned(v_user_id) then
    raise exception 'account_suspended';
  end if;

  if not public.is_admin() then
    raise exception 'Only admins can reject event requests';
  end if;

  select * into v_req
  from public.event_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'missing', 'event_id', null);
  end if;

  if v_req.status = 'approved' then
    return jsonb_build_object(
      'outcome', 'already_approved',
      'event_id', v_req.approved_event_id
    );
  end if;

  if v_req.status = 'rejected' then
    return jsonb_build_object(
      'outcome', 'already_rejected',
      'event_id', null
    );
  end if;

  update public.event_requests
  set status = 'rejected',
      reviewed_by = v_user_id,
      reviewed_at = now()
  where id = p_request_id;

  if v_req.requested_by is not null then
    insert into public.notifications (recipient_id, actor_id, type, event_id)
    values (v_req.requested_by, v_user_id, 'event_request_rejected', null);
  end if;

  return jsonb_build_object(
    'outcome', 'rejected',
    'event_id', null
  );
end;
$$;

revoke all on function public.approve_event_request_v2(uuid) from public;
revoke all on function public.approve_event_request_v2(uuid) from anon;
grant execute on function public.approve_event_request_v2(uuid) to authenticated;

revoke all on function public.reject_event_request_v2(uuid) from public;
revoke all on function public.reject_event_request_v2(uuid) from anon;
grant execute on function public.reject_event_request_v2(uuid) to authenticated;
