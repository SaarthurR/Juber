begin;

create or replace function public.request_seat(
  p_ride_id uuid,
  p_guest_count int default 0,
  p_pickup_note text default null
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
  v_pickup_note text;
  v_passenger_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if public.is_banned(v_user_id) then
    raise exception 'account_suspended';
  end if;

  if p_guest_count < 0 or p_guest_count > 4 then
    raise exception 'Guest count must be between 0 and 4';
  end if;

  v_pickup_note := nullif(trim(coalesce(p_pickup_note, '')), '');
  if v_pickup_note is null then
    raise exception 'Enter a pickup location or choose your saved home.';
  end if;
  if char_length(v_pickup_note) > 500 then
    raise exception 'Pickup note must be 500 characters or fewer';
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
    values (p_ride_id, v_user_id, 'pending', p_guest_count)
    returning id into v_passenger_id;
  else
    delete from public.ride_passengers
    where id = v_existing.id;

    insert into public.ride_passengers (ride_id, passenger_id, status, guest_count)
    values (p_ride_id, v_user_id, 'pending', p_guest_count)
    returning id into v_passenger_id;
  end if;

  insert into public.ride_passenger_pickup_notes (ride_passenger_id, pickup_note)
  values (v_passenger_id, v_pickup_note);

  return 'requested';
end;
$$;

revoke execute on function public.request_seat(uuid, integer, text) from public, anon;
grant execute on function public.request_seat(uuid, integer, text) to authenticated;

revoke insert on table public.ride_passengers from authenticated;

do $$
declare
  v_definition text :=
    pg_get_functiondef('public.request_seat(uuid,integer,text)'::regprocedure);
begin
  if v_definition not ilike '%v_pickup_note is null%'
     or v_definition not ilike '%for update%'
     or v_definition not ilike '%public.is_banned%' then
    raise exception 'request_seat hardening is incomplete';
  end if;

  if has_table_privilege('authenticated', 'public.ride_passengers', 'INSERT') then
    raise exception 'authenticated must create ride passengers through request_seat';
  end if;

  if not has_table_privilege('authenticated', 'public.ride_passengers', 'SELECT') then
    raise exception 'authenticated must retain ride passenger reads';
  end if;

  if not has_column_privilege('authenticated', 'public.ride_passengers', 'status', 'UPDATE') then
    raise exception 'authenticated must retain driver status updates';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.request_seat(uuid,integer,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must execute request_seat';
  end if;

  if has_function_privilege(
    'anon',
    'public.request_seat(uuid,integer,text)',
    'EXECUTE'
  ) then
    raise exception 'anon must not execute request_seat';
  end if;
end
$$;

commit;
