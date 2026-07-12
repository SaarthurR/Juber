-- Runtime verification for task_23 (no psql meta-commands); safe to run on linked remote.
begin;

do $$
declare
  v_driver uuid := '00000000-0000-4000-8000-000000023901';
  v_other uuid := '00000000-0000-4000-8000-000000023902';
  v_ride uuid := '00000000-0000-4000-8000-000000023901';
  v_insert uuid := '00000000-0000-4000-8000-000000023902';
begin
  insert into auth.users (id, raw_user_meta_data)
  values
    (v_driver, '{"full_name":"Task23 Runtime Driver"}'),
    (v_other, '{"full_name":"Task23 Runtime Other"}')
  on conflict (id) do nothing;

  insert into public.profiles (id, full_name, is_admin)
  values
    (v_driver, 'Task23 Runtime Driver', false),
    (v_other, 'Task23 Runtime Other', false)
  on conflict (id) do update set full_name = excluded.full_name;

  insert into public.profile_contacts (user_id, phone, whatsapp)
  values
    (v_driver, '+15550023901', '+15550023901'),
    (v_other, '+15550023902', '+15550023902')
  on conflict (user_id) do update set phone = excluded.phone, whatsapp = excluded.whatsapp;

  insert into public.rides (
    id, driver_id, origin_label, destination_label,
    pickup_location, dropoff_location, depart_at,
    seats_total, seats_available, status
  )
  values (
    v_ride, v_driver, 'Runtime Origin', 'Runtime Dest',
    'Runtime Exact Pickup', 'Runtime Exact Dropoff',
    now() + interval '2 days', 2, 2, 'active'
  )
  on conflict (id) do update
  set pickup_location = excluded.pickup_location,
      dropoff_location = excluded.dropoff_location;

  if not exists (
    select 1 from public.rides
    where id = v_ride
      and pickup_location = 'Runtime Origin'
      and dropoff_location = 'Runtime Dest'
  ) then
    raise exception 'scrub failed';
  end if;

  if not exists (
    select 1 from public.ride_meetup_locations
    where ride_id = v_ride
      and pickup_location = 'Runtime Exact Pickup'
  ) then
    raise exception 'side table capture failed';
  end if;

  perform set_config('request.jwt.claim.sub', v_driver::text, true);
  if not exists (
    select 1 from public.ride_meetup_location(v_ride)
    where pickup_location = 'Runtime Exact Pickup'
  ) then
    raise exception 'driver rpc exact failed';
  end if;

  perform set_config('request.jwt.claim.sub', v_other::text, true);
  if exists (
    select 1 from public.ride_meetup_location(v_ride)
    where pickup_location is not null
  ) then
    raise exception 'unrelated rpc should be null exact';
  end if;

  if not (
    select pickup_location = origin_label
    from public.rides
    where id = v_ride
  ) then
    raise exception 'direct select not coarse';
  end if;

  perform set_config('request.jwt.claim.sub', v_driver::text, true);
  update public.rides set seats_available = 1 where id = v_ride;
  if not exists (
    select 1 from public.ride_meetup_locations
    where ride_id = v_ride and pickup_location = 'Runtime Exact Pickup'
  ) then
    raise exception 'unrelated update clobbered side table';
  end if;
end;
$$;

rollback;

select 'task_23_runtime_verification: PASS' as result;
