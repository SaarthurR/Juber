\set ON_ERROR_STOP on

\set driver 00000000-0000-4000-8000-000000023001
\set rider 00000000-0000-4000-8000-000000023002
\set other 00000000-0000-4000-8000-000000023003
\set admin 00000000-0000-4000-8000-000000023004
\set exact_ride 00000000-0000-4000-8000-000000023101
\set insert_ride 00000000-0000-4000-8000-000000023102
\set update_ride 00000000-0000-4000-8000-000000023103
\set cascade_ride 00000000-0000-4000-8000-000000023104
\set event_id 00000000-0000-4000-8000-000000023201

create temporary table task23_failures (
  label text primary key,
  detail text not null
);
grant select, insert on task23_failures to authenticated;

create or replace function public.task23_assert(label text, condition boolean)
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

create or replace function public.task23_capture_sqlstate(statement text)
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

grant execute on function public.task23_assert(text, boolean) to authenticated;
grant execute on function public.task23_capture_sqlstate(text) to authenticated;

insert into auth.users (id, raw_user_meta_data)
values
  (:'driver', '{"full_name":"Task 23 Driver"}'),
  (:'rider', '{"full_name":"Task 23 Rider"}'),
  (:'other', '{"full_name":"Task 23 Other"}'),
  (:'admin', '{"full_name":"Task 23 Admin"}')
on conflict (id) do nothing;

insert into public.profiles (id, full_name, is_admin)
values
  (:'driver', 'Task 23 Driver', false),
  (:'rider', 'Task 23 Rider', false),
  (:'other', 'Task 23 Other', false),
  (:'admin', 'Task 23 Admin', true)
on conflict (id) do update
set full_name = excluded.full_name,
    is_admin = excluded.is_admin;

insert into public.profile_contacts (user_id, phone, whatsapp)
values
  (:'driver', '+15550023001', '+15550023001'),
  (:'rider', '+15550023002', '+15550023002'),
  (:'other', '+15550023003', '+15550023003'),
  (:'admin', '+15550023004', '+15550023004')
on conflict (user_id) do update
set phone = excluded.phone,
    whatsapp = excluded.whatsapp;

insert into public.events (id, name, slug, start_date, is_active)
values (:'event_id', 'Task 23 Event', 'task-23-address-event', current_date, true)
on conflict (id) do nothing;

insert into public.rides (
  id, driver_id, origin_label, destination_label,
  pickup_location, dropoff_location, depart_at,
  seats_total, seats_available, status, event_id
)
values
  (
    :'exact_ride', :'driver', 'Coarse Origin', 'Coarse Dest',
    '777 Exact Pickup Blvd', '888 Exact Dropoff Way',
    now() + interval '2 days', 4, 4, 'active', null
  ),
  (
    :'update_ride', :'driver', 'Label A', 'Label B',
    'Side Pickup Secret', 'Side Dropoff Secret',
    now() + interval '2 days', 3, 3, 'active', null
  ),
  (
    :'cascade_ride', :'driver', 'Cascade A', 'Cascade B',
    'Cascade Pickup', 'Cascade Dropoff',
    now() + interval '2 days', 2, 2, 'active', null
  )
on conflict (id) do update
set origin_label = excluded.origin_label,
    destination_label = excluded.destination_label,
    pickup_location = excluded.pickup_location,
    dropoff_location = excluded.dropoff_location,
    seats_total = excluded.seats_total,
    seats_available = excluded.seats_available,
    status = excluded.status,
    event_id = excluded.event_id;

-- Grants / compat column privileges
select public.task23_assert(
  'pickup_location column still selectable by authenticated',
  has_column_privilege('authenticated', 'public.rides', 'pickup_location', 'SELECT')
);
select public.task23_assert(
  'ride_meetup_locations side table not selectable by authenticated',
  not has_table_privilege('authenticated', 'public.ride_meetup_locations', 'SELECT')
);
select public.task23_assert(
  'ride_meetup_locations side table not selectable by anon',
  not has_table_privilege('anon', 'public.ride_meetup_locations', 'SELECT')
);
select public.task23_assert(
  'divert_ride_meetup execute revoked from authenticated',
  not has_function_privilege('authenticated', 'public.divert_ride_meetup()', 'EXECUTE')
);

-- Anon: no exact in public RPCs; direct rides select denied
set role anon;
select public.task23_assert(
  'anon upcoming rides runtime has no address keys',
  (
    select count(*) = 0
    from (
      select to_jsonb(ride.*) as payload
      from public.public_upcoming_rides(null, null, null, 100, null) ride
      where ride.id = :'exact_ride'::uuid
    ) rows
    where payload ? 'pickup_location'
       or payload ? 'dropoff_location'
  )
);
select public.task23_assert(
  'anon direct rides select denied',
  public.task23_capture_sqlstate(
    format('select pickup_location from public.rides where id = %L::uuid', :'exact_ride')
  ) = '42501'
);
select public.task23_assert(
  'anon ride_meetup_location execute revoked',
  not has_function_privilege('anon', 'public.ride_meetup_location(uuid)', 'EXECUTE')
);
reset role;

-- Authenticated unrelated: direct select coarse only; RPC null exact
set role authenticated;
select set_config('request.jwt.claim.sub', :'other', false);
select public.task23_assert(
  'unrelated authenticated direct select returns coarse only',
  (
    select pickup_location = origin_label
       and dropoff_location = destination_label
       and pickup_location = 'Coarse Origin'
    from public.rides
    where id = :'exact_ride'::uuid
  )
);
select public.task23_assert(
  'unrelated authenticated select star still succeeds',
  public.task23_capture_sqlstate(
    format('select * from public.rides where id = %L::uuid', :'exact_ride')
  ) = '00000'
);
select public.task23_assert(
  'unrelated authenticated RPC returns no exact meetup',
  not exists (
    select 1
    from public.ride_meetup_location(:'exact_ride')
    where pickup_location is not null
       or dropoff_location is not null
  )
);
reset role;

-- Authorized RPC reads exact from side table
set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task23_assert(
  'driver RPC returns exact meetup from side table',
  exists (
    select 1
    from public.ride_meetup_location(:'exact_ride')
    where pickup_location = '777 Exact Pickup Blvd'
      and dropoff_location = '888 Exact Dropoff Way'
  )
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select public.task23_assert(
  'admin RPC returns exact meetup from side table',
  exists (
    select 1
    from public.ride_meetup_location(:'exact_ride')
    where pickup_location = '777 Exact Pickup Blvd'
  )
);
reset role;

-- Old-style driver INSERT with exact values: scrub public row, side table exact, RPC exact
set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task23_assert(
  'driver insert with exact meetup succeeds',
  public.task23_capture_sqlstate(
    format(
      $sql$
      insert into public.rides (
        id, driver_id, origin_label, destination_label,
        pickup_location, dropoff_location, depart_at,
        seats_total, seats_available, status
      ) values (
        %L::uuid, %L::uuid, 'Insert Origin', 'Insert Dest',
        'Insert Exact Pickup', 'Insert Exact Dropoff',
        now() + interval '3 days', 2, 2, 'active'
      )
      $sql$,
      :'insert_ride',
      :'driver'
    )
  ) = '00000'
);
select public.task23_assert(
  'inserted ride public columns are scrubbed to coarse labels',
  (
    select pickup_location = 'Insert Origin'
       and dropoff_location = 'Insert Dest'
    from public.rides
    where id = :'insert_ride'::uuid
  )
);
select public.task23_assert(
  'driver RPC returns exact after old-style insert',
  exists (
    select 1
    from public.ride_meetup_location(:'insert_ride')
    where pickup_location = 'Insert Exact Pickup'
      and dropoff_location = 'Insert Exact Dropoff'
  )
);
reset role;

-- Unrelated UPDATE must not overwrite preserved side-table exact
set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task23_assert(
  'unrelated update does not clobber side-table exact',
  public.task23_capture_sqlstate(
    format(
      'update public.rides set seats_available = 2 where id = %L::uuid',
      :'update_ride'
    )
  ) = '00000'
);
reset role;

select public.task23_assert(
  'side table exact preserved after unrelated update',
  exists (
    select 1
    from public.ride_meetup_locations
    where ride_id = :'update_ride'::uuid
      and pickup_location = 'Side Pickup Secret'
      and dropoff_location = 'Side Dropoff Secret'
  )
);

-- Old-style exact UPDATE still refreshes side table
set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task23_assert(
  'exact meetup update refreshes side table',
  public.task23_capture_sqlstate(
    format(
      $sql$
      update public.rides
      set pickup_location = 'Updated Exact Pickup',
          dropoff_location = 'Updated Exact Dropoff'
      where id = %L::uuid
      $sql$,
      :'update_ride'
    )
  ) = '00000'
);
reset role;

select public.task23_assert(
  'side table reflects refreshed exact meetup',
  exists (
    select 1
    from public.ride_meetup_locations
    where ride_id = :'update_ride'::uuid
      and pickup_location = 'Updated Exact Pickup'
      and dropoff_location = 'Updated Exact Dropoff'
  )
);

-- Banned user denied
insert into public.user_bans (user_id, banned_by, reason)
values (:'rider', :'admin', 'Task 23 temporary ban')
on conflict (user_id) do update
set banned_by = excluded.banned_by,
    reason = excluded.reason,
    ban_id = excluded.ban_id,
    created_at = now(),
    expires_at = null;

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task23_assert(
  'banned user denied ride_meetup_location RPC',
  public.task23_capture_sqlstate(
    format(
      'select * from public.ride_meetup_location(%L::uuid)',
      :'exact_ride'
    )
  ) = 'P0001'
);
reset role;

delete from public.user_bans where user_id = :'rider';

-- FK cascade on ride delete
select public.task23_assert(
  'side row exists before cascade delete',
  exists (
    select 1
    from public.ride_meetup_locations
    where ride_id = :'cascade_ride'::uuid
  )
);

delete from public.rides where id = :'cascade_ride';

select public.task23_assert(
  'delete rides cascades side-table row',
  not exists (
    select 1
    from public.ride_meetup_locations
    where ride_id = :'cascade_ride'::uuid
  )
);

-- Rollback safety: diverter + side insert do not persist on rollback
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'driver', true);
insert into public.rides (
  id, driver_id, origin_label, destination_label,
  pickup_location, dropoff_location, depart_at,
  seats_total, seats_available, status
)
values (
  '00000000-0000-4000-8000-000000023199',
  :'driver',
  'Rollback Origin', 'Rollback Dest',
  'Rollback Exact Pickup', 'Rollback Exact Dropoff',
  now() + interval '4 days', 1, 1, 'active'
);
rollback;

select public.task23_assert(
  'rollback removes scrubbed ride row',
  not exists (
    select 1
    from public.rides
    where id = '00000000-0000-4000-8000-000000023199'::uuid
  )
);
select public.task23_assert(
  'rollback removes side-table exact row',
  not exists (
    select 1
    from public.ride_meetup_locations
    where ride_id = '00000000-0000-4000-8000-000000023199'::uuid
  )
);

-- request_seat locking contract unchanged (task_5 parity)
\set request_ride 00000000-0000-4000-8000-000000023105

insert into public.rides (
  id, driver_id, origin_label, destination_label, depart_at,
  seats_total, seats_available, status
)
values
  (:'request_ride', :'driver', 'Req A', 'Req B', now() + interval '1 day', 2, 2, 'active')
on conflict (id) do nothing;

select public.task23_assert(
  'request_seat authenticated grant preserved',
  has_function_privilege('authenticated', 'public.request_seat(uuid,integer,text)', 'EXECUTE')
);

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task23_assert(
  'request_seat still locks ride row for booking',
  public.request_seat(:'request_ride', 0) = 'requested'
);
reset role;

select public.task23_assert(
  'request_seat leaves active booking state',
  exists (
    select 1
    from public.ride_passengers
    where ride_id = :'request_ride'::uuid
      and passenger_id = :'rider'::uuid
      and status = 'pending'
  )
);

insert into task23_failures
select 'task23 checks have failures', 'see raised assertions above'
where false;

table task23_failures;

select public.task23_assert(
  'task23 checks have no failures',
  not exists (select 1 from task23_failures)
);

select 'task_23_address_zero_downtime: PASS' as result;
