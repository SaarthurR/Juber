-- Plus-ones: guest_count on ride_passengers + seat math uses sum(1 + guest_count).

alter table public.ride_passengers
  add column if not exists guest_count int not null default 0
    check (guest_count between 0 and 4);

create or replace function public.sync_seats()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.rides r
  set seats_available = greatest(
    0,
    r.seats_total - (
      select coalesce(sum(1 + p.guest_count), 0)
      from public.ride_passengers p
      where p.ride_id = r.id
        and p.status = 'confirmed'
    )
  )
  where r.id = coalesce(new.ride_id, old.ride_id);
  return coalesce(new, old);
end;
$$;

drop function if exists public.request_seat(uuid);

create or replace function public.request_seat(
  p_ride_id uuid,
  p_guest_count int default 0
)
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

  if p_guest_count < 0 or p_guest_count > 4 then
    raise exception 'Guest count must be between 0 and 4';
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

  select coalesce(sum(1 + guest_count), 0)
    into v_confirmed
  from public.ride_passengers
  where ride_id = p_ride_id
    and status = 'confirmed';

  if v_confirmed + 1 + p_guest_count > v_ride.seats_total then
    raise exception 'This ride is full';
  end if;

  if v_existing.id is null then
    insert into public.ride_passengers (ride_id, passenger_id, status, guest_count)
    values (p_ride_id, v_user_id, 'pending', p_guest_count);
  else
    delete from public.ride_passengers
    where id = v_existing.id;

    insert into public.ride_passengers (ride_id, passenger_id, status, guest_count)
    values (p_ride_id, v_user_id, 'pending', p_guest_count);
  end if;

  return 'requested';
end;
$$;

create or replace function public.confirm_passenger(p_passenger_id uuid, p_ride_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_seats_total int;
  v_status text;
  v_depart_at timestamptz;
  v_confirmed int;
  v_target_id uuid;
  v_target_guests int;
begin
  if v_user_id is null then
    return false;
  end if;

  select r.seats_total, r.status, r.depart_at
    into v_seats_total, v_status, v_depart_at
  from public.rides r
  where r.id = p_ride_id
    and r.driver_id = v_user_id
  for update;

  if v_seats_total is null then
    return false;
  end if;

  if v_status <> 'active' or v_depart_at <= now() then
    raise exception 'This ride is not accepting confirmations';
  end if;

  select id, guest_count
    into v_target_id, v_target_guests
  from public.ride_passengers
  where ride_id = p_ride_id
    and passenger_id = p_passenger_id
    and status = 'pending'
  for update;

  if v_target_id is null then
    raise exception 'No pending seat request to confirm';
  end if;

  select coalesce(sum(1 + guest_count), 0)
    into v_confirmed
  from public.ride_passengers
  where ride_id = p_ride_id
    and status = 'confirmed';

  if v_confirmed + 1 + coalesce(v_target_guests, 0) > v_seats_total then
    raise exception 'This ride has no seats left';
  end if;

  update public.ride_passengers
  set status = 'confirmed'
  where id = v_target_id;

  return true;
end;
$$;

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
  v_depart_at timestamptz;
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

  select r.driver_id, r.status, r.depart_at, r.seats_total
    into v_driver_id, v_ride_status, v_depart_at, v_seats_total
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
      if v_depart_at <= now() then
        raise exception 'This ride is not accepting confirmations';
      end if;

      select coalesce(sum(1 + guest_count), 0)
        into v_confirmed
      from public.ride_passengers
      where ride_id = old.ride_id
        and status = 'confirmed';

      if v_confirmed + 1 + coalesce(new.guest_count, 0) > coalesce(v_seats_total, 0) then
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
    select coalesce(sum(1 + guest_count), 0)
      into v_confirmed
    from public.ride_passengers
    where ride_id = new.ride_id
      and status = 'confirmed'
      and id <> new.id;

    if v_confirmed + 1 + coalesce(new.guest_count, 0) > v_seats_total then
      raise exception 'This ride has no seats left';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.request_seat(uuid, integer) from public, anon;
grant execute on function public.request_seat(uuid, integer) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.request_seat(uuid,integer)', 'EXECUTE') then
    raise exception 'anon must not execute request_seat';
  end if;

  if has_function_privilege('public', 'public.request_seat(uuid,integer)', 'EXECUTE') then
    raise exception 'public must not execute request_seat';
  end if;

  if not has_function_privilege('authenticated', 'public.request_seat(uuid,integer)', 'EXECUTE') then
    raise exception 'authenticated must execute request_seat';
  end if;
end
$$;
