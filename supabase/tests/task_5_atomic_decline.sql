\set ON_ERROR_STOP on

\set driver 00000000-0000-4000-8000-000000006001
\set rider 00000000-0000-4000-8000-000000006002
\set other 00000000-0000-4000-8000-000000006003
\set third 00000000-0000-4000-8000-000000006004
\set terminal_ride 00000000-0000-4000-8000-000000006101
\set close_first_ride 00000000-0000-4000-8000-000000006102
\set decline_first_ride 00000000-0000-4000-8000-000000006103
\set cancel_first_ride 00000000-0000-4000-8000-000000006104
\set confirm_race_ride 00000000-0000-4000-8000-000000006105

create temporary table task5_atomic_results (
  label text primary key,
  result_sqlstate text not null,
  result_message text
);
grant select, insert on task5_atomic_results to authenticated;

create or replace function pg_temp.task5_atomic_assert(label text, condition boolean)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'assertion failed: %', label;
  end if;
end;
$$;

create or replace function public.task5_atomic_capture(statement text)
returns table (result_sqlstate text, result_message text)
language plpgsql
set search_path = public
as $$
begin
  begin
    execute statement;
    result_sqlstate := '00000';
    result_message := null;
  exception
    when others then
      get stacked diagnostics
        result_sqlstate = returned_sqlstate,
        result_message = message_text;
  end;
  return next;
end;
$$;

grant execute on function public.task5_atomic_capture(text) to authenticated;

select format(
  'dbname=%s host=%s port=%s',
  current_database(),
  trim(split_part(current_setting('unix_socket_directories'), ',', 1)),
  current_setting('port')
) as task5_connstr \gset

insert into auth.users (id, raw_user_meta_data)
values
  (:'driver', '{"full_name":"Atomic Driver"}'),
  (:'rider', '{"full_name":"Atomic Rider"}'),
  (:'other', '{"full_name":"Atomic Other"}'),
  (:'third', '{"full_name":"Atomic Third"}')
on conflict (id) do nothing;

insert into public.profile_contacts (user_id, phone, whatsapp)
values
  (:'driver', '+15550006001', '+15550006001'),
  (:'rider', '+15550006002', '+15550006002'),
  (:'other', '+15550006003', '+15550006003'),
  (:'third', '+15550006004', '+15550006004')
on conflict (user_id) do update
set phone = excluded.phone,
    whatsapp = excluded.whatsapp;

insert into public.rides (
  id, driver_id, origin_label, destination_label, depart_at,
  seats_total, seats_available, status
)
values
  (:'terminal_ride', :'driver', 'A', 'B', now() + interval '1 day', 1, 1, 'active'),
  (:'close_first_ride', :'driver', 'A', 'B', now() + interval '1 day', 1, 1, 'active'),
  (:'decline_first_ride', :'driver', 'A', 'B', now() + interval '1 day', 1, 1, 'active'),
  (:'cancel_first_ride', :'driver', 'A', 'B', now() + interval '1 day', 1, 1, 'active'),
  (:'confirm_race_ride', :'driver', 'A', 'B', now() + interval '1 day', 1, 1, 'active');

insert into public.ride_passengers (ride_id, passenger_id, status)
values
  (:'terminal_ride', :'rider', 'pending'),
  (:'close_first_ride', :'rider', 'pending'),
  (:'decline_first_ride', :'rider', 'pending'),
  (:'cancel_first_ride', :'rider', 'pending'),
  (:'confirm_race_ride', :'rider', 'pending'),
  (:'confirm_race_ride', :'other', 'pending');

update public.rides
set status = 'completed'
where id = :'terminal_ride';

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
insert into task5_atomic_results
select
  'terminal decline',
  result_sqlstate,
  result_message
from public.task5_atomic_capture(
  format(
    'update public.ride_passengers set status = ''declined'' where ride_id = %L::uuid and passenger_id = %L::uuid',
    :'terminal_ride',
    :'rider'
  )
);
reset role;

select pg_temp.task5_atomic_assert(
  'terminal decline returns P0001',
  (
    select result_sqlstate = 'P0001'
    from task5_atomic_results
    where label = 'terminal decline'
  )
);
select pg_temp.task5_atomic_assert(
  'terminal decline returns clean message',
  (
    select result_message = 'This ride is no longer accepting passenger decisions'
    from task5_atomic_results
    where label = 'terminal decline'
  )
);
select pg_temp.task5_atomic_assert(
  'terminal decline preserves pending row',
  (
    select status = 'pending'
    from public.ride_passengers
    where ride_id = :'terminal_ride'
      and passenger_id = :'rider'
  )
);
select pg_temp.task5_atomic_assert(
  'terminal decline emits no declined notification',
  not exists (
    select 1
    from public.notifications
    where ride_id = :'terminal_ride'
      and type = 'seat_declined'
  )
);

select dblink_connect('task5_close_first', :'task5_connstr');
select dblink_connect('task5_decline_after_close', :'task5_connstr');
select dblink_exec('task5_close_first', 'begin');
select dblink_exec('task5_close_first', 'set role authenticated');
select dblink_exec(
  'task5_close_first',
  format('set request.jwt.claim.sub = %L', :'driver')
);
select close_result
from dblink(
  'task5_close_first',
  format('select public.close_ride(%L::uuid)', :'close_first_ride')
) as response(close_result boolean);
select dblink_exec('task5_decline_after_close', 'set role authenticated');
select dblink_exec(
  'task5_decline_after_close',
  format('set request.jwt.claim.sub = %L', :'driver')
);
select dblink_send_query(
  'task5_decline_after_close',
  format(
    'select result_sqlstate, result_message from public.task5_atomic_capture(%L)',
    format(
      'update public.ride_passengers set status = ''declined'' where ride_id = %L::uuid and passenger_id = %L::uuid',
      :'close_first_ride',
      :'rider'
    )
  )
);
select pg_sleep(0.1);
select pg_temp.task5_atomic_assert(
  'decline waits behind close ride lock',
  dblink_is_busy('task5_decline_after_close') = 1
);
select dblink_exec('task5_close_first', 'commit');
insert into task5_atomic_results
select 'close first decline', result_sqlstate, result_message
from dblink_get_result('task5_decline_after_close')
  as response(result_sqlstate text, result_message text);
select dblink_disconnect('task5_close_first');
select dblink_disconnect('task5_decline_after_close');

select pg_temp.task5_atomic_assert(
  'close-first decline returns P0001',
  (
    select result_sqlstate = 'P0001'
    from task5_atomic_results
    where label = 'close first decline'
  )
);
select pg_temp.task5_atomic_assert(
  'close-first decline preserves pending history',
  (
    select status = 'pending'
    from public.ride_passengers
    where ride_id = :'close_first_ride'
      and passenger_id = :'rider'
  )
);
select pg_temp.task5_atomic_assert(
  'close-first decline emits no declined notification',
  not exists (
    select 1
    from public.notifications
    where ride_id = :'close_first_ride'
      and type = 'seat_declined'
  )
);

select dblink_connect('task5_decline_first', :'task5_connstr');
select dblink_connect('task5_close_after_decline', :'task5_connstr');
select dblink_exec('task5_decline_first', 'begin');
select dblink_exec('task5_decline_first', 'set role authenticated');
select dblink_exec(
  'task5_decline_first',
  format('set request.jwt.claim.sub = %L', :'driver')
);
select dblink_exec(
  'task5_decline_first',
  format(
    'update public.ride_passengers set status = ''declined'' where ride_id = %L::uuid and passenger_id = %L::uuid',
    :'decline_first_ride',
    :'rider'
  )
);
select dblink_exec('task5_close_after_decline', 'set role authenticated');
select dblink_exec(
  'task5_close_after_decline',
  format('set request.jwt.claim.sub = %L', :'driver')
);
select dblink_send_query(
  'task5_close_after_decline',
  format('select public.close_ride(%L::uuid)', :'decline_first_ride')
);
select pg_sleep(0.1);
select pg_temp.task5_atomic_assert(
  'close waits behind decline ride lock',
  dblink_is_busy('task5_close_after_decline') = 1
);
select dblink_exec('task5_decline_first', 'commit');
create temporary table task5_decline_first_close_result as
select close_result
from dblink_get_result('task5_close_after_decline')
  as response(close_result boolean);
select dblink_disconnect('task5_decline_first');
select dblink_disconnect('task5_close_after_decline');

select pg_temp.task5_atomic_assert(
  'decline-first close succeeds',
  (select close_result from task5_decline_first_close_result)
);
select pg_temp.task5_atomic_assert(
  'decline-first keeps declined history',
  (
    select status = 'declined'
    from public.ride_passengers
    where ride_id = :'decline_first_ride'
      and passenger_id = :'rider'
  )
);
select pg_temp.task5_atomic_assert(
  'decline-first emits one declined notification',
  (
    select count(*) = 1
    from public.notifications
    where ride_id = :'decline_first_ride'
      and type = 'seat_declined'
  )
);

select dblink_connect('task5_cancel_first', :'task5_connstr');
select dblink_connect('task5_decline_after_cancel', :'task5_connstr');
select dblink_exec('task5_cancel_first', 'begin');
select dblink_exec('task5_cancel_first', 'set role authenticated');
select dblink_exec(
  'task5_cancel_first',
  format('set request.jwt.claim.sub = %L', :'driver')
);
select cancel_result
from dblink(
  'task5_cancel_first',
  format(
    'select public.cancel_ride(%L::uuid, ''weather'')',
    :'cancel_first_ride'
  )
) as response(cancel_result boolean);
select dblink_exec('task5_decline_after_cancel', 'set role authenticated');
select dblink_exec(
  'task5_decline_after_cancel',
  format('set request.jwt.claim.sub = %L', :'driver')
);
select dblink_send_query(
  'task5_decline_after_cancel',
  format(
    'select result_sqlstate, result_message from public.task5_atomic_capture(%L)',
    format(
      'update public.ride_passengers set status = ''declined'' where ride_id = %L::uuid and passenger_id = %L::uuid',
      :'cancel_first_ride',
      :'rider'
    )
  )
);
select pg_sleep(0.1);
select pg_temp.task5_atomic_assert(
  'decline waits behind cancel ride lock',
  dblink_is_busy('task5_decline_after_cancel') = 1
);
select dblink_exec('task5_cancel_first', 'commit');
insert into task5_atomic_results
select 'cancel first decline', result_sqlstate, result_message
from dblink_get_result('task5_decline_after_cancel')
  as response(result_sqlstate text, result_message text);
select dblink_disconnect('task5_cancel_first');
select dblink_disconnect('task5_decline_after_cancel');

select pg_temp.task5_atomic_assert(
  'cancel-first decline returns P0001',
  (
    select result_sqlstate = 'P0001'
    from task5_atomic_results
    where label = 'cancel first decline'
  )
);
select pg_temp.task5_atomic_assert(
  'cancel-first decline preserves pending history',
  (
    select status = 'pending'
    from public.ride_passengers
    where ride_id = :'cancel_first_ride'
      and passenger_id = :'rider'
  )
);
select pg_temp.task5_atomic_assert(
  'cancel-first decline emits no declined notification',
  not exists (
    select 1
    from public.notifications
    where ride_id = :'cancel_first_ride'
      and type = 'seat_declined'
  )
);

select dblink_connect('task5_confirm_first', :'task5_connstr');
select dblink_connect('task5_confirm_second', :'task5_connstr');
select dblink_exec('task5_confirm_first', 'begin');
select dblink_exec('task5_confirm_first', 'set role authenticated');
select dblink_exec(
  'task5_confirm_first',
  format('set request.jwt.claim.sub = %L', :'driver')
);
select dblink_exec(
  'task5_confirm_first',
  format(
    'update public.ride_passengers set status = ''confirmed'' where ride_id = %L::uuid and passenger_id = %L::uuid',
    :'confirm_race_ride',
    :'rider'
  )
);
select dblink_exec('task5_confirm_second', 'set role authenticated');
select dblink_exec(
  'task5_confirm_second',
  format('set request.jwt.claim.sub = %L', :'driver')
);
select dblink_send_query(
  'task5_confirm_second',
  format(
    'select result_sqlstate, result_message from public.task5_atomic_capture(%L)',
    format(
      'update public.ride_passengers set status = ''confirmed'' where ride_id = %L::uuid and passenger_id = %L::uuid',
      :'confirm_race_ride',
      :'other'
    )
  )
);
select pg_sleep(0.1);
select pg_temp.task5_atomic_assert(
  'second confirm waits behind ride lock',
  dblink_is_busy('task5_confirm_second') = 1
);
select dblink_exec('task5_confirm_first', 'commit');
insert into task5_atomic_results
select 'second confirm', result_sqlstate, result_message
from dblink_get_result('task5_confirm_second')
  as response(result_sqlstate text, result_message text);
select dblink_disconnect('task5_confirm_first');
select dblink_disconnect('task5_confirm_second');

select pg_temp.task5_atomic_assert(
  'second confirm returns P0001',
  (
    select result_sqlstate = 'P0001'
    from task5_atomic_results
    where label = 'second confirm'
  )
);
select pg_temp.task5_atomic_assert(
  'second confirm keeps clean capacity error',
  (
    select result_message = 'This ride has no seats left'
    from task5_atomic_results
    where label = 'second confirm'
  )
);
select pg_temp.task5_atomic_assert(
  'confirm race never overbooks',
  (
    select count(*) = 1
    from public.ride_passengers
    where ride_id = :'confirm_race_ride'
      and status = 'confirmed'
  )
);
select pg_temp.task5_atomic_assert(
  'confirm race synchronizes available seats',
  (
    select seats_available = 0
    from public.rides
    where id = :'confirm_race_ride'
  )
);

drop function public.task5_atomic_capture(text);
delete from auth.users
where id in (:'driver', :'rider', :'other', :'third');

select 'task_5_atomic_decline: PASS' as result;
