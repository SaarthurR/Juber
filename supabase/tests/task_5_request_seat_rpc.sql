\set ON_ERROR_STOP on

\set driver 00000000-0000-4000-8000-000000005001
\set rider 00000000-0000-4000-8000-000000005002
\set other 00000000-0000-4000-8000-000000005003
\set request_ride 00000000-0000-4000-8000-000000005101
\set confirmed_ride 00000000-0000-4000-8000-000000005102
\set full_ride 00000000-0000-4000-8000-000000005103
\set race_ride 00000000-0000-4000-8000-000000005104

create temporary table task5_failures (
  label text primary key,
  detail text not null
);
grant select, insert on task5_failures to authenticated;

create or replace function public.task5_assert(label text, condition boolean)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'assertion failed: %', label;
  end if;
end;
$$;

create or replace function public.task5_capture_sqlstate(statement text)
returns text
language plpgsql
set search_path = public
as $$
begin
  execute statement;
  return '00000';
exception
  when others then return sqlstate;
end;
$$;

grant execute on function public.task5_assert(text, boolean) to authenticated;
grant execute on function public.task5_capture_sqlstate(text) to authenticated;

insert into auth.users (id, raw_user_meta_data)
values
  (:'driver', '{"full_name":"Task 5 Driver"}'),
  (:'rider', '{"full_name":"Task 5 Rider"}'),
  (:'other', '{"full_name":"Task 5 Other"}')
on conflict (id) do nothing;

insert into public.rides (
  id, driver_id, origin_label, destination_label, depart_at,
  seats_total, seats_available, status
)
values
  (:'request_ride', :'driver', 'A', 'B', now() + interval '1 day', 2, 2, 'active'),
  (:'confirmed_ride', :'driver', 'A', 'B', now() + interval '1 day', 2, 2, 'active'),
  (:'full_ride', :'driver', 'A', 'B', now() + interval '1 day', 1, 1, 'active'),
  (:'race_ride', :'driver', 'A', 'B', now() + interval '1 day', 1, 1, 'active')
on conflict (id) do nothing;

select public.task5_assert(
  'request_seat authenticated grant',
  has_function_privilege('authenticated', 'public.request_seat(uuid)', 'EXECUTE')
);
select public.task5_assert(
  'request_seat anon revoked',
  not has_function_privilege('anon', 'public.request_seat(uuid)', 'EXECUTE')
);

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task5_assert(
  'first request creates pending row',
  public.request_seat(:'request_ride') = 'requested'
);
select public.task5_assert(
  'duplicate pending request is idempotent',
  public.request_seat(:'request_ride') = 'exists'
);
select public.task5_assert(
  'pending duplicate emits one notification',
  (
    select count(*) = 1
    from public.notifications
    where ride_id = :'request_ride'
      and actor_id = :'rider'
      and type = 'seat_requested'
  )
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
update public.ride_passengers
set status = 'declined'
where ride_id = :'request_ride'
  and passenger_id = :'rider'
  and status = 'pending';
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task5_assert(
  'declined row can request fresh pending',
  public.request_seat(:'request_ride') = 'requested'
);
select public.task5_assert(
  'declined re-request leaves one pending row',
  (
    select count(*) = 1
    from public.ride_passengers
    where ride_id = :'request_ride'
      and passenger_id = :'rider'
      and status = 'pending'
  )
);
select public.task5_assert(
  'declined re-request emits one more request notification',
  (
    select count(*) = 2
    from public.notifications
    where ride_id = :'request_ride'
      and actor_id = :'rider'
      and type = 'seat_requested'
  )
);
select public.task5_assert(
  'cancel pending succeeds',
  public.cancel_seat(:'request_ride', 'plans changed')
);
select public.task5_assert(
  'cancelled row can request fresh pending',
  public.request_seat(:'request_ride') = 'requested'
);
select public.task5_assert(
  'cancelled re-request emits one more request notification',
  (
    select count(*) = 3
    from public.notifications
    where ride_id = :'request_ride'
      and actor_id = :'rider'
      and type = 'seat_requested'
  )
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'other', false);
insert into public.ride_passengers (ride_id, passenger_id)
values (:'confirmed_ride', :'other');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task5_assert(
  'confirmed fixture succeeds',
  public.confirm_passenger(:'other', :'confirmed_ride')
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'other', false);
select public.task5_assert(
  'confirmed request remains idempotent',
  public.request_seat(:'confirmed_ride') = 'exists'
);
select public.task5_assert(
  'confirmed row was not demoted',
  (
    select status = 'confirmed'
    from public.ride_passengers
    where ride_id = :'confirmed_ride'
      and passenger_id = :'other'
  )
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'other', false);
insert into public.ride_passengers (ride_id, passenger_id)
values (:'full_ride', :'other');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task5_assert(
  'full fixture confirmation succeeds',
  public.confirm_passenger(:'other', :'full_ride')
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task5_assert(
  'full ride rejects fresh request',
  public.task5_capture_sqlstate(format('select public.request_seat(%L::uuid)', :'full_ride')) = 'P0001'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
insert into public.ride_passengers (ride_id, passenger_id)
values (:'race_ride', :'rider');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'other', false);
insert into public.ride_passengers (ride_id, passenger_id)
values (:'race_ride', :'other');
reset role;

select dblink_connect('task5_confirm_1', format('dbname=%s', current_database()));
select dblink_connect('task5_confirm_2', format('dbname=%s', current_database()));
select dblink_exec('task5_confirm_1', 'begin');
select dblink_exec('task5_confirm_1', 'set role authenticated');
select dblink_exec('task5_confirm_1', format('set request.jwt.claim.sub = %L', :'driver'));
select dblink_exec(
  'task5_confirm_1',
  format('select public.confirm_passenger(%L::uuid, %L::uuid)', :'rider', :'race_ride')
);
select dblink_exec('task5_confirm_2', 'set role authenticated');
select dblink_exec('task5_confirm_2', format('set request.jwt.claim.sub = %L', :'driver'));
select dblink_send_query(
  'task5_confirm_2',
  format(
    'select public.task5_capture_sqlstate(%L) as result',
    format('select public.confirm_passenger(%L::uuid, %L::uuid)', :'other', :'race_ride')
  )
);
select pg_sleep(0.1);
select dblink_exec('task5_confirm_1', 'commit');
create temporary table task5_concurrency_result as
select result
from dblink_get_result('task5_confirm_2') as response(result text);
insert into task5_failures
select 'concurrent confirm was not rejected', 'second confirm returned ' || result
from task5_concurrency_result
where result <> 'P0001';
insert into task5_failures
select 'concurrent confirm overbooked', 'confirmed count exceeded one'
where (
  select count(*) <> 1
  from public.ride_passengers
  where ride_id = :'race_ride'
    and status = 'confirmed'
);
select dblink_disconnect('task5_confirm_1');
select dblink_disconnect('task5_confirm_2');

table task5_failures;

select public.task5_assert(
  'task5 checks have no failures',
  not exists (select 1 from task5_failures)
);

select 'task_5_request_seat_rpc: PASS' as result;
