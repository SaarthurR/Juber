drop policy if exists "requests_insert_own" on public.ride_requests;
create policy "requests_insert_own" on public.ride_requests
  for insert to authenticated
  with check (
    rider_id = (select auth.uid())
    and status = 'active'
    and accepted_driver_id is null
    and accepted_at is null
  );

revoke update on table public.profiles from authenticated;
grant update (
  full_name,
  avatar_url,
  neighborhood,
  pronouns,
  instagram,
  preferred_contact,
  car_make_model,
  car_color,
  bio
) on table public.profiles to authenticated;

do $$
begin
  alter publication supabase_realtime drop table public.conversation_hides;
exception
  when undefined_object then null;
end
$$;

drop policy if exists "passengers_delete_own" on public.ride_passengers;
drop policy if exists "rides_delete_own" on public.rides;
drop policy if exists "requests_delete_own" on public.ride_requests;

revoke delete on table public.ride_passengers from authenticated;
revoke delete on table public.rides from authenticated;
revoke delete on table public.ride_requests from authenticated;

create or replace function public.guard_ride_passenger_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver_id uuid;
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

  select r.driver_id, r.seats_total
    into v_driver_id, v_seats_total
  from public.rides r
  where r.id = old.ride_id
  for update;

  if old.status = 'pending'
     and new.status = 'confirmed'
     and (v_driver_id = v_user_id or public.is_admin()) then
    select count(*) into v_confirmed
    from public.ride_passengers
    where ride_id = old.ride_id
      and status = 'confirmed';

    if v_confirmed >= coalesce(v_seats_total, 0) then
      raise exception 'This ride has no seats left';
    end if;
    return new;
  end if;

  if old.status = 'pending'
     and new.status = 'declined'
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

revoke execute on function public.guard_ride_passenger_transition()
  from public, anon, authenticated;
