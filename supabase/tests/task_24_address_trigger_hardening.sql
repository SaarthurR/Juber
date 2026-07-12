\set ON_ERROR_STOP on

\set driver 00000000-0000-4000-8000-000000024001
\set rider 00000000-0000-4000-8000-000000024002
\set other 00000000-0000-4000-8000-000000024003
\set admin 00000000-0000-4000-8000-000000024004
\set victim_ride 00000000-0000-4000-8000-000000024101
\set partial_ride 00000000-0000-4000-8000-000000024102
\set clear_ride 00000000-0000-4000-8000-000000024103
\set coarse_ride 00000000-0000-4000-8000-000000024104
\set notify_ride 00000000-0000-4000-8000-000000024105
\set request_ride 00000000-0000-4000-8000-000000024106
\set preset_place 'Jain Center of Northern California'

create temporary table task24_failures (
  label text primary key,
  detail text not null
);
grant select, insert on task24_failures to authenticated;

create or replace function public.task24_assert(label text, condition boolean)
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

create or replace function public.task24_capture_sqlstate(statement text)
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

grant execute on function public.task24_assert(text, boolean) to authenticated;
grant execute on function public.task24_capture_sqlstate(text) to authenticated;

insert into auth.users (id, raw_user_meta_data)
values
  (:'driver', '{"full_name":"Task 24 Driver"}'),
  (:'rider', '{"full_name":"Task 24 Rider"}'),
  (:'other', '{"full_name":"Task 24 Other"}'),
  (:'admin', '{"full_name":"Task 24 Admin"}')
on conflict (id) do nothing;

insert into public.profiles (id, full_name, is_admin)
values
  (:'driver', 'Task 24 Driver', false),
  (:'rider', 'Task 24 Rider', false),
  (:'other', 'Task 24 Other', false),
  (:'admin', 'Task 24 Admin', true)
on conflict (id) do update
set full_name = excluded.full_name,
    is_admin = excluded.is_admin;

insert into public.profile_contacts (user_id, phone, whatsapp)
values
  (:'driver', '+15550024001', '+15550024001'),
  (:'rider', '+15550024002', '+15550024002'),
  (:'other', '+15550024003', '+15550024003'),
  (:'admin', '+15550024004', '+15550024004')
on conflict (user_id) do update
set phone = excluded.phone,
    whatsapp = excluded.whatsapp;

-- Victim ride with exact side-table values (C2 baseline)
insert into public.rides (
  id, driver_id, origin_label, destination_label,
  pickup_location, dropoff_location, depart_at,
  seats_total, seats_available, status
)
values (
  :'victim_ride', :'driver', 'Victim Origin', 'Victim Dest',
  'Victim Exact Pickup', 'Victim Exact Dropoff',
  now() + interval '2 days', 4, 4, 'active'
)
on conflict (id) do update
set pickup_location = excluded.pickup_location,
    dropoff_location = excluded.dropoff_location;

select public.task24_assert(
  'victim side row seeded with exact meetup',
  exists (
    select 1
    from public.ride_meetup_locations
    where ride_id = :'victim_ride'::uuid
      and pickup_location = 'Victim Exact Pickup'
      and dropoff_location = 'Victim Exact Dropoff'
  )
);

-- C2: duplicate-ignore insert must not overwrite victim side row
set role authenticated;
select set_config('request.jwt.claim.sub', :'other', false);
select public.task24_assert(
  'duplicate-ignore insert affects zero rows',
  (
    with attempt as (
      insert into public.rides (
        id, driver_id, origin_label, destination_label,
        pickup_location, dropoff_location, depart_at,
        seats_total, seats_available, status
      ) values (
        :'victim_ride'::uuid, :'other'::uuid, 'Evil Origin', 'Evil Dest',
        'Attacker Pickup', 'Attacker Dropoff',
        now() + interval '1 day', 2, 2, 'active'
      )
      on conflict (id) do nothing
      returning 1
    )
    select count(*) = 0 from attempt
  )
);
reset role;

select public.task24_assert(
  'duplicate-ignore leaves victim side row byte-identical',
  exists (
    select 1
    from public.ride_meetup_locations
    where ride_id = :'victim_ride'::uuid
      and pickup_location = 'Victim Exact Pickup'
      and dropoff_location = 'Victim Exact Dropoff'
  )
);

-- C2: plain duplicate insert rejected; side unchanged
set role authenticated;
select set_config('request.jwt.claim.sub', :'other', false);
select public.task24_assert(
  'duplicate insert without on conflict raises unique violation',
  public.task24_capture_sqlstate(
    format(
      $sql$
      insert into public.rides (
        id, driver_id, origin_label, destination_label, depart_at,
        seats_total, seats_available, status
      ) values (
        %L::uuid, %L::uuid, 'Dup Origin', 'Dup Dest',
        now() + interval '1 day', 2, 2, 'active'
      )
      $sql$,
      :'victim_ride',
      :'other'
    )
  ) = '23505'
);
reset role;

-- C2: conflict update blocked by RLS
set role authenticated;
select set_config('request.jwt.claim.sub', :'other', false);
select public.task24_assert(
  'conflict update blocked by rides_update_own',
  public.task24_capture_sqlstate(
    format(
      $sql$
      insert into public.rides (
        id, driver_id, origin_label, destination_label,
        pickup_location, dropoff_location, depart_at,
        seats_total, seats_available, status
      ) values (
        %L::uuid, %L::uuid, 'Evil Origin', 'Evil Dest',
        'Evil Pickup', 'Evil Dropoff',
        now() + interval '1 day', 2, 2, 'active'
      )
      on conflict (id) do update
      set pickup_location = excluded.pickup_location
      $sql$,
      :'victim_ride',
      :'other'
    )
  ) = '42501'
);
reset role;

select public.task24_assert(
  'conflict update leaves victim side row unchanged',
  exists (
    select 1
    from public.ride_meetup_locations
    where ride_id = :'victim_ride'::uuid
      and pickup_location = 'Victim Exact Pickup'
  )
);

-- I1 partial update: only pickup changes; dropoff sibling preserved
insert into public.rides (
  id, driver_id, origin_label, destination_label,
  pickup_location, dropoff_location, depart_at,
  seats_total, seats_available, status
)
values (
  :'partial_ride', :'driver', 'Partial Origin', 'Partial Dest',
  'Old Pickup Exact', 'Sibling Dropoff Exact',
  now() + interval '2 days', 3, 3, 'active'
)
on conflict (id) do update
set pickup_location = excluded.pickup_location,
    dropoff_location = excluded.dropoff_location;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task24_assert(
  'partial pickup update succeeds',
  public.task24_capture_sqlstate(
    format(
      $sql$
      update public.rides
      set pickup_location = 'New Pickup Exact'
      where id = %L::uuid
      $sql$,
      :'partial_ride'
    )
  ) = '00000'
);
reset role;

select public.task24_assert(
  'partial update refreshes pickup and preserves dropoff sibling',
  exists (
    select 1
    from public.ride_meetup_locations
    where ride_id = :'partial_ride'::uuid
      and pickup_location = 'New Pickup Exact'
      and dropoff_location = 'Sibling Dropoff Exact'
  )
);

-- I1 clear pickup; dropoff preserved
insert into public.rides (
  id, driver_id, origin_label, destination_label,
  pickup_location, dropoff_location, depart_at,
  seats_total, seats_available, status
)
values (
  :'clear_ride', :'driver', 'Clear Origin', 'Clear Dest',
  'Clear Pickup Exact', 'Keep Dropoff Exact',
  now() + interval '2 days', 3, 3, 'active'
)
on conflict (id) do update
set pickup_location = excluded.pickup_location,
    dropoff_location = excluded.dropoff_location;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task24_assert(
  'clear pickup update succeeds',
  public.task24_capture_sqlstate(
    format(
      'update public.rides set pickup_location = null where id = %L::uuid',
      :'clear_ride'
    )
  ) = '00000'
);
select public.task24_assert(
  'clear both meetup columns succeeds',
  public.task24_capture_sqlstate(
    format(
      $sql$
      update public.rides
      set pickup_location = null, dropoff_location = null
      where id = %L::uuid
      $sql$,
      :'clear_ride'
    )
  ) = '00000'
);
reset role;

select public.task24_assert(
  'clear pickup nulls side pickup and preserves dropoff until both cleared',
  exists (
    select 1
    from public.ride_meetup_locations
    where ride_id = :'clear_ride'::uuid
      and pickup_location is null
      and dropoff_location is null
  )
);

-- I1 coarse-resubmit leaves side exact untouched
insert into public.rides (
  id, driver_id, origin_label, destination_label,
  pickup_location, dropoff_location, depart_at,
  seats_total, seats_available, status
)
values (
  :'coarse_ride', :'driver', 'Coarse Origin', 'Coarse Dest',
  'Hidden Pickup Exact', 'Hidden Dropoff Exact',
  now() + interval '2 days', 3, 3, 'active'
)
on conflict (id) do update
set pickup_location = excluded.pickup_location,
    dropoff_location = excluded.dropoff_location;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task24_assert(
  'coarse-resubmit update succeeds',
  public.task24_capture_sqlstate(
    format(
      $sql$
      update public.rides
      set pickup_location = origin_label,
          dropoff_location = destination_label
      where id = %L::uuid
      $sql$,
      :'coarse_ride'
    )
  ) = '00000'
);
reset role;

select public.task24_assert(
  'coarse-resubmit preserves stored exact in side table',
  exists (
    select 1
    from public.ride_meetup_locations
    where ride_id = :'coarse_ride'::uuid
      and pickup_location = 'Hidden Pickup Exact'
      and dropoff_location = 'Hidden Dropoff Exact'
  )
);

-- I2 malicious labels rejected; valid and preset pass
select public.task24_assert(
  'malicious ride label rejected',
  public.task24_capture_sqlstate(
    format(
      $sql$
      insert into public.rides (
        id, driver_id, origin_label, destination_label, depart_at,
        seats_total, seats_available, status
      ) values (
        '00000000-0000-4000-8000-000000024201'::uuid,
        %L::uuid, '777 Exact Pickup Blvd', 'Victim Dest',
        now() + interval '1 day', 2, 2, 'active'
      )
      $sql$,
      :'driver'
    )
  ) = 'P0001'
);

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task24_assert(
  'valid city label insert succeeds',
  public.task24_capture_sqlstate(
    format(
      $sql$
      insert into public.rides (
        id, driver_id, origin_label, destination_label, depart_at,
        seats_total, seats_available, status
      ) values (
        '00000000-0000-4000-8000-000000024202'::uuid,
        %L::uuid, 'San Jose', 'JCNC',
        now() + interval '1 day', 2, 2, 'active'
      )
      $sql$,
      :'driver'
    )
  ) = '00000'
);
select public.task24_assert(
  'preset place label insert succeeds',
  public.task24_capture_sqlstate(
    format(
      $sql$
      insert into public.rides (
        id, driver_id, origin_label, destination_label, depart_at,
        seats_total, seats_available, status
      ) values (
        '00000000-0000-4000-8000-000000024203'::uuid,
        %L::uuid, %L, 'JCNC',
        now() + interval '1 day', 2, 2, 'active'
      )
      $sql$,
      :'driver',
      :'preset_place'
    )
  ) = '00000'
);
select public.task24_assert(
  'malicious request label rejected',
  public.task24_capture_sqlstate(
    format(
      $sql$
      insert into public.ride_requests (
        id, rider_id, origin_label, destination_label, depart_at, status
      ) values (
        '00000000-0000-4000-8000-000000024204'::uuid,
        %L::uuid, 'Apt 4', 'JCNC',
        now() + interval '1 day', 'active'
      )
      $sql$,
      :'rider'
    )
  ) = 'P0001'
);
reset role;

set role anon;
select public.task24_assert(
  'anon public rides never return digit-bearing labels',
  (
    select count(*) = 0
    from public.public_upcoming_rides(null, null, null, 100, null) ride
    where ride.origin_label ~ '[0-9]'
       or ride.destination_label ~ '[0-9]'
  )
);
reset role;

-- Ordering: real cancel emits notification; scrub update does not
insert into public.rides (
  id, driver_id, origin_label, destination_label, depart_at,
  seats_total, seats_available, status
)
values (
  :'notify_ride', :'driver', 'Notify Origin', 'Notify Dest',
  now() + interval '2 days', 2, 1, 'active'
)
on conflict (id) do nothing;

insert into public.ride_passengers (ride_id, passenger_id, status)
values (:'notify_ride', :'rider', 'pending')
on conflict do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task24_assert(
  'scrub-only meetup update emits no cancellation notification',
  (
    with before_count as (
      select count(*) as c
      from public.notifications
      where ride_id = :'notify_ride'::uuid
        and type = 'ride_cancelled'
    ),
    _update as (
      update public.rides
      set pickup_location = 'Scrub Trigger Exact'
      where id = :'notify_ride'::uuid
      returning 1
    ),
    after_count as (
      select count(*) as c
      from public.notifications
      where ride_id = :'notify_ride'::uuid
        and type = 'ride_cancelled'
    )
    select (select c from before_count) = (select c from after_count)
  )
);
select public.task24_assert(
  'real cancel still emits ride_cancelled notification',
  (
    with before_count as (
      select count(*) as c
      from public.notifications
      where ride_id = :'notify_ride'::uuid
        and type = 'ride_cancelled'
    ),
    _cancel as (
      update public.rides
      set status = 'cancelled',
          cancellation_reason = 'Task 24 cancel check'
      where id = :'notify_ride'::uuid
        and status = 'active'
      returning 1
    ),
    after_count as (
      select count(*) as c
      from public.notifications
      where ride_id = :'notify_ride'::uuid
        and type = 'ride_cancelled'
    )
    select (select c from after_count) > (select c from before_count)
  )
);
reset role;

-- task_23 parity: grants, RPC, request_seat, rollback
select public.task24_assert(
  'divert_ride_meetup execute revoked from authenticated',
  not has_function_privilege('authenticated', 'public.divert_ride_meetup()', 'EXECUTE')
);
select public.task24_assert(
  'assert_coarse_label execute revoked from authenticated',
  not has_function_privilege('authenticated', 'public.assert_coarse_label(text)', 'EXECUTE')
);
select public.task24_assert(
  'rides_capture_meetup trigger exists and rides_divert_meetup is gone',
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relname = 'rides'
      and t.tgname = 'rides_capture_meetup'
      and not t.tgisinternal
  )
  and not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relname = 'rides'
      and t.tgname = 'rides_divert_meetup'
      and not t.tgisinternal
  )
);

insert into public.rides (
  id, driver_id, origin_label, destination_label, depart_at,
  seats_total, seats_available, status
)
values (
  :'request_ride', :'driver', 'Req Origin', 'Req Dest',
  now() + interval '1 day', 2, 2, 'active'
)
on conflict (id) do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub', :'rider', false);
select public.task24_assert(
  'request_seat locking contract preserved',
  public.request_seat(:'request_ride', 0) = 'requested'
);
reset role;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'driver', true);
insert into public.rides (
  id, driver_id, origin_label, destination_label,
  pickup_location, dropoff_location, depart_at,
  seats_total, seats_available, status
)
values (
  '00000000-0000-4000-8000-000000024199',
  :'driver',
  'Rollback Origin', 'Rollback Dest',
  'Rollback Exact Pickup', 'Rollback Exact Dropoff',
  now() + interval '4 days', 1, 1, 'active'
);
rollback;

select public.task24_assert(
  'rollback removes scrubbed ride row',
  not exists (
    select 1 from public.rides
    where id = '00000000-0000-4000-8000-000000024199'::uuid
  )
);
select public.task24_assert(
  'rollback removes side-table exact row',
  not exists (
    select 1 from public.ride_meetup_locations
    where ride_id = '00000000-0000-4000-8000-000000024199'::uuid
  )
);

insert into task24_failures
select 'task24 checks have failures', 'see raised assertions above'
where false;

table task24_failures;

select public.task24_assert(
  'task24 checks have no failures',
  not exists (select 1 from task24_failures)
);

select 'task_24_address_trigger_hardening: PASS' as result;
