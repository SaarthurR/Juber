-- Runtime verification for task_24 (no psql meta-commands); safe to run on linked remote.
begin;

do $$
declare
  v_driver uuid := '00000000-0000-4000-8000-000000024901';
  v_other uuid := '00000000-0000-4000-8000-000000024902';
  v_victim uuid := '00000000-0000-4000-8000-000000024903';
  v_rows int;
begin
  insert into auth.users (id, raw_user_meta_data)
  values
    (v_driver, '{"full_name":"Task24 Runtime Driver"}'),
    (v_other, '{"full_name":"Task24 Runtime Other"}')
  on conflict (id) do nothing;

  insert into public.profiles (id, full_name, is_admin)
  values
    (v_driver, 'Task24 Runtime Driver', false),
    (v_other, 'Task24 Runtime Other', false)
  on conflict (id) do update set full_name = excluded.full_name;

  insert into public.profile_contacts (user_id, phone, whatsapp)
  values
    (v_driver, '+15550024901', '+15550024901'),
    (v_other, '+15550024902', '+15550024902')
  on conflict (user_id) do update set phone = excluded.phone, whatsapp = excluded.whatsapp;

  insert into public.rides (
    id, driver_id, origin_label, destination_label,
    pickup_location, dropoff_location, depart_at,
    seats_total, seats_available, status
  )
  values (
    v_victim, v_driver, 'Runtime Victim Origin', 'Runtime Victim Dest',
    'Runtime Victim Exact Pickup', 'Runtime Victim Exact Dropoff',
    now() + interval '2 days', 3, 3, 'active'
  )
  on conflict (id) do update
  set pickup_location = excluded.pickup_location,
      dropoff_location = excluded.dropoff_location;

  perform set_config('request.jwt.claim.sub', v_other::text, true);
  with attempt as (
    insert into public.rides (
      id, driver_id, origin_label, destination_label,
      pickup_location, dropoff_location, depart_at,
      seats_total, seats_available, status
    ) values (
      v_victim, v_other, 'Evil Origin', 'Evil Dest',
      'Attacker Pickup', 'Attacker Dropoff',
      now() + interval '1 day', 2, 2, 'active'
    )
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into v_rows from attempt;

  if v_rows <> 0 then
    raise exception 'duplicate-ignore wrote a row';
  end if;

  if not exists (
    select 1
    from public.ride_meetup_locations
    where ride_id = v_victim
      and pickup_location = 'Runtime Victim Exact Pickup'
      and dropoff_location = 'Runtime Victim Exact Dropoff'
  ) then
    raise exception 'duplicate-ignore clobbered victim side row';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relname = 'rides'
      and t.tgname = 'rides_capture_meetup'
      and not t.tgisinternal
  ) then
    raise exception 'rides_capture_meetup trigger missing';
  end if;

  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relname = 'rides'
      and t.tgname = 'rides_divert_meetup'
      and not t.tgisinternal
  ) then
    raise exception 'legacy rides_divert_meetup trigger still present';
  end if;

  begin
    perform public.assert_coarse_label('777 Exact Pickup Blvd');
    raise exception 'malicious label should fail';
  exception
    when others then
      if sqlstate <> 'P0001' then
        raise;
      end if;
  end;

  perform public.assert_coarse_label('San Jose');
  perform public.assert_coarse_label('JCNC');
end;
$$;

rollback;

select 'task_24_runtime_verification: PASS' as result;
