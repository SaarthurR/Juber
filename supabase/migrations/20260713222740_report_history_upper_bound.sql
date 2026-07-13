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
            and m2.created_at <= v_message_created_at
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

revoke all on function public.submit_report(text, uuid, text, text, boolean)
  from public, anon;
grant execute on function public.submit_report(text, uuid, text, text, boolean)
  to authenticated, service_role;
