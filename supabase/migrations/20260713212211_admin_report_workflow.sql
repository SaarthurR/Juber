alter table public.notifications
  add column report_id uuid;

alter table public.notifications
  add constraint notifications_report_id_fkey
  foreign key (report_id) references public.reports(id) on delete cascade;

create index notifications_report_id_idx
  on public.notifications (report_id)
  where report_id is not null;

create unique index notifications_report_recipient_unique_idx
  on public.notifications (recipient_id, type, report_id)
  where report_id is not null;

alter table public.notifications
  drop constraint if exists notifications_type_check,
  add constraint notifications_type_check check (
    type in (
      'seat_requested',
      'seat_confirmed',
      'seat_declined',
      'seat_cancelled',
      'ride_cancelled',
      'ride_completed',
      'request_accepted',
      'new_message',
      'event_request_approved',
      'event_request_rejected',
      'moderation_report_submitted'
    )
  );

create or replace function public.submit_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text,
  p_include_message_context boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_user_id uuid;
  v_evidence jsonb := '{}'::jsonb;
  v_report_id uuid;
  v_message_conversation_id uuid;
  v_message_sender_id uuid;
  v_message_body text;
  v_message_created_at timestamptz;
  v_context jsonb := '[]'::jsonb;
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('submit_report'),
    pg_catalog.hashtext(v_user_id::text)
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
      select m.conversation_id, m.sender_id, m.body, m.created_at
      into v_message_conversation_id, v_message_sender_id, v_message_body, v_message_created_at
      from public.messages m
      join public.conversation_participants reporter_cp
        on reporter_cp.conversation_id = m.conversation_id
       and reporter_cp.user_id = v_user_id
      join public.conversation_participants sender_cp
        on sender_cp.conversation_id = m.conversation_id
       and sender_cp.user_id = m.sender_id
      where m.id = p_target_id
        and m.sender_id <> v_user_id
        and not exists (
          select 1
          from public.conversation_participants extra_cp
          where extra_cp.conversation_id = m.conversation_id
            and extra_cp.user_id not in (v_user_id, m.sender_id)
        );

      if not found then
        raise exception 'Report target not found';
      end if;

      v_target_user_id := v_message_sender_id;

      if coalesce(p_include_message_context, false) then
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', ctx.id,
          'sender_id', ctx.sender_id,
          'body', ctx.body,
          'created_at', ctx.created_at
        ) order by ctx.created_at, ctx.id), '[]'::jsonb)
        into v_context
        from (
          select m2.id, m2.sender_id, m2.body, m2.created_at
          from public.messages m2
          where m2.conversation_id = v_message_conversation_id
            and m2.sender_id in (v_user_id, v_target_user_id)
            and m2.id <> p_target_id
          order by
            abs(extract(epoch from (m2.created_at - v_message_created_at))),
            m2.created_at,
            m2.id
          limit 10
        ) ctx;
      end if;

      v_evidence := jsonb_build_object(
        'message_id', p_target_id,
        'body', v_message_body,
        'sender_id', v_message_sender_id,
        'created_at', v_message_created_at,
        'conversation_id', v_message_conversation_id,
        'context_included', coalesce(p_include_message_context, false),
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

  insert into public.notifications (recipient_id, actor_id, type, report_id)
  select p.id, null, 'moderation_report_submitted', v_report_id
  from public.profiles p
  where p.is_admin = true
  on conflict (recipient_id, type, report_id) where report_id is not null do nothing;

  return v_report_id;
end;
$$;

create or replace function public.submit_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.submit_report(
    p_target_type,
    p_target_id,
    p_reason,
    p_details,
    false
  );
$$;

revoke all on function public.submit_report(text, uuid, text, text, boolean)
  from public, anon;
revoke all on function public.submit_report(text, uuid, text, text)
  from public, anon;
grant execute on function public.submit_report(text, uuid, text, text, boolean)
  to authenticated, service_role;
grant execute on function public.submit_report(text, uuid, text, text)
  to authenticated, service_role;

create or replace function public.admin_report_evidence(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
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

  insert into public.moderation_actions (actor_id, action, target_user_id, report_id, detail)
  values (
    auth.uid(),
    'evidence_view',
    v_report.target_user_id,
    v_report.id,
    jsonb_build_object('scope', 'snapshot')
  );

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
      select jsonb_build_object('full_name', p.full_name)
      from public.profiles p
      where p.id = v_report.reporter_id
    ),
    'reported', (
      select jsonb_build_object('full_name', p.full_name)
      from public.profiles p
      where p.id = v_report.target_user_id
    )
  );
end;
$$;

revoke all on function public.admin_report_evidence(uuid)
  from public, anon;
grant execute on function public.admin_report_evidence(uuid)
  to authenticated, service_role;

create or replace function public.admin_warn_user(
  p_target_user_id uuid,
  p_report_id uuid default null,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can warn users';
  end if;
  if p_target_user_id is null then
    raise exception 'Target user required';
  end if;
  if coalesce((select p.is_admin from public.profiles p where p.id = p_target_user_id), false) then
    raise exception 'Cannot warn admins';
  end if;

  if p_report_id is not null then
    select * into v_report
    from public.reports r
    where r.id = p_report_id
    for update;

    if v_report.id is null then
      raise exception 'Report not found';
    end if;
    if v_report.status in ('actioned', 'dismissed') then
      raise exception 'Report is already resolved';
    end if;
    if p_target_user_id is distinct from v_report.reporter_id
       and p_target_user_id is distinct from v_report.target_user_id then
      raise exception 'Warning target is not linked to report';
    end if;
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

revoke all on function public.admin_warn_user(uuid, uuid, text)
  from public, anon;
grant execute on function public.admin_warn_user(uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.admin_unban_user(
  p_target_user_id uuid,
  p_note text,
  p_report_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can unban users';
  end if;
  if p_report_id is null then
    raise exception 'Report required';
  end if;

  select * into v_report
  from public.reports r
  where r.id = p_report_id
  for update;

  if v_report.id is null then
    raise exception 'Report not found';
  end if;
  if v_report.status in ('actioned', 'dismissed') then
    raise exception 'Report is already resolved';
  end if;
  if v_report.target_user_id is distinct from p_target_user_id then
    raise exception 'Report target does not match unbanned user';
  end if;

  delete from public.user_bans where user_id = p_target_user_id;

  if not found then
    return false;
  end if;

  insert into public.moderation_actions (actor_id, action, target_user_id, report_id, detail)
  values (
    auth.uid(),
    'unban',
    p_target_user_id,
    p_report_id,
    jsonb_build_object('note', nullif(trim(coalesce(p_note, '')), ''))
  );

  return true;
end;
$$;

revoke all on function public.admin_unban_user(uuid, text, uuid)
  from public, anon;
grant execute on function public.admin_unban_user(uuid, text, uuid)
  to authenticated, service_role;

revoke all on function public.admin_unban_user(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_unban_user(uuid, text)
  to service_role;

create or replace function public.admin_ban_user(
  p_target_user_id uuid,
  p_reason text,
  p_duration_days integer,
  p_report_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_expires_at timestamptz;
  v_report public.reports%rowtype;
  v_resolution text;
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Only admins can ban users';
  end if;
  if p_target_user_id is null then
    raise exception 'Target user required';
  end if;
  if p_reason is null or char_length(trim(p_reason)) = 0 or char_length(trim(p_reason)) > 500 then
    raise exception 'Ban reason must be 1-500 characters';
  end if;
  if p_duration_days is not null and p_duration_days not in (1, 7, 30) then
    raise exception 'Invalid ban duration';
  end if;
  if coalesce((select p.is_admin from public.profiles p where p.id = p_target_user_id), false) then
    raise exception 'Cannot ban admins';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_target_user_id) then
    raise exception 'Target user not found';
  end if;

  if p_report_id is not null then
    select * into v_report
    from public.reports r
    where r.id = p_report_id
    for update;

    if v_report.id is null then
      raise exception 'Report not found';
    end if;
    if v_report.target_user_id is distinct from p_target_user_id then
      raise exception 'Report target does not match banned user';
    end if;
    if v_report.status in ('actioned', 'dismissed') then
      raise exception 'Report is already resolved';
    end if;
  end if;

  v_expires_at := case
    when p_duration_days is null then null
    else now() + make_interval(days => p_duration_days)
  end;
  v_resolution := case
    when v_expires_at is null then 'Permanent ban'
    else format('Temporary ban until %s', v_expires_at)
  end;

  insert into public.user_bans (user_id, banned_by, reason, report_id, expires_at)
  values (p_target_user_id, v_admin_id, trim(p_reason), p_report_id, v_expires_at)
  on conflict (user_id) do update
  set ban_id = excluded.ban_id,
      banned_by = excluded.banned_by,
      reason = excluded.reason,
      report_id = excluded.report_id,
      created_at = now(),
      expires_at = excluded.expires_at;

  if p_report_id is not null then
    update public.reports
    set status = 'actioned',
        resolution = v_resolution,
        reviewed_by = v_admin_id,
        reviewed_at = now()
    where id = p_report_id;
  end if;

  insert into public.moderation_actions (actor_id, action, target_user_id, report_id, detail)
  values (
    v_admin_id,
    'ban',
    p_target_user_id,
    p_report_id,
    jsonb_build_object(
      'reason', trim(p_reason),
      'duration_days', p_duration_days,
      'expires_at', v_expires_at,
      'report_status', case when p_report_id is null then null else 'actioned' end
    )
  );

  return jsonb_build_object(
    'outcome', 'applied',
    'expires_at', v_expires_at,
    'report_status', case when p_report_id is null then null else 'actioned' end
  );
end;
$$;

revoke all on function public.admin_ban_user(uuid, text, integer, uuid)
  from public, anon;
grant execute on function public.admin_ban_user(uuid, text, integer, uuid)
  to authenticated, service_role;

revoke all on function public.admin_ban_user(uuid, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_ban_user(uuid, text, timestamptz, uuid)
  to service_role;
