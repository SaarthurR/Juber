\set ON_ERROR_STOP on

\set admin_id 00000000-0000-4000-8000-000000020001
\set requester_id 00000000-0000-4000-8000-000000020002
\set pending_request 00000000-0000-4000-8000-000000020101
\set anon_request 00000000-0000-4000-8000-000000020102
\set reject_request 00000000-0000-4000-8000-000000020103
\set legacy_request 00000000-0000-4000-8000-000000020104

begin;

create or replace function pg_temp.task20_assert(
  label text,
  condition boolean
)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'assertion failed: %', label;
  end if;
end;
$$;

create or replace function pg_temp.task20_error_message(statement text)
returns text
language plpgsql
as $$
begin
  execute statement;
  return null;
exception
  when others then
    return sqlerrm;
end;
$$;

grant execute on function pg_temp.task20_error_message(text) to authenticated;

insert into auth.users (id, raw_user_meta_data)
values
  (:'admin_id'::uuid, '{"full_name":"Task 20 Admin"}'),
  (:'requester_id'::uuid, '{"full_name":"Task 20 Requester"}')
on conflict (id) do nothing;

insert into public.profiles (id, full_name, is_admin)
values
  (:'admin_id'::uuid, 'Task 20 Admin', true),
  (:'requester_id'::uuid, 'Task 20 Requester', false)
on conflict (id) do update
set full_name = excluded.full_name,
    is_admin = excluded.is_admin;

delete from public.notifications
where recipient_id in (:'requester_id'::uuid, :'admin_id'::uuid)
  and type in ('event_request_approved', 'event_request_rejected');

delete from public.event_requests
where id in (
  :'pending_request'::uuid,
  :'anon_request'::uuid,
  :'reject_request'::uuid,
  :'legacy_request'::uuid
);

delete from public.events
where name in (
  'Task 20 URL Copy Event',
  'Task 20 JCNC Import',
  'Task 20 Legacy Approval'
);

delete from public.user_bans
where user_id = :'admin_id'::uuid;

do $$
begin
  begin
    insert into public.event_requests (id, name, source_url, requested_by)
    values (
      gen_random_uuid(),
      'Bad URL',
      'javascript:alert(1)',
      '00000000-0000-4000-8000-000000020002'::uuid
    );
    raise exception 'javascript source_url unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

do $$
begin
  begin
    insert into public.event_requests (id, name, source_url, requested_by)
    values (
      gen_random_uuid(),
      'Bad URL',
      '//evil.example/phish',
      '00000000-0000-4000-8000-000000020002'::uuid
    );
    raise exception 'protocol-relative source_url unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

insert into public.event_requests (
  id, name, source_url, requested_by, status
)
values (
  :'pending_request'::uuid,
  'Task 20 URL Copy Event',
  'https://jcnc.org/events/task-20',
  :'requester_id'::uuid,
  'pending'
);

insert into public.event_requests (
  id, name, source_url, requested_by, status
)
values (
  :'anon_request'::uuid,
  'Task 20 JCNC Import',
  'https://jcnc.org/events/imported',
  null,
  'pending'
);

insert into public.event_requests (
  id, name, source_url, requested_by, status
)
values (
  :'reject_request'::uuid,
  'Task 20 Reject Race',
  'https://jcnc.org/events/reject-race',
  :'requester_id'::uuid,
  'pending'
);

insert into public.event_requests (
  id, name, source_url, requested_by, status
)
values (
  :'legacy_request'::uuid,
  'Task 20 Legacy Approval',
  'https://jcnc.org/events/legacy',
  :'requester_id'::uuid,
  'pending'
);

select pg_temp.task20_assert(
  'legacy approval keeps its UUID return contract',
  pg_get_function_result(
    'public.approve_event_request(uuid)'::regprocedure
  ) = 'uuid'
);

select pg_temp.task20_assert(
  'legacy approval delegates to the canonical v2 path',
  pg_get_functiondef(
    'public.approve_event_request(uuid)'::regprocedure
  ) like '%public.approve_event_request_v2(p_request_id)%'
);

select pg_temp.task20_assert(
  'legacy approval keeps authenticated access',
  has_function_privilege(
    'authenticated',
    'public.approve_event_request(uuid)',
    'EXECUTE'
  )
);

select pg_temp.task20_assert(
  'legacy approval denies anonymous access',
  not has_function_privilege(
    'anon',
    'public.approve_event_request(uuid)',
    'EXECUTE'
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', false);
select public.approve_event_request_v2(
  :'pending_request'::uuid
) as approved_payload \gset
reset role;

select pg_temp.task20_assert(
  'approve copies source_url onto the created event',
  (:'approved_payload'::jsonb ->> 'outcome') = 'approved'
  and exists (
    select 1
    from public.events e
    where e.id = (:'approved_payload'::jsonb ->> 'event_id')::uuid
      and e.source_url = 'https://jcnc.org/events/task-20'
  )
);

select pg_temp.task20_assert(
  'approve inserts exactly one requester notification',
  (
    select count(*) = 1
    from public.notifications
    where recipient_id = :'requester_id'::uuid
      and type = 'event_request_approved'
      and event_id is not null
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', false);
select public.approve_event_request_v2(
  :'pending_request'::uuid
) as second_approve_payload \gset
reset role;

select pg_temp.task20_assert(
  'double approve is idempotent and inserts no second notification',
  (:'second_approve_payload'::jsonb ->> 'outcome') = 'already_approved'
  and (
    select count(*)
    from public.notifications
    where recipient_id = :'requester_id'::uuid
      and type = 'event_request_approved'
  ) = 1
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', false);
select public.approve_event_request_v2(
  :'anon_request'::uuid
) as anon_approve_payload \gset
reset role;

select pg_temp.task20_assert(
  'null requester approval inserts zero notifications',
  (:'anon_approve_payload'::jsonb ->> 'outcome') = 'approved'
  and not exists (
    select 1
    from public.notifications
    where type = 'event_request_approved'
      and event_id = (:'anon_approve_payload'::jsonb ->> 'event_id')::uuid
  )
);

insert into public.user_bans (user_id, banned_by, reason)
values (
  :'admin_id'::uuid,
  :'admin_id'::uuid,
  'Task 20 active ban'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', false);
select pg_temp.task20_error_message(
  format(
    'select public.approve_event_request(%L::uuid)',
    :'legacy_request'
  )
) as legacy_ban_error \gset
reset role;

select pg_temp.task20_assert(
  'legacy approval preserves the live ban guard',
  :'legacy_ban_error' = 'account_suspended'
);

select pg_temp.task20_assert(
  'banned legacy approval leaves the request untouched',
  exists (
    select 1
    from public.event_requests
    where id = :'legacy_request'::uuid
      and status = 'pending'
      and approved_event_id is null
  )
  and not exists (
    select 1
    from public.events
    where name = 'Task 20 Legacy Approval'
  )
);

delete from public.user_bans
where user_id = :'admin_id'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', false);
select public.approve_event_request(
  :'legacy_request'::uuid
) as legacy_event_id \gset
reset role;

select pg_temp.task20_assert(
  'legacy approval copies source_url through v2',
  exists (
    select 1
    from public.events
    where id = :'legacy_event_id'::uuid
      and source_url = 'https://jcnc.org/events/legacy'
  )
);

select pg_temp.task20_assert(
  'legacy approval creates exactly one notification',
  (
    select count(*) = 1
    from public.notifications
    where recipient_id = :'requester_id'::uuid
      and type = 'event_request_approved'
      and event_id = :'legacy_event_id'::uuid
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', false);
select public.approve_event_request(
  :'legacy_request'::uuid
) as legacy_second_event_id \gset
reset role;

select pg_temp.task20_assert(
  'legacy approval is idempotent under repeated old-client calls',
  :'legacy_second_event_id'::uuid = :'legacy_event_id'::uuid
  and (
    select count(*) = 1
    from public.notifications
    where recipient_id = :'requester_id'::uuid
      and type = 'event_request_approved'
      and event_id = :'legacy_event_id'::uuid
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', false);
select public.approve_event_request_v2(
  :'legacy_request'::uuid
) as legacy_canonical_payload \gset
reset role;

select pg_temp.task20_assert(
  'old and new clients observe the same canonical event',
  (:'legacy_canonical_payload'::jsonb ->> 'outcome') = 'already_approved'
  and (:'legacy_canonical_payload'::jsonb ->> 'event_id')::uuid
    = :'legacy_event_id'::uuid
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', false);
select public.reject_event_request_v2(
  :'reject_request'::uuid
) as rejected_payload \gset
reset role;

select pg_temp.task20_assert(
  'reject inserts exactly one rejection notification',
  (:'rejected_payload'::jsonb ->> 'outcome') = 'rejected'
  and (
    select count(*)
    from public.notifications
    where recipient_id = :'requester_id'::uuid
      and type = 'event_request_rejected'
      and event_id is null
  ) = 1
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', false);
select public.reject_event_request_v2(
  :'reject_request'::uuid
) as second_rejected_payload \gset
reset role;

select pg_temp.task20_assert(
  'double reject is idempotent and inserts no second rejection notification',
  (:'second_rejected_payload'::jsonb ->> 'outcome') = 'already_rejected'
  and (
    select count(*)
    from public.notifications
    where recipient_id = :'requester_id'::uuid
      and type = 'event_request_rejected'
  ) = 1
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', false);
select public.reject_event_request_v2(
  '00000000-0000-4000-8000-000000029999'::uuid
) as missing_reject_payload \gset
reset role;

select pg_temp.task20_assert(
  'reject on missing request returns explicit outcome',
  (:'missing_reject_payload'::jsonb ->> 'outcome') = 'missing'
);

drop function pg_temp.task20_assert(text, boolean);
drop function pg_temp.task20_error_message(text);

rollback;

select 'task_20_event_workflow: PASS' as result;
