\set ON_ERROR_STOP on

\set admin_one 00000000-0000-4000-8000-000000013001
\set admin_two 00000000-0000-4000-8000-000000013002
\set non_admin 00000000-0000-4000-8000-000000013003
\set pending_request 00000000-0000-4000-8000-000000013101
\set rejected_request 00000000-0000-4000-8000-000000013102
\set missing_request 00000000-0000-4000-8000-000000013199

begin;

create extension if not exists dblink;

create or replace function pg_temp.task13_assert(
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

create temporary table task13_results (
  label text primary key,
  payload jsonb not null
);
create temporary table task13_errors (
  label text primary key,
  message text not null
);
grant select, insert on task13_results, task13_errors to authenticated;

select format(
  'dbname=%s host=%s port=%s',
  current_database(),
  trim(split_part(current_setting('unix_socket_directories'), ',', 1)),
  current_setting('port')
) as task13_connstr \gset

select dblink_connect('task13_seed', :'task13_connstr');
select dblink_exec(
  'task13_seed',
  format(
    'delete from public.event_requests where id in (%L::uuid, %L::uuid)',
    :'pending_request',
    :'rejected_request'
  )
);
select dblink_exec(
  'task13_seed',
  'delete from public.events where name = ''Task 13 Concurrent Approval'''
);
select dblink_exec(
  'task13_seed',
  format(
    'delete from auth.users where id in (%L::uuid, %L::uuid, %L::uuid)',
    :'admin_one',
    :'admin_two',
    :'non_admin'
  )
);
select dblink_exec(
  'task13_seed',
  format(
    $sql$
      insert into auth.users (id, raw_user_meta_data)
      values
        (%L::uuid, '{"full_name":"Task 13 Admin One"}'),
        (%L::uuid, '{"full_name":"Task 13 Admin Two"}'),
        (%L::uuid, '{"full_name":"Task 13 Non Admin"}')
    $sql$,
    :'admin_one',
    :'admin_two',
    :'non_admin'
  )
);
select dblink_exec(
  'task13_seed',
  format(
    'update public.profiles set is_admin = true where id in (%L::uuid, %L::uuid)',
    :'admin_one',
    :'admin_two'
  )
);
select dblink_exec(
  'task13_seed',
  format(
    $sql$
      insert into public.event_requests (
        id,
        name,
        venue_label,
        start_date,
        end_date,
        status,
        requested_by
      )
      values
        (
          %L::uuid,
          'Task 13 Concurrent Approval',
          'JCNC, Milpitas',
          current_date + 30,
          current_date + 31,
          'pending',
          %L::uuid
        ),
        (
          %L::uuid,
          'Task 13 Rejected Request',
          'JCNC, Milpitas',
          current_date + 40,
          current_date + 40,
          'rejected',
          %L::uuid
        )
    $sql$,
    :'pending_request',
    :'non_admin',
    :'rejected_request',
    :'non_admin'
  )
);
select dblink_disconnect('task13_seed');

select pg_temp.task13_assert(
  'old approval RPC remains available',
  to_regprocedure('public.approve_event_request(uuid)') is not null
);
select pg_temp.task13_assert(
  'v2 approval RPC is available',
  to_regprocedure('public.approve_event_request_v2(uuid)') is not null
);
select pg_temp.task13_assert(
  'authenticated can execute v2 approval RPC',
  has_function_privilege(
    'authenticated',
    'public.approve_event_request_v2(uuid)',
    'EXECUTE'
  )
);
select pg_temp.task13_assert(
  'anon cannot execute v2 approval RPC',
  not has_function_privilege(
    'anon',
    'public.approve_event_request_v2(uuid)',
    'EXECUTE'
  )
);

select dblink_connect('task13_first', :'task13_connstr');
select dblink_connect('task13_second', :'task13_connstr');
select dblink_exec('task13_first', 'begin');
select dblink_exec('task13_first', 'set role authenticated');
select dblink_exec(
  'task13_first',
  format('set request.jwt.claim.sub = %L', :'admin_one')
);
insert into task13_results (label, payload)
select 'first', payload
from dblink(
  'task13_first',
  format(
    'select public.approve_event_request_v2(%L::uuid)',
    :'pending_request'
  )
) as response(payload jsonb);

select dblink_exec('task13_second', 'set role authenticated');
select dblink_exec(
  'task13_second',
  format('set request.jwt.claim.sub = %L', :'admin_two')
);
select dblink_send_query(
  'task13_second',
  format(
    $sql$
      select jsonb_build_object(
        'outcome',
        'legacy',
        'event_id',
        public.approve_event_request(%L::uuid)
      )
    $sql$,
    :'pending_request'
  )
);
select pg_sleep(0.1);
select pg_temp.task13_assert(
  'second approval waits behind the request row lock',
  dblink_is_busy('task13_second') = 1
);

select dblink_exec('task13_first', 'commit');
insert into task13_results (label, payload)
select 'second', payload
from dblink_get_result('task13_second') as response(payload jsonb);

select pg_temp.task13_assert(
  'one caller creates the event',
  (
    select count(*) = 1
    from task13_results
    where payload ->> 'outcome' = 'approved'
  )
);
select pg_temp.task13_assert(
  'the legacy caller observes the same canonical approval',
  (
    select count(*) = 1
    from task13_results
    where payload ->> 'outcome' = 'legacy'
      and payload ->> 'event_id' is not null
  )
);
select pg_temp.task13_assert(
  'both callers receive the same event id',
  (
    select count(distinct payload ->> 'event_id') = 1
      and bool_and(payload ->> 'event_id' is not null)
    from task13_results
  )
);
select pg_temp.task13_assert(
  'the approval creates exactly one event',
  (
    select count(*) = 1
    from public.events
    where name = 'Task 13 Concurrent Approval'
  )
);
select pg_temp.task13_assert(
  'the request has one final approved state',
  (
    select count(*) = 1
    from public.event_requests
    where id = :'pending_request'
      and status = 'approved'
      and approved_event_id is not null
      and reviewed_by in (:'admin_one'::uuid, :'admin_two'::uuid)
      and reviewed_at is not null
  )
);
select pg_temp.task13_assert(
  'mixed old/new approval creates exactly one notification',
  (
    select count(*) = 1
    from public.notifications
    where recipient_id = :'non_admin'::uuid
      and type = 'event_request_approved'
      and event_id = (
        select (payload ->> 'event_id')::uuid
        from task13_results
        where payload ->> 'outcome' = 'approved'
      )
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'non_admin', false);
do $$
begin
  begin
    perform public.approve_event_request_v2(
      '00000000-0000-4000-8000-000000013101'::uuid
    );
    insert into task13_errors (label, message)
    values ('non-admin', 'approval unexpectedly succeeded');
  exception
    when others then
      insert into task13_errors (label, message)
      values ('non-admin', sqlerrm);
  end;
end;
$$;
reset role;
select pg_temp.task13_assert(
  'non-admin approval is rejected internally',
  (
    select message = 'Only admins can approve event requests'
    from task13_errors
    where label = 'non-admin'
  )
);

insert into task13_results (label, payload)
select 'missing', payload
from dblink(
  'task13_first',
  format(
    'select public.approve_event_request_v2(%L::uuid)',
    :'missing_request'
  )
) as response(payload jsonb);
insert into task13_results (label, payload)
select 'rejected', payload
from dblink(
  'task13_first',
  format(
    'select public.approve_event_request_v2(%L::uuid)',
    :'rejected_request'
  )
) as response(payload jsonb);
select pg_temp.task13_assert(
  'missing requests return an explicit outcome',
  (
    select payload = jsonb_build_object(
      'outcome',
      'missing',
      'event_id',
      null
    )
    from task13_results
    where label = 'missing'
  )
);
select pg_temp.task13_assert(
  'rejected requests return an explicit outcome',
  (
    select payload = jsonb_build_object(
      'outcome',
      'already_rejected',
      'event_id',
      null
    )
    from task13_results
    where label = 'rejected'
  )
);

select dblink_exec('task13_first', 'reset role');
select dblink_exec(
  'task13_first',
  format(
    'delete from public.event_requests where id in (%L::uuid, %L::uuid)',
    :'pending_request',
    :'rejected_request'
  )
);
select dblink_exec(
  'task13_first',
  'delete from public.events where name = ''Task 13 Concurrent Approval'''
);
select dblink_exec(
  'task13_first',
  format(
    'delete from auth.users where id in (%L::uuid, %L::uuid, %L::uuid)',
    :'admin_one',
    :'admin_two',
    :'non_admin'
  )
);
select dblink_disconnect('task13_first');
select dblink_disconnect('task13_second');

select pg_temp.task13_assert(
  'test fixtures are removed',
  not exists (
    select 1
    from public.event_requests
    where id in (:'pending_request'::uuid, :'rejected_request'::uuid)
  )
  and not exists (
    select 1
    from public.events
    where name = 'Task 13 Concurrent Approval'
  )
);

drop function pg_temp.task13_assert(text, boolean);

rollback;

select 'task_13_admin_review_contracts: PASS' as result;
