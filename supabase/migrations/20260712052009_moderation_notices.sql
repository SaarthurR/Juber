-- Current-user moderation notices: ban snapshot, pending appeal, recent warnings.
-- Warnings are read from moderation_actions (append-only); no client table scans.

create or replace function public.get_moderation_notices()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ban jsonb;
  v_warnings jsonb;
  v_has_pending_appeal boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'banned', false,
      'ban', null,
      'has_pending_appeal', false,
      'warnings', '[]'::jsonb
    );
  end if;

  select jsonb_build_object(
    'reason', ub.reason,
    'expires_at', ub.expires_at,
    'created_at', ub.created_at,
    'ban_id', ub.ban_id
  )
  into v_ban
  from public.user_bans ub
  where ub.user_id = v_user_id
    and (ub.expires_at is null or ub.expires_at > now());

  select exists (
    select 1
    from public.appeals a
    where a.user_id = v_user_id
      and a.status = 'pending'
  )
  into v_has_pending_appeal;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ma.id,
        'note', ma.detail ->> 'note',
        'created_at', ma.created_at
      )
      order by ma.created_at desc
    ),
    '[]'::jsonb
  )
  into v_warnings
  from public.moderation_actions ma
  where ma.target_user_id = v_user_id
    and ma.action = 'warning'
    and ma.created_at > now() - interval '90 days';

  return jsonb_build_object(
    'banned', v_ban is not null,
    'ban', v_ban,
    'has_pending_appeal', v_has_pending_appeal,
    'warnings', v_warnings
  );
end;
$$;

revoke all on function public.get_moderation_notices() from public, anon;
grant execute on function public.get_moderation_notices() to authenticated;

do $$
begin
  if not has_function_privilege('authenticated', 'public.get_moderation_notices()', 'EXECUTE') then
    raise exception 'authenticated must execute get_moderation_notices';
  end if;
  if has_function_privilege('anon', 'public.get_moderation_notices()', 'EXECUTE') then
    raise exception 'anon must not execute get_moderation_notices';
  end if;
end $$;
