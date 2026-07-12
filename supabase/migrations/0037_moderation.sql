-- Moderation contract: reports, bans, appeals, append-only audit,
-- restrictive ban_lockout RLS, and authenticated RPC guards.

-- ============================================================
-- Tables
-- ============================================================
create table public.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_type    text not null check (target_type in ('user', 'ride', 'ride_request', 'message')),
  target_id      uuid not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  reason         text not null check (char_length(reason) between 1 and 200),
  details        text check (details is null or char_length(details) <= 2000),
  evidence       jsonb not null default '{}'::jsonb,
  status         text not null default 'pending'
    check (status in ('pending', 'reviewing', 'actioned', 'dismissed')),
  resolution     text,
  created_at     timestamptz not null default now(),
  reviewed_by    uuid references public.profiles(id),
  reviewed_at    timestamptz
);

create index reports_status_created_idx on public.reports (status, created_at desc);
create index reports_target_idx on public.reports (target_type, target_id);
create index reports_reporter_created_idx on public.reports (reporter_id, created_at desc);
create unique index reports_pending_dedupe_idx
  on public.reports (reporter_id, target_type, target_id)
  where status = 'pending';

create table public.user_bans (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  banned_by  uuid not null references public.profiles(id),
  reason     text not null check (char_length(reason) between 1 and 500),
  report_id  uuid references public.reports(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table public.appeals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  ban_created_at timestamptz not null,
  text           text not null check (char_length(text) between 1 and 2000),
  status         text not null default 'pending'
    check (status in ('pending', 'granted', 'denied')),
  created_at     timestamptz not null default now(),
  resolved_by    uuid references public.profiles(id),
  resolved_at    timestamptz
);

create index appeals_user_status_idx on public.appeals (user_id, status);

create table public.moderation_actions (
  id             uuid primary key default gen_random_uuid(),
  actor_id       uuid not null references public.profiles(id),
  action         text not null check (action in (
    'report_submitted', 'report_status', 'warning', 'ban', 'unban',
    'evidence_view', 'appeal_resolved'
  )),
  target_user_id uuid references public.profiles(id),
  report_id      uuid references public.reports(id) on delete set null,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index moderation_actions_created_idx on public.moderation_actions (created_at desc);
create index moderation_actions_target_idx on public.moderation_actions (target_user_id, created_at desc);

-- ============================================================
-- is_banned helper
-- ============================================================
create or replace function public.is_banned(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_bans ub
    where ub.user_id = p_user_id
      and (ub.expires_at is null or ub.expires_at > now())
  );
$$;

revoke all on function public.is_banned(uuid) from public, anon;
grant execute on function public.is_banned(uuid) to authenticated;

-- ============================================================
-- Append-only guard for moderation_actions
-- ============================================================
create or replace function public.guard_moderation_actions_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'moderation_actions is append-only';
end;
$$;

create trigger moderation_actions_append_only
  before update or delete on public.moderation_actions
  for each row execute function public.guard_moderation_actions_append_only();

revoke execute on function public.guard_moderation_actions_append_only() from public, anon, authenticated;

-- ============================================================
-- RLS
-- ============================================================
alter table public.reports enable row level security;
alter table public.user_bans enable row level security;
alter table public.appeals enable row level security;
alter table public.moderation_actions enable row level security;

create policy "reports_insert_own" on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

create policy "reports_select_own_or_admin" on public.reports
  for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or (select public.is_admin())
  );

create policy "user_bans_select_own_or_admin" on public.user_bans
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
  );

create policy "appeals_insert_banned_self" on public.appeals
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_banned((select auth.uid()))
  );

create policy "appeals_select_own_or_admin" on public.appeals
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
  );

create policy "moderation_actions_select_admin_or_own_warning" on public.moderation_actions
  for select to authenticated
  using (
    (select public.is_admin())
    or (
      action = 'warning'
      and target_user_id = (select auth.uid())
    )
  );

-- ============================================================
-- Moderation RPCs
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

create or replace function public.admin_report_evidence(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.reports%rowtype;
  v_thread jsonb := '[]'::jsonb;
  v_conversation_id uuid;
  v_msg_created_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Only admins can view report evidence';
  end if;

  select * into v_report
  from public.reports r
  where r.id = p_report_id;

  if v_report.id is null then
    raise exception 'Report not found';
  end if;

  if v_report.target_type = 'message' then
    v_conversation_id := (v_report.evidence->>'conversation_id')::uuid;
    v_msg_created_at := (v_report.evidence->>'created_at')::timestamptz;
    if v_conversation_id is not null and v_msg_created_at is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id,
        'sender_id', m.sender_id,
        'body', m.body,
        'created_at', m.created_at
      ) order by m.created_at), '[]'::jsonb)
      into v_thread
      from (
        select m2.id, m2.sender_id, m2.body, m2.created_at
        from public.messages m2
        where m2.conversation_id = v_conversation_id
        order by abs(extract(epoch from (m2.created_at - v_msg_created_at))), m2.created_at
        limit 41
      ) m;
    end if;
  end if;

  insert into public.moderation_actions (actor_id, action, target_user_id, report_id)
  values (auth.uid(), 'evidence_view', v_report.target_user_id, v_report.id);

  return jsonb_build_object(
    'report', jsonb_build_object(
      'id', v_report.id,
      'target_type', v_report.target_type,
      'target_id', v_report.target_id,
      'target_user_id', v_report.target_user_id,
      'reason', v_report.reason,
      'details', v_report.details,
      'status', v_report.status,
      'resolution', v_report.resolution,
      'created_at', v_report.created_at,
      'reviewed_by', v_report.reviewed_by,
      'reviewed_at', v_report.reviewed_at
    ),
    'evidence', v_report.evidence,
    'reporter', (
      select jsonb_build_object(
        'full_name', p.full_name,
        'email', u.email,
        'phone', c.phone
      )
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.profile_contacts c on c.user_id = p.id
      where p.id = v_report.reporter_id
    ),
    'reported', (
      select jsonb_build_object(
        'full_name', p.full_name,
        'email', u.email,
        'phone', c.phone
      )
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.profile_contacts c on c.user_id = p.id
      where p.id = v_report.target_user_id
    ),
    'thread', v_thread
  );
end;
$$;

create or replace function public.admin_set_report_status(
  p_report_id uuid,
  p_status text,
  p_resolution text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_report public.reports%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can review reports';
  end if;
  if p_status not in ('pending', 'reviewing', 'actioned', 'dismissed') then
    raise exception 'Invalid report status';
  end if;

  select * into v_report
  from public.reports r
  where r.id = p_report_id
  for update;

  if v_report.id is null then
    return jsonb_build_object('outcome', 'missing');
  end if;

  if v_report.status in ('actioned', 'dismissed') then
    return jsonb_build_object('outcome', 'already_terminal', 'status', v_report.status);
  end if;

  update public.reports
  set status = p_status,
      resolution = nullif(trim(coalesce(p_resolution, '')), ''),
      reviewed_by = v_user_id,
      reviewed_at = now()
  where id = p_report_id;

  insert into public.moderation_actions (actor_id, action, target_user_id, report_id, detail)
  values (
    v_user_id,
    'report_status',
    v_report.target_user_id,
    p_report_id,
    jsonb_build_object('status', p_status, 'resolution', p_resolution)
  );

  return jsonb_build_object('outcome', 'updated', 'status', p_status);
end;
$$;

create or replace function public.admin_warn_user(
  p_target_user_id uuid,
  p_report_id uuid default null,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can warn users';
  end if;
  if p_target_user_id is null then
    raise exception 'Target user required';
  end if;
  if coalesce((select is_admin from public.profiles where id = p_target_user_id), false) then
    raise exception 'Cannot warn admins';
  end if;

  insert into public.moderation_actions (actor_id, action, target_user_id, report_id, detail)
  values (
    auth.uid(),
    'warning',
    p_target_user_id,
    p_report_id,
    jsonb_build_object('note', nullif(trim(coalesce(p_note, '')), ''))
  );

  return true;
end;
$$;

create or replace function public.admin_ban_user(
  p_target_user_id uuid,
  p_reason text,
  p_expires_at timestamptz default null,
  p_report_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can ban users';
  end if;
  if p_target_user_id is null then
    raise exception 'Target user required';
  end if;
  if p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception 'Ban reason required';
  end if;
  if coalesce((select is_admin from public.profiles where id = p_target_user_id), false) then
    raise exception 'Cannot ban admins';
  end if;

  insert into public.user_bans (user_id, banned_by, reason, report_id, expires_at)
  values (p_target_user_id, auth.uid(), trim(p_reason), p_report_id, p_expires_at)
  on conflict (user_id) do update
  set banned_by = excluded.banned_by,
      reason = excluded.reason,
      report_id = excluded.report_id,
      created_at = now(),
      expires_at = excluded.expires_at;

  insert into public.moderation_actions (actor_id, action, target_user_id, report_id, detail)
  values (
    auth.uid(),
    'ban',
    p_target_user_id,
    p_report_id,
    jsonb_build_object('reason', trim(p_reason), 'expires_at', p_expires_at)
  );

  return true;
end;
$$;

create or replace function public.admin_unban_user(
  p_target_user_id uuid,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can unban users';
  end if;

  delete from public.user_bans where user_id = p_target_user_id;

  if not found then
    return false;
  end if;

  insert into public.moderation_actions (actor_id, action, target_user_id, detail)
  values (
    auth.uid(),
    'unban',
    p_target_user_id,
    jsonb_build_object('note', nullif(trim(coalesce(p_note, '')), ''))
  );

  return true;
end;
$$;

create or replace function public.submit_appeal(p_text text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ban_created_at timestamptz;
  v_appeal_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_banned(v_user_id) then
    raise exception 'Appeals require an active ban';
  end if;
  if p_text is null or char_length(trim(p_text)) = 0 or char_length(trim(p_text)) > 2000 then
    raise exception 'Appeal text must be 1-2000 characters';
  end if;

  if exists (
    select 1 from public.appeals a
    where a.user_id = v_user_id and a.status = 'pending'
  ) then
    raise exception 'A pending appeal already exists';
  end if;

  select ub.created_at into v_ban_created_at
  from public.user_bans ub
  where ub.user_id = v_user_id;

  insert into public.appeals (user_id, ban_created_at, text)
  values (v_user_id, v_ban_created_at, trim(p_text))
  returning id into v_appeal_id;

  return v_appeal_id;
end;
$$;

create or replace function public.admin_resolve_appeal(
  p_appeal_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_appeal public.appeals%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can resolve appeals';
  end if;
  if p_decision not in ('granted', 'denied') then
    raise exception 'Invalid appeal decision';
  end if;

  select * into v_appeal
  from public.appeals a
  where a.id = p_appeal_id
  for update;

  if v_appeal.id is null then
    return jsonb_build_object('outcome', 'missing');
  end if;

  if v_appeal.status <> 'pending' then
    return jsonb_build_object('outcome', 'already_terminal', 'status', v_appeal.status);
  end if;

  update public.appeals
  set status = p_decision,
      resolved_by = v_user_id,
      resolved_at = now()
  where id = p_appeal_id;

  if p_decision = 'granted' then
    delete from public.user_bans where user_id = v_appeal.user_id;
  end if;

  insert into public.moderation_actions (actor_id, action, target_user_id, detail)
  values (
    v_user_id,
    'appeal_resolved',
    v_appeal.user_id,
    jsonb_build_object('decision', p_decision, 'note', nullif(trim(coalesce(p_note, '')), ''))
  );

  return jsonb_build_object('outcome', 'resolved', 'decision', p_decision);
end;
$$;

-- ============================================================
-- Restrictive ban_lockout policies (14 tables)
-- ============================================================
create policy "ban_lockout" on public.profiles
  as restrictive for all to authenticated
  using (not public.is_banned((select auth.uid())));

create policy "ban_lockout" on public.events
  as restrictive for all to authenticated
  using (not public.is_banned((select auth.uid())));

create policy "ban_lockout" on public.places
  as restrictive for all to authenticated
  using (not public.is_banned((select auth.uid())));

create policy "ban_lockout" on public.rides
  as restrictive for all to authenticated
  using (not public.is_banned((select auth.uid())));

create policy "ban_lockout" on public.ride_requests
  as restrictive for all to authenticated
  using (not public.is_banned((select auth.uid())));

create policy "ban_lockout" on public.ride_passengers
  as restrictive for all to authenticated
  using (not public.is_banned((select auth.uid())));

create policy "ban_lockout" on public.conversations
  as restrictive for all to authenticated
  using (not public.is_banned((select auth.uid())));

create policy "ban_lockout" on public.conversation_participants
  as restrictive for all to authenticated
  using (not public.is_banned((select auth.uid())));

create policy "ban_lockout" on public.messages
  as restrictive for all to authenticated
  using (not public.is_banned((select auth.uid())));

create policy "ban_lockout" on public.notifications
  as restrictive for all to authenticated
  using (not public.is_banned((select auth.uid())));

create policy "ban_lockout" on public.conversation_hides
  as restrictive for all to authenticated
  using (not public.is_banned((select auth.uid())));

create policy "ban_lockout" on public.event_requests
  as restrictive for all to authenticated
  using (not public.is_banned((select auth.uid())));

create policy "ban_lockout" on public.profile_contacts
  as restrictive for all to authenticated
  using (not public.is_banned((select auth.uid())));

create policy "ban_lockout" on public.reports
  as restrictive for all to authenticated
  using (not public.is_banned((select auth.uid())));

-- ============================================================
-- Authenticated RPC ban guards (12 functions)
-- ============================================================
create or replace function public.get_contact(p_user_id uuid)
returns table (phone text, whatsapp text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is not null and public.is_banned(auth.uid()) then
    raise exception 'account_suspended';
  end if;

  return query
  select c.phone, c.whatsapp
  from public.profile_contacts c
  where c.user_id = p_user_id
    and (p_user_id = auth.uid() or public.shares_booking(p_user_id));
end;
$$;

create or replace function public.contacts_for_booking(p_user_ids uuid[])
returns table (id uuid, full_name text, phone text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is not null and public.is_banned(auth.uid()) then
    raise exception 'account_suspended';
  end if;

  return query
  select p.id, p.full_name, c.phone
  from public.profiles p
  left join public.profile_contacts c on c.user_id = p.id
  where p.id = any(p_user_ids)
    and (p.id = auth.uid() or public.shares_booking(p.id));
end;
$$;

create or replace function public.conversation_message_summaries(p_conversation_ids uuid[])
returns table (
  conversation_id uuid,
  last_message_id uuid,
  last_sender_id uuid,
  last_body text,
  last_created_at timestamptz,
  last_read_at timestamptz,
  unread_count bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is not null and public.is_banned(auth.uid()) then
    raise exception 'account_suspended';
  end if;

  return query
  with requested as (
    select cp.conversation_id, ch.hidden_at
    from public.conversation_participants cp
    left join public.conversation_hides ch
      on ch.conversation_id = cp.conversation_id
     and ch.user_id = cp.user_id
    where cp.user_id = auth.uid()
      and cp.conversation_id = any(p_conversation_ids)
  )
  select
    requested.conversation_id,
    latest.id,
    latest.sender_id,
    latest.body,
    latest.created_at,
    latest.read_at,
    coalesce(unread.unread_count, 0)
  from requested
  left join lateral (
    select m.id, m.sender_id, m.body, m.created_at, m.read_at
    from public.messages m
    where m.conversation_id = requested.conversation_id
      and (requested.hidden_at is null or m.created_at > requested.hidden_at)
    order by m.created_at desc, m.id desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*)::bigint as unread_count
    from public.messages m
    where m.conversation_id = requested.conversation_id
      and m.sender_id <> auth.uid()
      and m.read_at is null
      and (requested.hidden_at is null or m.created_at > requested.hidden_at)
  ) unread on true;
end;
$$;

create or replace function public.visible_notification_ids(
  p_limit integer default null,
  p_unread_only boolean default false
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is not null and public.is_banned(auth.uid()) then
    raise exception 'account_suspended';
  end if;

  return query
  select n.id
  from public.notifications n
  left join public.conversation_hides ch
    on ch.conversation_id = n.conversation_id
   and ch.user_id = n.recipient_id
  where n.recipient_id = auth.uid()
    and (not p_unread_only or n.read_at is null)
    and (
      n.type <> 'new_message'
      or ch.hidden_at is null
      or n.created_at > ch.hidden_at
    )
  order by n.created_at desc, n.id desc
  limit p_limit;
end;
$$;

create or replace function public.open_conversation(
  p_other_user_id uuid,
  p_ride_id uuid default null,
  p_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if public.is_banned(v_user_id) then
    raise exception 'account_suspended';
  end if;
  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'Invalid conversation participant';
  end if;
  if (p_ride_id is null) = (p_request_id is null) then
    raise exception 'A booked ride or accepted request is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(coalesce(p_ride_id, p_request_id)::text),
    hashtext(least(v_user_id, p_other_user_id)::text || greatest(v_user_id, p_other_user_id)::text)
  );

  select c.id into v_conversation_id
  from public.conversations c
  where c.ride_id is not distinct from p_ride_id
    and c.request_id is not distinct from p_request_id
    and exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id = c.id
        and cp.user_id = v_user_id
    )
    and exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id = c.id
        and cp.user_id = p_other_user_id
    )
  order by c.created_at
  limit 1;

  if v_conversation_id is not null then
    delete from public.conversation_hides
    where conversation_id = v_conversation_id
      and user_id = v_user_id;
    return v_conversation_id;
  end if;

  if p_ride_id is not null and not exists (
    select 1
    from public.rides r
    join public.ride_passengers rp on rp.ride_id = r.id
    where r.id = p_ride_id
      and rp.status = 'confirmed'
      and (
        (r.driver_id = v_user_id and rp.passenger_id = p_other_user_id)
        or (r.driver_id = p_other_user_id and rp.passenger_id = v_user_id)
      )
  ) then
    raise exception 'Messaging unlocks after this ride is booked';
  end if;

  if p_request_id is not null and not exists (
    select 1
    from public.ride_requests rr
    where rr.id = p_request_id
      and rr.status = 'fulfilled'
      and rr.accepted_driver_id is not null
      and (
        (rr.rider_id = v_user_id and rr.accepted_driver_id = p_other_user_id)
        or (rr.rider_id = p_other_user_id and rr.accepted_driver_id = v_user_id)
      )
  ) then
    raise exception 'Messaging unlocks after this request is accepted';
  end if;

  insert into public.conversations (ride_id, request_id)
  values (p_ride_id, p_request_id)
  returning id into v_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conversation_id, v_user_id), (v_conversation_id, p_other_user_id);

  return v_conversation_id;
end;
$$;

create or replace function public.request_seat(
  p_ride_id uuid,
  p_guest_count int default 0,
  p_pickup_note text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ride public.rides%rowtype;
  v_existing public.ride_passengers%rowtype;
  v_confirmed integer;
  v_pickup_note text;
  v_passenger_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if public.is_banned(v_user_id) then
    raise exception 'account_suspended';
  end if;

  if p_guest_count < 0 or p_guest_count > 4 then
    raise exception 'Guest count must be between 0 and 4';
  end if;

  v_pickup_note := nullif(trim(coalesce(p_pickup_note, '')), '');
  if v_pickup_note is not null and char_length(v_pickup_note) > 500 then
    raise exception 'Pickup note must be 500 characters or fewer';
  end if;

  select *
    into v_ride
  from public.rides
  where id = p_ride_id
  for update;

  if v_ride.id is null then
    raise exception 'Ride not found';
  end if;
  if v_ride.driver_id = v_user_id then
    raise exception 'You cannot reserve a seat in your own ride';
  end if;
  if v_ride.status <> 'active' then
    raise exception 'This ride is not accepting reservations';
  end if;
  if v_ride.depart_at <= now() then
    raise exception 'This ride has already departed';
  end if;

  select *
    into v_existing
  from public.ride_passengers
  where ride_id = p_ride_id
    and passenger_id = v_user_id
  for update;

  if v_existing.id is not null and v_existing.status in ('pending', 'confirmed') then
    return 'exists';
  end if;

  select coalesce(sum(1 + guest_count), 0)
    into v_confirmed
  from public.ride_passengers
  where ride_id = p_ride_id
    and status = 'confirmed';

  if v_confirmed + 1 + p_guest_count > v_ride.seats_total then
    raise exception 'This ride is full';
  end if;

  if v_existing.id is null then
    insert into public.ride_passengers (ride_id, passenger_id, status, guest_count)
    values (p_ride_id, v_user_id, 'pending', p_guest_count)
    returning id into v_passenger_id;
  else
    delete from public.ride_passengers
    where id = v_existing.id;

    insert into public.ride_passengers (ride_id, passenger_id, status, guest_count)
    values (p_ride_id, v_user_id, 'pending', p_guest_count)
    returning id into v_passenger_id;
  end if;

  if v_pickup_note is not null then
    insert into public.ride_passenger_pickup_notes (ride_passenger_id, pickup_note)
    values (v_passenger_id, v_pickup_note);
  end if;

  return 'requested';
end;
$$;

create or replace function public.accept_ride_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  if public.is_banned(auth.uid()) then
    raise exception 'account_suspended';
  end if;

  update public.ride_requests
  set status = 'fulfilled',
      accepted_driver_id = auth.uid(),
      accepted_at = now()
  where id = p_request_id
    and status = 'active'
    and rider_id <> auth.uid()
    and coalesce(latest_date, depart_at::date) >= current_date;

  if found then
    insert into public.notifications (recipient_id, actor_id, type, request_id)
    select rider_id, auth.uid(), 'request_accepted', id
    from public.ride_requests
    where id = p_request_id;
  end if;

  return found;
end;
$$;

create or replace function public.confirm_passenger(p_passenger_id uuid, p_ride_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_seats_total int;
  v_status text;
  v_depart_at timestamptz;
  v_confirmed int;
  v_target_id uuid;
begin
  if v_user_id is null then
    return false;
  end if;
  if public.is_banned(v_user_id) then
    raise exception 'account_suspended';
  end if;

  select r.seats_total, r.status, r.depart_at
    into v_seats_total, v_status, v_depart_at
  from public.rides r
  where r.id = p_ride_id
    and r.driver_id = v_user_id
  for update;

  if v_seats_total is null then
    return false;
  end if;

  if v_status <> 'active' or v_depart_at <= now() then
    raise exception 'This ride is not accepting confirmations';
  end if;

  select count(*) into v_confirmed
  from public.ride_passengers
  where ride_id = p_ride_id
    and status = 'confirmed';

  if v_confirmed >= v_seats_total then
    raise exception 'This ride has no seats left';
  end if;

  select id into v_target_id
  from public.ride_passengers
  where ride_id = p_ride_id
    and passenger_id = p_passenger_id
    and status = 'pending'
  for update;

  if v_target_id is null then
    raise exception 'No pending seat request to confirm';
  end if;

  update public.ride_passengers
  set status = 'confirmed'
  where id = v_target_id;

  return true;
end;
$$;

create or replace function public.close_ride(p_ride_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;
  if public.is_banned(v_user_id) then
    raise exception 'account_suspended';
  end if;

  update public.rides
  set status = 'completed'
  where id = p_ride_id
    and driver_id = v_user_id
    and status = 'active';

  if not found then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.cancel_ride(p_ride_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or nullif(trim(p_reason), '') is null then
    return false;
  end if;
  if public.is_banned(v_user_id) then
    raise exception 'account_suspended';
  end if;

  update public.rides
  set status = 'cancelled',
      cancellation_reason = trim(p_reason)
  where id = p_ride_id
    and driver_id = v_user_id
    and status = 'active';

  if not found then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.cancel_seat(p_ride_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_passenger_id uuid;
  v_driver_id uuid;
begin
  if v_user_id is null or nullif(trim(p_reason), '') is null then
    return false;
  end if;
  if public.is_banned(v_user_id) then
    raise exception 'account_suspended';
  end if;

  select p.id, r.driver_id
    into v_passenger_id, v_driver_id
  from public.ride_passengers p
  join public.rides r on r.id = p.ride_id
  where p.ride_id = p_ride_id
    and p.passenger_id = v_user_id
    and p.status in ('pending', 'confirmed')
    and r.status = 'active'
  for update of p;

  if v_passenger_id is null or v_driver_id is null then
    return false;
  end if;

  update public.ride_passengers
  set status = 'cancelled'
  where id = v_passenger_id
    and passenger_id = v_user_id
    and status in ('pending', 'confirmed');

  if not found then
    return false;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, ride_id, message)
  values (v_driver_id, v_user_id, 'seat_cancelled', p_ride_id, trim(p_reason));

  return true;
end;
$$;

create or replace function public.delete_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;
  if public.is_banned(v_user_id) then
    raise exception 'account_suspended';
  end if;

  if not exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = v_user_id
  ) then
    return false;
  end if;

  insert into public.conversation_hides (conversation_id, user_id, hidden_at)
  values (p_conversation_id, v_user_id, now())
  on conflict (conversation_id, user_id)
  do update set hidden_at = excluded.hidden_at;

  update public.notifications
  set read_at = now()
  where recipient_id = v_user_id
    and conversation_id = p_conversation_id
    and type = 'new_message'
    and read_at is null;

  return true;
end;
$$;

-- ============================================================
-- Grants
-- ============================================================
revoke all on table public.reports from public, anon;
revoke all on table public.user_bans from public, anon;
revoke all on table public.appeals from public, anon;
revoke all on table public.moderation_actions from public, anon;

grant select, insert on table public.reports to authenticated;
grant select on table public.user_bans to authenticated;
grant select, insert on table public.appeals to authenticated;
grant select on table public.moderation_actions to authenticated;

revoke all on function public.submit_report(text, uuid, text, text) from public, anon;
revoke all on function public.admin_report_evidence(uuid) from public, anon;
revoke all on function public.admin_set_report_status(uuid, text, text) from public, anon;
revoke all on function public.admin_warn_user(uuid, uuid, text) from public, anon;
revoke all on function public.admin_ban_user(uuid, text, timestamptz, uuid) from public, anon;
revoke all on function public.admin_unban_user(uuid, text) from public, anon;
revoke all on function public.submit_appeal(text) from public, anon;
revoke all on function public.admin_resolve_appeal(uuid, text, text) from public, anon;

grant execute on function public.submit_report(text, uuid, text, text) to authenticated;
grant execute on function public.admin_report_evidence(uuid) to authenticated;
grant execute on function public.admin_set_report_status(uuid, text, text) to authenticated;
grant execute on function public.admin_warn_user(uuid, uuid, text) to authenticated;
grant execute on function public.admin_ban_user(uuid, text, timestamptz, uuid) to authenticated;
grant execute on function public.admin_unban_user(uuid, text) to authenticated;
grant execute on function public.submit_appeal(text) to authenticated;
grant execute on function public.admin_resolve_appeal(uuid, text, text) to authenticated;

-- ============================================================
-- Assertions
-- ============================================================
do $$
declare
  v_table text;
  v_tables text[] := array[
    'profiles', 'events', 'places', 'rides', 'ride_requests', 'ride_passengers',
    'conversations', 'conversation_participants', 'messages', 'notifications',
    'conversation_hides', 'event_requests', 'profile_contacts', 'reports'
  ];
  v_mod_tables text[] := array['reports', 'user_bans', 'appeals', 'moderation_actions'];
  v_rpc text;
  v_rpcs text[] := array[
    'public.submit_report(text,uuid,text,text)',
    'public.admin_report_evidence(uuid)',
    'public.admin_set_report_status(uuid,text,text)',
    'public.admin_warn_user(uuid,uuid,text)',
    'public.admin_ban_user(uuid,text,timestamptz,uuid)',
    'public.admin_unban_user(uuid,text)',
    'public.submit_appeal(text)',
    'public.admin_resolve_appeal(uuid,text,text)'
  ];
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

  foreach v_table in array v_mod_tables loop
    if has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       or has_table_privilege('anon', 'public.' || v_table, 'INSERT')
       or has_table_privilege('anon', 'public.' || v_table, 'UPDATE')
       or has_table_privilege('anon', 'public.' || v_table, 'DELETE') then
      raise exception 'anon must have zero privileges on %', v_table;
    end if;
  end loop;

  foreach v_rpc in array v_rpcs loop
    if has_function_privilege('anon', v_rpc, 'EXECUTE') then
      raise exception 'anon must not execute %', v_rpc;
    end if;
    if not has_function_privilege('authenticated', v_rpc, 'EXECUTE') then
      raise exception 'authenticated must execute %', v_rpc;
    end if;
  end loop;

  if public.is_banned('00000000-0000-4000-8000-000000000099'::uuid) is distinct from false then
    raise exception 'is_banned must return false for never-banned users';
  end if;

  if not has_function_privilege('authenticated', 'public.is_banned(uuid)', 'EXECUTE') then
    raise exception 'authenticated must execute is_banned';
  end if;
  if has_function_privilege('anon', 'public.is_banned(uuid)', 'EXECUTE') then
    raise exception 'anon must not execute is_banned';
  end if;
end $$;
