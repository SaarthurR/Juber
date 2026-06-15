-- Enforce ride-passenger invariants at the database boundary too. Server
-- Actions validate these before writing, but clients can still call Supabase
-- directly under RLS.

create or replace function public.validate_ride_passenger()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_driver uuid;
  v_status text;
  v_depart_at timestamptz;
  v_seats_total int;
  v_confirmed int;
begin
  select driver_id, status, depart_at, seats_total
    into v_driver, v_status, v_depart_at, v_seats_total
  from public.rides
  where id = new.ride_id;

  if v_driver is null then
    raise exception 'Ride not found';
  end if;

  if tg_op = 'INSERT' then
    if new.passenger_id = v_driver then
      raise exception 'Drivers cannot reserve seats in their own rides';
    end if;
    if v_status <> 'active' or v_depart_at <= now() then
      raise exception 'This ride is not accepting reservations';
    end if;
  end if;

  if new.status = 'confirmed'
     and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    select count(*)
      into v_confirmed
    from public.ride_passengers
    where ride_id = new.ride_id
      and status = 'confirmed'
      and id <> new.id;

    if v_confirmed >= v_seats_total then
      raise exception 'This ride has no seats left';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ride_passengers_validate on public.ride_passengers;
create trigger ride_passengers_validate
  before insert or update on public.ride_passengers
  for each row execute function public.validate_ride_passenger();
