drop policy if exists "passengers_insert_own" on public.ride_passengers;
create policy "passengers_insert_own" on public.ride_passengers
  for insert to authenticated
  with check (
    passenger_id = (select auth.uid())
    and status = 'pending'
  );

create or replace function public.guard_ride_passenger_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver_id uuid;
begin
  if new.ride_id is distinct from old.ride_id
     or new.passenger_id is distinct from old.passenger_id then
    raise exception 'Ride and passenger identity cannot be changed';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  select driver_id into v_driver_id
  from public.rides
  where id = old.ride_id;

  if old.status = 'pending'
     and new.status in ('confirmed', 'declined')
     and (v_driver_id = v_user_id or public.is_admin()) then
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

drop trigger if exists ride_passengers_guard_transition on public.ride_passengers;
create trigger ride_passengers_guard_transition
  before update on public.ride_passengers
  for each row execute function public.guard_ride_passenger_transition();

create or replace function public.guard_ride_request_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if new.rider_id is distinct from old.rider_id then
    raise exception 'Ride request owner cannot be changed';
  end if;
  if new.depart_at is distinct from old.depart_at then
    raise exception 'Ride request departure cannot be changed';
  end if;
  if old.accepted_driver_id is not null
     and new.accepted_driver_id is distinct from old.accepted_driver_id then
    raise exception 'Accepted driver cannot be changed';
  end if;

  if new.status is not distinct from old.status then
    if new.accepted_driver_id is distinct from old.accepted_driver_id then
      raise exception 'Accepted driver requires request fulfillment';
    end if;
    return new;
  end if;

  if old.status <> 'active' then
    raise exception 'Ride request status is terminal';
  end if;

  if new.status = 'cancelled'
     and new.accepted_driver_id is not distinct from old.accepted_driver_id then
    return new;
  end if;

  if new.status = 'fulfilled'
     and old.accepted_driver_id is null
     and new.accepted_driver_id = v_user_id
     and new.rider_id <> v_user_id then
    return new;
  end if;

  raise exception 'Invalid ride request status transition';
end;
$$;

drop trigger if exists ride_requests_guard_transition on public.ride_requests;
create trigger ride_requests_guard_transition
  before update on public.ride_requests
  for each row execute function public.guard_ride_request_transition();

create or replace function public.guard_ride_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'active' and new.status in ('completed', 'cancelled') then
    return new;
  end if;

  raise exception 'Invalid ride status transition';
end;
$$;

drop trigger if exists rides_guard_status_transition on public.rides;
create trigger rides_guard_status_transition
  before update on public.rides
  for each row execute function public.guard_ride_status_transition();

revoke all on table public.conversation_hides from authenticated;
grant select on table public.conversation_hides to authenticated;

create index if not exists conversation_hides_user_idx
  on public.conversation_hides (user_id, conversation_id);

revoke execute on function public.guard_ride_passenger_transition()
  from public, anon, authenticated;
revoke execute on function public.guard_ride_request_transition()
  from public, anon, authenticated;
revoke execute on function public.guard_ride_status_transition()
  from public, anon, authenticated;
