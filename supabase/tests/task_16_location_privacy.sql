\set ON_ERROR_STOP on

\set driver 00000000-0000-4000-8000-000000016001
\set rider 00000000-0000-4000-8000-000000016002
\set other 00000000-0000-4000-8000-000000016003
\set admin 00000000-0000-4000-8000-000000016004
\set loc_ride 00000000-0000-4000-8000-000000016101
\set guest_ride 00000000-0000-4000-8000-000000016102
\set race_ride 00000000-0000-4000-8000-000000016103
\set event_id 00000000-0000-4000-8000-000000016201

create temporary table task16_failures (
  label text primary key,
  detail text not null
);
grant select, insert on task16_failures to authenticated;

create or replace function public.task16_assert(label text, condition boolean)
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

create or replace function public.task16_capture_sqlstate(statement text)
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

grant execute on function public.task16_assert(text, boolean) to authenticated;
grant execute on function public.task16_capture_sqlstate(text) to authenticated;

insert into auth.users (id, raw_user_meta_data)
values
  (:'driver', '{"full_name":"Task 16 Driver"}'),
  (:'rider', '{"full_name":"Task 16 Rider"}'),
  (:'other', '{"full_name":"Task 16 Other"}'),
  (:'admin', '{"full_name":"Task 16 Admin"}')
on conflict (id) do nothing;

insert into public.profiles (id, full_name, is_admin)
values
  (:'driver', 'Task 16 Driver', false),
  (:'rider', 'Task 16 Rider', false),
  (:'other', 'Task 16 Other', false),
  (:'admin', 'Task 16 Admin', true)
on conflict (id) do update
set full_name = excluded.full_name,
    is_admin = excluded.is_admin;

insert into public.profile_contacts (user_id, phone, whatsapp)
values
  (:'driver', '+15550016001', '+15550016001'),
  (:'rider', '+15550016002', '+15550016002'),
  (:'other', '+15550016003', '+15550016003'),
  (:'admin', '+15550016004', '+15550016004')
on conflict (user_id) do update
set phone = excluded.phone,
    whatsapp = excluded.whatsapp;

insert into public.events (id, name, slug, start_date, is_active)
values (:'event_id', 'Task 16 Event', 'task-16-location-event', current_date, true)
on conflict (id) do nothing;

\set guest_ride2 00000000-0000-4000-8000-000000016104

insert into public.rides (
  id, driver_id, origin_label, destination_label,
  pickup_location, dropoff_location, depart_at,
  seats_total, seats_available, status, event_id
)
values
  (
    :'loc_ride', :'driver', 'Coarse A', 'Coarse B',
    '123 Secret Pickup St', '456 Secret Dropoff Ave',
    now() + interval '1 day', 4, 4, 'active', null
  ),
  (
    :'guest_ride', :'driver', 'Guest A', 'Guest B',
    'Meetup Corner', 'Dropoff Lot',
    now() + interval '1 day', 3, 3, 'active', null
  ),
  (
    :'guest_ride2', :'driver', 'Guest2 A', 'Guest2 B',
    'Meetup Two', 'Dropoff Two',
    now() + interval '1 day', 3, 3, 'active', null
  ),
  (
    :'race_ride', :'driver', 'Race A', 'Race B',
    'Race Meetup', 'Race Dropoff',
    now() + interval '1 day', 2, 2, 'active', :'event_id'
  )
on conflict (id) do update
set pickup_location = excluded.pickup_location,
    dropoff_location = excluded.dropoff_location,
    seats_total = excluded.seats_total,
    seats_available = excluded.seats_available,
    status = excluded.status,
    event_id = excluded.event_id;

update public.rides
set notes = 'Meet at 999 Hidden Address Ln',
    return_notes = 'Return to 888 Secret Return Rd'
where id = :'loc_ride';

-- Grant / RLS contract
select public.task16_assert(
  'request_seat authenticated grant (3-arg)',
  has_function_privilege('authenticated', 'public.request_seat(uuid,integer,text)', 'EXECUTE')
);
select public.task16_assert(
  'request_seat anon revoked',
  not has_function_privilege('anon', 'public.request_seat(uuid,integer,text)', 'EXECUTE')
);
select public.task16_assert(
  'direct authenticated passenger inserts revoked',
  not has_table_privilege('authenticated', 'public.ride_passengers', 'INSERT')
);
select public.task16_assert(
  'ride_meetup_location authenticated grant',
  has_function_privilege('authenticated', 'public.ride_meetup_location(uuid)', 'EXECUTE')
);
select public.task16_assert(
  'ride_meetup_location anon revoked',
  not has_function_privilege('anon', 'public.ride_meetup_location(uuid)', 'EXECUTE')
);
select public.task16_assert(
  'home_address not directly selectable',
  not has_column_privilege('authenticated', 'public.profile_contacts', 'home_address', 'SELECT')
);
select public.task16_assert(
  'phone contact select preserved',
  has_column_privilege('authenticated', 'public.profile_contacts', 'phone', 'SELECT')
);
select public.task16_assert(
  'pickup notes side table not directly selectable',
  not has_table_privilege('authenticated', 'public.ride_passenger_pickup_notes', 'SELECT')
);
select public.task16_assert(
  'pickup_note column removed from ride_passengers',
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ride_passengers'
      and column_name = 'pickup_note'
  )
);

-- Anon public RPC shape: no exact-location columns
set role anon;
select public.task16_assert(
  'anon upcoming rides runtime has no address keys',
  (
    select count(*) = 0
    from (
      select to_jsonb(ride.*) as payload
      from public.public_upcoming_rides(null, null, null, 100, null) ride
      where ride.id = :'loc_ride'::uuid
    ) rows
    where payload ? 'pickup_location'
       or payload ? 'dropoff_location'
  )
);
select public.task16_assert(
  'anon event rides runtime has no address keys',
  (
    select count(*) = 0
    from (
      select to_jsonb(ride.*) as payload
      from public.public_event_rides('task-16-location-event', 100) ride
      where ride.id = :'race_ride'::uuid
    ) rows
    where payload ? 'pickup_location'
       or payload ? 'dropoff_location'
  )
);
select public.task16_assert(
  'anon upcoming rides strips free-text notes',
  (
    select notes is null and return_notes is null
    from public.public_upcoming_rides(null, null, null, 100, null) ride
    where ride.id = :'loc_ride'::uuid
  )
);
reset role;

-- Required pickup request_seat callers
set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task16_assert(
  'pickup-less request_seat is rejected',
  public.task16_capture_sqlstate(
    format('select public.request_seat(%L::uuid)', :'loc_ride')
  ) = 'P0001'
);
select public.task16_assert(
  'blank pickup request_seat is rejected',
  public.task16_capture_sqlstate(
    format('select public.request_seat(%L::uuid, 0, %L)', :'loc_ride', '   ')
  ) = 'P0001'
);
select public.task16_assert(
  '3-arg request_seat stores pickup snapshot',
  public.request_seat(:'loc_ride', 0, 'Location pickup') = 'requested'
);
select public.task16_assert(
  'request_seat with guest_count and pickup works',
  public.request_seat(:'guest_ride', 2, 'Guest pickup') = 'requested'
);
select public.task16_assert(
  'request_seat stores private pickup snapshot',
  (
    select public.request_seat(:'guest_ride2', 1, 'Rider home snapshot 42') = 'requested'
  )
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task16_assert(
  'pending passenger reloads only own pickup snapshot',
  (
    select count(*) = 1
       and bool_and(pickup_location is null)
       and bool_and(dropoff_location is null)
       and bool_and(pickup_note = 'Rider home snapshot 42')
       and bool_and(passenger_id = :'rider'::uuid)
    from public.ride_meetup_location(:'guest_ride2')
  )
);
reset role;

insert into public.user_bans (user_id, banned_by, reason)
values (:'rider', :'admin', 'Task 16 temporary ban')
on conflict (user_id) do update
set banned_by = excluded.banned_by,
    reason = excluded.reason,
    ban_id = excluded.ban_id,
    created_at = now(),
    expires_at = null;

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task16_assert(
  'banned pending passenger is denied meetup RPC',
  public.task16_capture_sqlstate(
    format(
      'select * from public.ride_meetup_location(%L::uuid)',
      :'guest_ride2'
    )
  ) = 'P0001'
);
reset role;

delete from public.user_bans where user_id = :'rider';

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task16_assert(
  'driver sees pending pickup snapshot via gated RPC',
  exists (
    select 1
    from public.ride_meetup_location(:'guest_ride2')
    where pickup_note = 'Rider home snapshot 42'
      and passenger_id = :'rider'::uuid
  )
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'other', false);
select public.task16_assert(
  'unrelated cannot select pickup notes side table',
  public.task16_capture_sqlstate(
    'select pickup_note from public.ride_passenger_pickup_notes limit 1'
  ) = '42501'
);
select public.task16_assert(
  'unrelated cannot read another passenger pickup via gated RPC',
  not exists (
    select 1 from public.ride_meetup_location(:'guest_ride2')
  )
);
reset role;

-- Visibility matrix for ride_meetup_location
set role authenticated;
select set_config('request.jwt.claim.sub', :'other', false);
select public.task16_assert(
  'unrelated authenticated sees zero meetup rows',
  not exists (
    select 1 from public.ride_meetup_location(:'loc_ride')
  )
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task16_assert(
  'pending passenger receives no exact ride meetup',
  (
    select count(*) = 1
       and bool_and(pickup_location is null)
       and bool_and(dropoff_location is null)
       and bool_and(passenger_id = :'rider'::uuid)
    from public.ride_meetup_location(:'loc_ride')
  )
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task16_assert(
  'driver sees meetup row',
  exists (
    select 1
    from public.ride_meetup_location(:'loc_ride')
    where pickup_location = '123 Secret Pickup St'
      and dropoff_location = '456 Secret Dropoff Ave'
  )
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select public.task16_assert(
  'admin sees meetup row',
  exists (
    select 1
    from public.ride_meetup_location(:'loc_ride')
    where pickup_location = '123 Secret Pickup St'
  )
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task16_assert(
  'driver confirms guest party',
  public.confirm_passenger(:'rider', :'guest_ride2')
);
select public.task16_assert(
  'driver retains confirmed rider pickup and guest count',
  exists (
    select 1
    from public.ride_meetup_location(:'guest_ride2') meetup
    join public.ride_passengers passenger
      on passenger.ride_id = :'guest_ride2'::uuid
     and passenger.passenger_id = meetup.passenger_id
    where meetup.passenger_id = :'rider'::uuid
      and meetup.pickup_note = 'Rider home snapshot 42'
      and passenger.status = 'confirmed'
      and passenger.guest_count = 1
  )
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task16_assert(
  'confirmed passenger sees meetup and own pickup snapshot',
  exists (
    select 1
    from public.ride_meetup_location(:'guest_ride2')
    where pickup_location = 'Meetup Two'
      and pickup_note = 'Rider home snapshot 42'
      and passenger_id = :'rider'::uuid
  )
);
reset role;

begin;
update public.rides set depart_at = now() - interval '24 hours 1 second' where id = :'guest_ride2';
set local role authenticated;
select set_config('request.jwt.claim.sub', :'rider', true);
select public.task16_assert(
  'confirmed passenger loses meetup after 24h cutoff',
  not exists (select 1 from public.ride_meetup_location(:'guest_ride2'))
);
rollback;

-- Home address self-only
set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task16_assert(
  'rider can set home address via RPC',
  public.set_home_address('789 Private Home Ln')
);
select public.task16_assert(
  'rider reads own home via RPC',
  public.get_home_address() = '789 Private Home Ln'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task16_assert(
  'counterparty cannot read home via get_home_address',
  public.get_home_address() is null
);
select public.task16_assert(
  'counterparty direct home_address select denied',
  public.task16_capture_sqlstate(
    format('select home_address from public.profile_contacts where user_id = %L::uuid', :'rider')
  ) = '42501'
);
reset role;

-- Multiple pending parties / confirmation-time oversell / cancellation restoration
set role authenticated;
select set_config('request.jwt.claim.sub', :'other', false);
select public.task16_assert(
  'first pending party of 2 is accepted',
  public.request_seat(:'race_ride', 1, 'Other pickup') = 'requested'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task16_assert(
  'second pending party may coexist',
  public.request_seat(:'race_ride', 0, 'Rider pickup') = 'requested'
);
reset role;

select public.task16_assert(
  'multiple pending parties coexist without consuming seats',
  (
    select count(*) = 2
       and sum(1 + guest_count) = 3
    from public.ride_passengers
    where ride_id = :'race_ride'
      and status = 'pending'
      and passenger_id in (:'other'::uuid, :'rider'::uuid)
  )
  and (
    select seats_available = 2
    from public.rides
    where id = :'race_ride'
  )
);

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task16_assert(
  'confirming party of 2 succeeds',
  public.confirm_passenger(:'other', :'race_ride')
);
reset role;

select public.task16_assert(
  'confirmation consumes rider plus guest',
  (
    select seats_available = 0
    from public.rides
    where id = :'race_ride'
  )
  and exists (
    select 1
    from public.ride_passengers
    where ride_id = :'race_ride'
      and passenger_id = :'other'
      and status = 'confirmed'
      and guest_count = 1
  )
);

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task16_assert(
  'later confirmation that would oversell is rejected',
  public.task16_capture_sqlstate(
    format(
      'select public.confirm_passenger(%L::uuid, %L::uuid)',
      :'rider',
      :'race_ride'
    )
  ) = 'P0001'
);
reset role;

select public.task16_assert(
  'oversell rejection leaves booking and seat state unchanged',
  (
    select count(*) = 2
       and count(*) filter (where passenger_id = :'other'::uuid and status = 'confirmed') = 1
       and count(*) filter (where passenger_id = :'rider'::uuid and status = 'pending') = 1
    from public.ride_passengers
    where ride_id = :'race_ride'
      and passenger_id in (:'other'::uuid, :'rider'::uuid)
  )
  and (
    select seats_available = 0
    from public.rides
    where id = :'race_ride'
  )
);

set role authenticated;
select set_config('request.jwt.claim.sub', :'other', false);
select public.task16_assert(
  'confirmed party cancellation succeeds',
  public.cancel_seat(:'race_ride', 'change of plans')
);
reset role;

select public.task16_assert(
  'cancellation restores the full party of 2',
  (
    select seats_available = seats_total and seats_available = 2
    from public.rides
    where id = :'race_ride'
  )
  and exists (
    select 1
    from public.ride_passengers
    where ride_id = :'race_ride'
      and passenger_id = :'other'
      and status = 'cancelled'
      and guest_count = 1
  )
);

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task16_assert(
  'remaining pending request can be cancelled',
  public.cancel_seat(:'race_ride', 'test cleanup')
);
reset role;

select public.task16_assert(
  'race scenario leaves no stale active booking state',
  not exists (
    select 1
    from public.ride_passengers
    where ride_id = :'race_ride'
      and status in ('pending', 'confirmed')
  )
  and (
    select seats_available = seats_total
    from public.rides
    where id = :'race_ride'
  )
);

-- Bounds
set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task16_assert(
  'oversized pickup note rejected',
  public.task16_capture_sqlstate(
    format(
      'select public.request_seat(%L::uuid, 0, %L)',
      :'loc_ride',
      repeat('x', 501)
    )
  ) = 'P0001'
);
select public.task16_assert(
  'oversized home address rejected',
  public.task16_capture_sqlstate(
    format('select public.set_home_address(%L)', repeat('y', 501))
  ) = 'P0001'
);
reset role;

insert into task16_failures
select 'guest_count constraint missing', 'check constraint not found'
where not exists (
  select 1
  from pg_constraint
  where conrelid = 'public.ride_passengers'::regclass
    and conname like '%guest_count%'
);

table task16_failures;

select public.task16_assert(
  'task16 checks have no failures',
  not exists (select 1 from task16_failures)
);

select 'task_16_location_privacy: PASS' as result;
