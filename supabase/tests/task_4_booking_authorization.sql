\set ON_ERROR_STOP on

\set driver 00000000-0000-4000-8000-000000000001
\set rider 00000000-0000-4000-8000-000000000002
\set admin 00000000-0000-4000-8000-000000000003
\set forged_ride 00000000-0000-4000-8000-000000000101
\set terminal_ride 00000000-0000-4000-8000-000000000102
\set identity_ride 00000000-0000-4000-8000-000000000103
\set target_ride 00000000-0000-4000-8000-000000000104
\set terminal_status_ride 00000000-0000-4000-8000-000000000105
\set forged_request 00000000-0000-4000-8000-000000000201
\set immutable_request 00000000-0000-4000-8000-000000000202
\set accepted_request 00000000-0000-4000-8000-000000000203
\set main_ride 00000000-0000-4000-8000-000000000301
\set seat_ride 00000000-0000-4000-8000-000000000302
\set cancel_ride 00000000-0000-4000-8000-000000000303

create temporary table task4_failures (label text primary key);
grant select, insert on task4_failures to authenticated;

create or replace function public.task4_expect_rejected(label text, statement text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  begin
    execute statement;
    insert into task4_failures values (label) on conflict do nothing;
  exception
    when others then null;
  end;
end;
$$;

create or replace function public.task4_assert(label text, condition boolean)
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

grant execute on function public.task4_expect_rejected(text, text) to authenticated;
grant execute on function public.task4_assert(text, boolean) to authenticated;

insert into auth.users (id, raw_user_meta_data)
values
  (:'driver', '{"full_name":"Driver"}'),
  (:'rider', '{"full_name":"Rider"}'),
  (:'admin', '{"full_name":"Admin"}');

update public.profiles set is_admin = true where id = :'admin';

insert into public.profile_contacts (user_id, phone, whatsapp)
values
  (:'driver', '+15550000001', '+15550000001'),
  (:'rider', '+15550000002', '+15550000002'),
  (:'admin', '+15550000003', '+15550000003');

insert into public.rides (
  id, driver_id, origin_label, destination_label, depart_at,
  seats_total, seats_available, status
)
values
  (:'forged_ride', :'driver', 'A', 'B', now() + interval '1 day', 2, 2, 'active'),
  (:'terminal_ride', :'driver', 'A', 'B', now() + interval '1 day', 2, 2, 'active'),
  (:'identity_ride', :'driver', 'A', 'B', now() + interval '1 day', 2, 2, 'active'),
  (:'target_ride', :'driver', 'A', 'B', now() + interval '1 day', 2, 2, 'active'),
  (:'terminal_status_ride', :'driver', 'A', 'B', now() - interval '1 day', 1, 1, 'completed');

insert into public.ride_passengers (ride_id, passenger_id, status)
values
  (:'terminal_ride', :'rider', 'cancelled'),
  (:'identity_ride', :'rider', 'pending');

insert into public.ride_requests (
  id, rider_id, origin_label, destination_label, depart_at, status
)
values
  (:'forged_request', :'rider', 'A', 'B', now() + interval '1 day', 'active'),
  (:'immutable_request', :'rider', 'A', 'B', now() + interval '1 day', 'active'),
  (:'accepted_request', :'rider', 'A', 'B', now() + interval '1 day', 'active');

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task4_expect_rejected(
  'forged confirmed passenger insert',
  format(
    'insert into public.ride_passengers (ride_id, passenger_id, status) values (%L::uuid, %L::uuid, ''confirmed'')',
    :'forged_ride',
    :'rider'
  )
);
select public.task4_expect_rejected(
  'rider self-fulfilled request',
  format(
    'update public.ride_requests set status = ''fulfilled'', accepted_driver_id = %L::uuid where id = %L::uuid',
    :'admin',
    :'forged_request'
  )
);
select public.task4_expect_rejected(
  'request depart_at immutable',
  format(
    'update public.ride_requests set depart_at = depart_at + interval ''1 day'' where id = %L::uuid',
    :'immutable_request'
  )
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task4_expect_rejected(
  'cancelled passenger terminal',
  format(
    'update public.ride_passengers set status = ''confirmed'' where ride_id = %L::uuid and passenger_id = %L::uuid',
    :'terminal_ride',
    :'rider'
  )
);
select public.task4_expect_rejected(
  'passenger identity immutable',
  format(
    'update public.ride_passengers set passenger_id = %L::uuid where ride_id = %L::uuid and passenger_id = %L::uuid',
    :'admin',
    :'identity_ride',
    :'rider'
  )
);
select public.task4_expect_rejected(
  'passenger ride immutable',
  format(
    'update public.ride_passengers set ride_id = %L::uuid where ride_id = %L::uuid and passenger_id = %L::uuid',
    :'target_ride',
    :'identity_ride',
    :'rider'
  )
);
select public.task4_expect_rejected(
  'terminal ride status immutable',
  format(
    'update public.rides set status = ''active'' where id = %L::uuid',
    :'terminal_status_ride'
  )
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select public.task4_expect_rejected(
  'request rider immutable',
  format(
    'update public.ride_requests set rider_id = %L::uuid where id = %L::uuid',
    :'admin',
    :'immutable_request'
  )
);
reset role;

table task4_failures;

set session_replication_role = replica;
delete from public.ride_passengers
where ride_id in (:'forged_ride', :'terminal_ride', :'identity_ride', :'target_ride');
update public.ride_requests
set rider_id = :'rider',
    depart_at = now() + interval '1 day',
    status = 'active',
    accepted_driver_id = null
where id in (:'forged_request', :'immutable_request');
update public.rides
set status = 'completed'
where id = :'terminal_status_ride';
set session_replication_role = origin;

insert into public.rides (
  id, driver_id, origin_label, destination_label, depart_at,
  seats_total, seats_available, status
)
values (:'main_ride', :'driver', 'Main A', 'Main B', now() + interval '1 day', 1, 1, 'active');

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
insert into public.ride_passengers (ride_id, passenger_id)
values (:'main_ride', :'rider');
select public.task4_assert(
  'new passenger request is pending',
  (select status = 'pending' from public.ride_passengers where ride_id = :'main_ride' and passenger_id = :'rider')
);
select public.task4_expect_rejected(
  'unconfirmed rider cannot open conversation',
  format(
    'select public.open_conversation(%L::uuid, %L::uuid, null)',
    :'driver',
    :'main_ride'
  )
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task4_assert(
  'atomic confirm_passenger succeeds',
  public.confirm_passenger(:'rider', :'main_ride')
);
reset role;

begin;
update public.rides set depart_at = now() - interval '24 hours' where id = :'main_ride';
set local role authenticated;
select set_config('request.jwt.claim.sub', :'rider', true);
select public.task4_assert(
  'ride contact allowed at inclusive 24-hour cutoff',
  public.shares_booking(:'driver')
);
select public.task4_assert(
  'owner contact remains available',
  exists (select 1 from public.get_contact(:'rider'))
);
rollback;

begin;
update public.rides set depart_at = now() - interval '24 hours 1 second' where id = :'main_ride';
set local role authenticated;
select set_config('request.jwt.claim.sub', :'rider', true);
select public.task4_assert(
  'ride contact denied after cutoff',
  not public.shares_booking(:'driver')
);
rollback;

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select public.task4_assert(
  'driver request acceptance succeeds',
  public.accept_ride_request(:'accepted_request')
);
reset role;

select public.task4_assert(
  'accepted request records real driver',
  (
    select status = 'fulfilled' and accepted_driver_id = :'admin'
    from public.ride_requests
    where id = :'accepted_request'
  )
);

begin;
set local session_replication_role = replica;
update public.ride_requests
set depart_at = now() - interval '24 hours'
where id = :'accepted_request';
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'rider', true);
select public.task4_assert(
  'request contact allowed at inclusive 24-hour cutoff',
  public.shares_booking(:'admin')
);
rollback;

begin;
set local session_replication_role = replica;
update public.ride_requests
set depart_at = now() - interval '24 hours 1 second'
where id = :'accepted_request';
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'rider', true);
select public.task4_assert(
  'request contact denied after cutoff',
  not public.shares_booking(:'admin')
);
rollback;

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.open_conversation(:'driver', :'main_ride', null) as main_conversation \gset
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
insert into public.messages (conversation_id, sender_id, body)
values (:'main_conversation', :'driver', 'pre-hide');
reset role;

select pg_sleep(0.01);
set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task4_assert(
  'hide RPC succeeds',
  public.delete_conversation(:'main_conversation')
);
reset role;

select pg_sleep(0.01);
set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
insert into public.messages (conversation_id, sender_id, body)
values (:'main_conversation', :'driver', 'post-hide');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task4_assert(
  'summary excludes pre-hide and counts first post-hide unread',
  (
    select unread_count = 1 and last_body = 'post-hide'
    from public.conversation_message_summaries(array[:'main_conversation'::uuid])
  )
);
select public.task4_assert(
  'visible notification ids exclude stale pre-hide message',
  (
    select count(*) = 1
    from public.visible_notification_ids(null, false) visible
    join public.notifications notification on notification.id = visible.id
    where notification.type = 'new_message'
      and notification.conversation_id = :'main_conversation'
  )
);
select public.task4_expect_rejected(
  'direct hide mutation denied',
  format(
    'update public.conversation_hides set hidden_at = now() where conversation_id = %L::uuid and user_id = %L::uuid',
    :'main_conversation',
    :'rider'
  )
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task4_assert(
  'peer cannot select caller hide',
  (
    select count(*) = 0
    from public.conversation_hides
    where conversation_id = :'main_conversation'
      and user_id = :'rider'
  )
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task4_assert('close ride succeeds', public.close_ride(:'main_ride'));
reset role;

select public.task4_assert(
  'close retains conversation',
  (select count(*) = 1 from public.conversations where id = :'main_conversation')
);
select public.task4_assert(
  'close retains two participants',
  (select count(*) = 2 from public.conversation_participants where conversation_id = :'main_conversation')
);
select public.task4_assert(
  'close retains messages',
  (select count(*) = 2 from public.messages where conversation_id = :'main_conversation')
);
select public.task4_assert(
  'close retains passenger history',
  (
    select count(*) = 1
    from public.ride_passengers
    where ride_id = :'main_ride' and status = 'confirmed'
  )
);

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task4_assert(
  'completed ride revokes counterpart contact',
  not public.shares_booking(:'driver')
);
select public.task4_assert(
  'completed ride reuses retained conversation',
  public.open_conversation(:'driver', :'main_ride', null) = :'main_conversation'
);
insert into public.messages (conversation_id, sender_id, body)
values (:'main_conversation', :'rider', 'lost-item follow-up');
reset role;

insert into public.rides (
  id, driver_id, origin_label, destination_label, depart_at,
  seats_total, seats_available, status
)
values (:'seat_ride', :'driver', 'Seat A', 'Seat B', now() + interval '1 day', 1, 1, 'active');

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
insert into public.ride_passengers (ride_id, passenger_id)
values (:'seat_ride', :'rider');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task4_assert(
  'seat fixture confirmation succeeds',
  public.confirm_passenger(:'rider', :'seat_ride')
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.open_conversation(:'driver', :'seat_ride', null) as seat_conversation \gset
insert into public.messages (conversation_id, sender_id, body)
values (:'seat_conversation', :'rider', 'seat history');
select public.task4_assert(
  'seat cancellation succeeds',
  public.cancel_seat(:'seat_ride', 'plans changed')
);
reset role;

select public.task4_assert(
  'seat cancellation retains cancelled row',
  (
    select status = 'cancelled'
    from public.ride_passengers
    where ride_id = :'seat_ride' and passenger_id = :'rider'
  )
);
select public.task4_assert(
  'seat cancellation frees one seat',
  (select seats_available = 1 from public.rides where id = :'seat_ride')
);
select public.task4_assert(
  'seat cancellation retains chat',
  (select count(*) = 1 from public.conversations where id = :'seat_conversation')
);
select public.task4_assert(
  'seat cancellation emits exactly one cancellation notification',
  (
    select count(*) = 1
    from public.notifications
    where ride_id = :'seat_ride' and type = 'seat_cancelled'
  )
);
select public.task4_assert(
  'seat cancellation emits zero declined notifications',
  (
    select count(*) = 0
    from public.notifications
    where ride_id = :'seat_ride' and type = 'seat_declined'
  )
);

insert into public.rides (
  id, driver_id, origin_label, destination_label, depart_at,
  seats_total, seats_available, status
)
values (:'cancel_ride', :'driver', 'Cancel A', 'Cancel B', now() + interval '1 day', 1, 1, 'active');

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
insert into public.ride_passengers (ride_id, passenger_id)
values (:'cancel_ride', :'rider');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task4_assert(
  'cancel fixture confirmation succeeds',
  public.confirm_passenger(:'rider', :'cancel_ride')
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.open_conversation(:'driver', :'cancel_ride', null) as cancel_conversation \gset
insert into public.messages (conversation_id, sender_id, body)
values (:'cancel_conversation', :'rider', 'cancel history');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task4_assert(
  'ride cancellation succeeds',
  public.cancel_ride(:'cancel_ride', 'weather')
);
reset role;

select public.task4_assert(
  'ride cancellation retains chat and message',
  (select count(*) = 1 from public.messages where conversation_id = :'cancel_conversation')
);
select public.task4_assert(
  'ride cancellation retains confirmed passenger',
  (
    select count(*) = 1
    from public.ride_passengers
    where ride_id = :'cancel_ride' and status = 'confirmed'
  )
);
select public.task4_assert(
  'ride cancellation emits one rider notification',
  (
    select count(*) = 1
    from public.notifications
    where ride_id = :'cancel_ride' and type = 'ride_cancelled'
  )
);

select public.task4_assert(
  'all rejected security transitions were denied',
  not exists (select 1 from task4_failures)
);

select 'task_4_booking_authorization: PASS' as result;
