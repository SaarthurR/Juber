-- Explicit admin event-request approval outcomes without changing the deployed
-- UUID-returning approve_event_request RPC contract.

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
    created_by
  )
  values (
    v_req.name,
    v_slug,
    v_req.description,
    v_req.venue_label,
    v_req.start_date,
    v_req.end_date,
    true,
    v_user_id
  )
  returning id into v_event_id;

  update public.event_requests
  set status = 'approved',
      reviewed_by = v_user_id,
      reviewed_at = now(),
      approved_event_id = v_event_id
  where id = p_request_id;

  return jsonb_build_object(
    'outcome', 'approved',
    'event_id', v_event_id
  );
end;
$$;

revoke all on function public.approve_event_request_v2(uuid) from public;
revoke all on function public.approve_event_request_v2(uuid) from anon;
grant execute on function public.approve_event_request_v2(uuid)
  to authenticated;
