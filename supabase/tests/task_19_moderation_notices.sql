\set ON_ERROR_STOP on

\set active_member 00000000-0000-4000-8000-000000019101
\set expired_member 00000000-0000-4000-8000-000000019102
\set admin 00000000-0000-4000-8000-000000019103
\set active_warning 00000000-0000-4000-8000-000000019201
\set old_warning 00000000-0000-4000-8000-000000019202
\set expired_member_warning 00000000-0000-4000-8000-000000019203
\set active_unban_action 00000000-0000-4000-8000-000000019204
\set active_warning_outcome 00000000-0000-4000-8000-000000019301
\set expired_warning_outcome 00000000-0000-4000-8000-000000019302
\set active_unban_outcome 00000000-0000-4000-8000-000000019303

begin;

create or replace function pg_temp.task19_assert(label text, condition boolean)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'assertion failed: %', label;
  end if;
end;
$$;

create or replace function pg_temp.task19_capture_message(statement text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  actual_message text;
begin
  execute statement;
  return null;
exception
  when others then
    get stacked diagnostics actual_message = message_text;
    return actual_message;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data)
values
  (:'active_member', 'task19-active@example.com', '{"full_name":"Task 19 Active"}'),
  (:'expired_member', 'task19-expired@example.com', '{"full_name":"Task 19 Expired"}'),
  (:'admin', 'task19-admin@example.com', '{"full_name":"Task 19 Admin"}')
on conflict (id) do update
set email = excluded.email,
    raw_user_meta_data = excluded.raw_user_meta_data;

insert into public.profiles (id, full_name, is_admin)
values
  (:'active_member', 'Task 19 Active', false),
  (:'expired_member', 'Task 19 Expired', false),
  (:'admin', 'Task 19 Admin', true)
on conflict (id) do update
set full_name = excluded.full_name,
    is_admin = excluded.is_admin;

insert into public.user_bans (
  user_id,
  banned_by,
  reason,
  created_at,
  expires_at
)
values
  (
    :'active_member',
    :'admin',
    'Task 19 active ban',
    now() - interval '1 hour',
    now() + interval '1 day'
  ),
  (
    :'expired_member',
    :'admin',
    'Task 19 expired ban',
    now() - interval '2 days',
    now() - interval '1 day'
  );

insert into public.moderation_actions (
  id,
  actor_id,
  action,
  target_user_id,
  detail,
  created_at
)
values
  (
    :'active_warning',
    :'admin',
    'warning',
    :'active_member',
    '{"note":"Task 19 visible warning"}',
    now() - interval '1 hour'
  ),
  (
    :'old_warning',
    :'admin',
    'warning',
    :'active_member',
    '{"note":"Task 19 expired warning"}',
    now() - interval '91 days'
  ),
  (
    :'expired_member_warning',
    :'admin',
    'warning',
    :'expired_member',
    '{"note":"Task 19 other member warning"}',
    now() - interval '2 hours'
  ),
  (
    :'active_unban_action',
    :'admin',
    'unban',
    :'active_member',
    '{"member_reason":"Task 19 safe compensation reason","internal_note":"Task 19 private compensation note"}',
    now() - interval '30 minutes'
  );

insert into public.moderation_outcomes (
  id,
  recipient_id,
  source_action_id,
  type,
  created_at
)
values
  (
    :'active_warning_outcome',
    :'active_member',
    :'active_warning',
    'warning',
    now() - interval '1 hour'
  ),
  (
    :'expired_warning_outcome',
    :'expired_member',
    :'expired_member_warning',
    'warning',
    now() - interval '2 hours'
  ),
  (
    :'active_unban_outcome',
    :'active_member',
    :'active_unban_action',
    'unban',
    now() - interval '30 minutes'
  );

select pg_temp.task19_assert(
  'anon_cannot_execute_notices',
  not has_function_privilege('anon', 'public.get_moderation_notices()', 'EXECUTE')
);

select pg_temp.task19_assert(
  'authenticated_can_execute_notices',
  has_function_privilege('authenticated', 'public.get_moderation_notices()', 'EXECUTE')
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'active_member', true);

select pg_temp.task19_assert(
  'active ban is visible to its user',
  (
    with payload as (
      select public.get_moderation_notices() as notice
    )
    select (notice ->> 'banned')::boolean
      and notice -> 'ban' ->> 'reason' = 'Task 19 active ban'
      and notice -> 'ban' ->> 'ban_id' is not null
    from payload
  )
);

select pg_temp.task19_assert(
  'recent self warning is visible and scoped',
  (
    with payload as (
      select public.get_moderation_notices() as notice
    )
    select jsonb_array_length(notice -> 'warnings') = 1
      and notice -> 'warnings' -> 0 ->> 'id' = :'active_warning'
      and notice -> 'warnings' -> 0 ->> 'note' = 'Task 19 visible warning'
      and notice -> 'warnings' -> 0 ->> 'outcome_id' = :'active_warning_outcome'
      and notice::text not like '%Task 19 expired warning%'
      and notice::text not like '%Task 19 other member warning%'
    from payload
  )
);

select pg_temp.task19_assert(
  'outcome outbox is self-scoped and exposes only the safe compensation reason',
  (
    with payload as (
      select public.get_moderation_notices() as notice
    )
    select jsonb_array_length(notice -> 'outcomes') = 2
      and exists (
        select 1
        from jsonb_array_elements(notice -> 'outcomes') item
        where item ->> 'id' = :'active_warning_outcome'
          and item ->> 'type' = 'warning'
          and item -> 'member_reason' = 'null'::jsonb
      )
      and exists (
        select 1
        from jsonb_array_elements(notice -> 'outcomes') item
        where item ->> 'id' = :'active_unban_outcome'
          and item ->> 'type' = 'unban'
          and item ->> 'member_reason' = 'Task 19 safe compensation reason'
      )
      and notice::text not like '%Task 19 private compensation note%'
      and notice::text not like '%' || :'expired_warning_outcome' || '%'
    from payload
  )
);

select pg_temp.task19_assert(
  'outcome table RLS and acknowledgement reject another recipient',
  (select count(*) = 2 from public.moderation_outcomes)
  and not public.acknowledge_moderation_outcome(:'expired_warning_outcome'::uuid)
);

select pg_temp.task19_assert(
  'own outcome acknowledgement succeeds',
  public.acknowledge_moderation_outcome(:'active_unban_outcome'::uuid)
);
select acknowledged_at::text as value
from public.moderation_outcomes
where id = :'active_unban_outcome'::uuid
\gset first_ack_
select pg_temp.task19_assert(
  'own outcome acknowledgement is monotonic and idempotent',
  public.acknowledge_moderation_outcome(:'active_unban_outcome'::uuid)
  and (select acknowledged_at::text = :'first_ack_value'
       from public.moderation_outcomes
       where id = :'active_unban_outcome'::uuid)
);

select pg_temp.task19_assert(
  'banned user can call notices RPC',
  pg_temp.task19_capture_message(
    'select public.get_moderation_notices()'
  ) is null
);

select pg_temp.task19_assert(
  'banned user remains blocked from protected RPCs',
  pg_temp.task19_capture_message(
    format(
      'select public.get_contact(%L::uuid)',
      :'active_member'
    )
  ) like '%account_suspended%'
);

select public.submit_appeal('Task 19 rollback-safe appeal');

select pg_temp.task19_assert(
  'banned user appeal is reflected in notices',
  (
    select (public.get_moderation_notices() ->> 'has_pending_appeal')::boolean
  )
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'expired_member', true);

select pg_temp.task19_assert(
  'expired ban is inactive and hidden',
  (
    with payload as (
      select public.get_moderation_notices() as notice
    )
    select not (notice ->> 'banned')::boolean
      and notice -> 'ban' = 'null'::jsonb
    from payload
  )
);

select pg_temp.task19_assert(
  'notice payload never leaks another users moderation state',
  (
    with payload as (
      select public.get_moderation_notices() as notice
    )
    select jsonb_array_length(notice -> 'warnings') = 1
      and notice -> 'warnings' -> 0 ->> 'id' = :'expired_member_warning'
      and jsonb_array_length(notice -> 'outcomes') = 1
      and notice -> 'outcomes' -> 0 ->> 'id' = :'expired_warning_outcome'
      and notice::text not like '%Task 19 active ban%'
      and notice::text not like '%Task 19 visible warning%'
      and notice::text not like '%' || :'active_unban_outcome' || '%'
    from payload
  )
);

reset role;
set local role anon;

select pg_temp.task19_assert(
  'anon invocation is denied',
  pg_temp.task19_capture_message(
    'select public.get_moderation_notices()'
  ) like '%permission denied%'
);

reset role;
rollback;

do $$
begin
  if exists (
    select 1
    from public.profiles
    where id in (
      '00000000-0000-4000-8000-000000019101'::uuid,
      '00000000-0000-4000-8000-000000019102'::uuid,
      '00000000-0000-4000-8000-000000019103'::uuid
    )
  ) or exists (
    select 1
    from auth.users
    where id in (
      '00000000-0000-4000-8000-000000019101'::uuid,
      '00000000-0000-4000-8000-000000019102'::uuid,
      '00000000-0000-4000-8000-000000019103'::uuid
    )
  ) or exists (
    select 1
    from public.moderation_actions
    where id in (
      '00000000-0000-4000-8000-000000019201'::uuid,
      '00000000-0000-4000-8000-000000019202'::uuid,
      '00000000-0000-4000-8000-000000019203'::uuid,
      '00000000-0000-4000-8000-000000019204'::uuid
    )
  ) or exists (
    select 1
    from public.moderation_outcomes
    where id in (
      '00000000-0000-4000-8000-000000019301'::uuid,
      '00000000-0000-4000-8000-000000019302'::uuid,
      '00000000-0000-4000-8000-000000019303'::uuid
    )
  ) then
    raise exception 'task_19 fixtures survived rollback';
  end if;
end;
$$;
