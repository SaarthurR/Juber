create or replace function public.guard_ride_passenger_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver_id uuid;
  v_ride_status text;
  v_seats_total int;
  v_confirmed int;
begin
  if new.ride_id is distinct from old.ride_id
     or new.passenger_id is distinct from old.passenger_id then
    raise exception 'Ride and passenger identity cannot be changed';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  select r.driver_id, r.status, r.seats_total
    into v_driver_id, v_ride_status, v_seats_total
  from public.rides r
  where r.id = old.ride_id
  for update;

  if old.status = 'pending'
     and new.status in ('confirmed', 'declined')
     and (v_driver_id = v_user_id or public.is_admin()) then
    if v_ride_status <> 'active' then
      raise exception 'This ride is no longer accepting passenger decisions';
    end if;

    if new.status = 'confirmed' then
      select count(*) into v_confirmed
      from public.ride_passengers
      where ride_id = old.ride_id
        and status = 'confirmed';

      if v_confirmed >= coalesce(v_seats_total, 0) then
        raise exception 'This ride has no seats left';
      end if;
    end if;

    return new;
  end if;

  if old.status in ('pending', 'confirmed')
     and new.status = 'cancelled'
     and old.passenger_id = v_user_id then
    return new;
  end if;

  raise exception 'Invalid ride passenger status transition';
end;
$$;

revoke execute on function public.guard_ride_passenger_transition()
  from public, anon, authenticated;
