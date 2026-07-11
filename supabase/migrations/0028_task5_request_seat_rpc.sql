create or replace function public.request_seat(p_ride_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ride public.rides%rowtype;
  v_existing public.ride_passengers%rowtype;
  v_confirmed integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
    into v_ride
  from public.rides
  where id = p_ride_id
  for update;

  if v_ride.id is null then
    raise exception 'Ride not found';
  end if;
  if v_ride.driver_id = v_user_id then
    raise exception 'You cannot reserve a seat in your own ride';
  end if;
  if v_ride.status <> 'active' then
    raise exception 'This ride is not accepting reservations';
  end if;
  if v_ride.depart_at <= now() then
    raise exception 'This ride has already departed';
  end if;

  select *
    into v_existing
  from public.ride_passengers
  where ride_id = p_ride_id
    and passenger_id = v_user_id
  for update;

  if v_existing.id is not null and v_existing.status in ('pending', 'confirmed') then
    return 'exists';
  end if;

  select count(*)
    into v_confirmed
  from public.ride_passengers
  where ride_id = p_ride_id
    and status = 'confirmed';

  if v_confirmed >= v_ride.seats_total then
    raise exception 'This ride is full';
  end if;

  if v_existing.id is null then
    insert into public.ride_passengers (ride_id, passenger_id, status)
    values (p_ride_id, v_user_id, 'pending');
  else
    delete from public.ride_passengers
    where id = v_existing.id;

    insert into public.ride_passengers (ride_id, passenger_id, status)
    values (p_ride_id, v_user_id, 'pending');
  end if;

  return 'requested';
end;
$$;

revoke execute on function public.request_seat(uuid) from public, anon;
grant execute on function public.request_seat(uuid) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.request_seat(uuid)', 'EXECUTE') then
    raise exception 'anon must not execute request_seat';
  end if;

  if has_function_privilege('public', 'public.request_seat(uuid)', 'EXECUTE') then
    raise exception 'public must not execute request_seat';
  end if;

  if not has_function_privilege('authenticated', 'public.request_seat(uuid)', 'EXECUTE') then
    raise exception 'authenticated must execute request_seat';
  end if;
end
$$;
