-- Moderation integrity: participant-scoped message evidence and
-- concurrency-safe appeals bound to stable ban instances.

-- ============================================================
-- Stable ban identity and one pending appeal per ban instance
-- ============================================================
alter table public.user_bans
  add column ban_id uuid not null default gen_random_uuid();

alter table public.user_bans
  add constraint user_bans_ban_id_key unique (ban_id);

alter table public.appeals
  add column ban_id uuid;

-- Preserve linkage for any legacy appeal that still matches the current ban.
update public.appeals a
set ban_id = ub.ban_id
from public.user_bans ub
where ub.user_id = a.user_id
  and ub.created_at = a.ban_created_at;

-- Unmatched legacy appeals are intentionally stale and can never unban a
-- current ban. The live project had no appeal rows at migration time.
update public.appeals
set ban_id = gen_random_uuid()
where ban_id is null;

alter table public.appeals
  alter column ban_id set not null;

create unique index appeals_pending_ban_instance_idx
  on public.appeals (user_id, ban_id)
  where status = 'pending';

-- ============================================================
-- Immutable, bounded report evidence
-- ============================================================
alter table public.reports
  add constraint reports_message_context_bounded
  check (
    target_type <> 'message'
    or coalesce(
      jsonb_typeof(evidence -> 'context') = 'array'
      and jsonb_array_length(evidence -> 'context') <= 11,
      false
    )
  );

create or replace function public.guard_report_evidence_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.evidence is distinct from old.evidence then
    raise exception 'report evidence is immutable';
  end if;
  return new;
end;
$$;

create trigger report_evidence_immutable
  before update of evidence on public.reports
  for each row execute function public.guard_report_evidence_immutable();

revoke execute on function public.guard_report_evidence_immutable()
  from public, anon, authenticated;

-- ============================================================
-- submit_report: resolve message/conversation/subject from trusted rows
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
  v_message_conversation_id uuid;
  v_message_sender_id uuid;
  v_message_body text;
  v_message_created_at timestamptz;
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
      select
        m.conversation_id,
        m.sender_id,
        m.body,
        m.created_at
      into
        v_message_conversation_id,
        v_message_sender_id,
        v_message_body,
        v_message_created_at
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

      select coalesce(jsonb_agg(jsonb_build_object(
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
        order by
          abs(extract(epoch from (m2.created_at - v_message_created_at))),
          m2.created_at,
          m2.id
        limit 11
      ) ctx;

      v_evidence := jsonb_build_object(
        'body', v_message_body,
        'sender_id', v_message_sender_id,
        'created_at', v_message_created_at,
        'conversation_id', v_message_conversation_id,
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

revoke all on function public.submit_report(text, uuid, text, text)
  from public, anon;
grant execute on function public.submit_report(text, uuid, text, text)
  to authenticated;

-- ============================================================
-- Ban/appeal RPCs: stable instance identity and ordered row locks
-- ============================================================
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
  set ban_id = excluded.ban_id,
      banned_by = excluded.banned_by,
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

create or replace function public.submit_appeal(p_text text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ban_id uuid;
  v_ban_created_at timestamptz;
  v_appeal_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_text is null or char_length(trim(p_text)) = 0 or char_length(trim(p_text)) > 2000 then
    raise exception 'Appeal text must be 1-2000 characters';
  end if;

  select ub.ban_id, ub.created_at
  into v_ban_id, v_ban_created_at
  from public.user_bans ub
  where ub.user_id = v_user_id
    and (ub.expires_at is null or ub.expires_at > now())
  for update;

  if not found then
    raise exception 'Appeals require an active ban';
  end if;

  if exists (
    select 1
    from public.appeals a
    where a.user_id = v_user_id
      and a.ban_id = v_ban_id
      and a.status = 'pending'
  ) then
    raise exception 'A pending appeal already exists';
  end if;

  insert into public.appeals (user_id, ban_id, ban_created_at, text)
  values (v_user_id, v_ban_id, v_ban_created_at, trim(p_text))
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
  v_current_ban_id uuid;
  v_ban_matches boolean := false;
  v_unbanned boolean := false;
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

  select ub.ban_id
  into v_current_ban_id
  from public.user_bans ub
  where ub.user_id = v_appeal.user_id
  for update;

  v_ban_matches := found and v_current_ban_id = v_appeal.ban_id;

  update public.appeals
  set status = p_decision,
      resolved_by = v_user_id,
      resolved_at = now()
  where id = p_appeal_id;

  if p_decision = 'granted' and v_ban_matches then
    delete from public.user_bans
    where user_id = v_appeal.user_id
      and ban_id = v_appeal.ban_id;
    v_unbanned := found;
  end if;

  insert into public.moderation_actions (actor_id, action, target_user_id, detail)
  values (
    v_user_id,
    'appeal_resolved',
    v_appeal.user_id,
    jsonb_build_object(
      'appeal_id', v_appeal.id,
      'appeal_ban_id', v_appeal.ban_id,
      'current_ban_id', v_current_ban_id,
      'decision', p_decision,
      'unbanned', v_unbanned,
      'note', nullif(trim(coalesce(p_note, '')), '')
    )
  );

  return jsonb_build_object(
    'outcome', 'resolved',
    'decision', p_decision,
    'ban_matches', v_ban_matches,
    'unbanned', v_unbanned
  );
end;
$$;

revoke all on function public.admin_ban_user(uuid, text, timestamptz, uuid)
  from public, anon;
revoke all on function public.submit_appeal(text)
  from public, anon;
revoke all on function public.admin_resolve_appeal(uuid, text, text)
  from public, anon;

grant execute on function public.admin_ban_user(uuid, text, timestamptz, uuid)
  to authenticated;
grant execute on function public.submit_appeal(text)
  to authenticated;
grant execute on function public.admin_resolve_appeal(uuid, text, text)
  to authenticated;

-- ============================================================
-- Assertions
-- ============================================================
do $$
declare
  v_submit_report text :=
    pg_get_functiondef('public.submit_report(text,uuid,text,text)'::regprocedure);
  v_submit_appeal text :=
    pg_get_functiondef('public.submit_appeal(text)'::regprocedure);
  v_resolve_appeal text :=
    pg_get_functiondef('public.admin_resolve_appeal(uuid,text,text)'::regprocedure);
begin
  if v_submit_report not ilike '%conversation_participants%'
     or v_submit_report not ilike '%m.sender_id <> v_user_id%'
     or v_submit_report not ilike '%limit 11%' then
    raise exception 'submit_report message evidence guards are incomplete';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.reports'::regclass
      and tgname = 'report_evidence_immutable'
      and tgenabled <> 'D'
  ) then
    raise exception 'report evidence immutability trigger is missing';
  end if;

  if not exists (
    select 1
    from pg_index
    where indexrelid = 'public.appeals_pending_ban_instance_idx'::regclass
      and indisunique
      and indpred is not null
  ) then
    raise exception 'pending appeal uniqueness must be enforced per ban';
  end if;

  if v_submit_appeal not ilike '%for update%'
     or v_submit_appeal not ilike '%a.ban_id = v_ban_id%' then
    raise exception 'submit_appeal must lock and bind the current ban';
  end if;

  if v_resolve_appeal not ilike '%for update%'
     or v_resolve_appeal not ilike '%ban_id = v_appeal.ban_id%' then
    raise exception 'appeal resolution must lock and match the exact ban';
  end if;

  if has_function_privilege('anon', 'public.submit_report(text,uuid,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.submit_appeal(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_resolve_appeal(uuid,text,text)', 'EXECUTE') then
    raise exception 'anon must not execute moderation RPCs';
  end if;

  if not has_function_privilege('authenticated', 'public.submit_report(text,uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.submit_appeal(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.admin_resolve_appeal(uuid,text,text)', 'EXECUTE') then
    raise exception 'authenticated moderation RPC grants must remain intact';
  end if;
end $$;
