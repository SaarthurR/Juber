-- Fresh sweep closure: expired booking guards, message id immutability,
-- narrow table grants, event-scoped public rides RPC, and per-event counts.

-- ============================================================
-- confirm_passenger: reject departed rides
-- ============================================================
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

  select count(*) into v_confirmed
  from public.ride_passengers
  where ride_id = p_ride_id
    and status = 'confirmed';

  if v_confirmed >= v_seats_total then
    raise exception 'This ride has no seats left';
  end if;

  select id into v_target_id
  from public.ride_passengers
  where ride_id = p_ride_id
    and passenger_id = p_passenger_id
    and status = 'pending'
  for update;

  if v_target_id is null then
    raise exception 'No pending seat request to confirm';
  end if;

  update public.ride_passengers
  set status = 'confirmed'
  where id = v_target_id;

  return true;
end;
$$;

-- ============================================================
-- guard_ride_passenger_transition: reject confirmation after departure
-- ============================================================
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

-- ============================================================
-- accept_ride_request: reject expired request windows
-- ============================================================
create or replace function public.accept_ride_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.ride_requests
  set status = 'fulfilled',
      accepted_driver_id = auth.uid(),
      accepted_at = now()
  where id = p_request_id
    and status = 'active'
    and rider_id <> auth.uid()
    and coalesce(latest_date, depart_at::date) >= current_date;

  if found then
    insert into public.notifications (recipient_id, actor_id, type, request_id)
    select rider_id, auth.uid(), 'request_accepted', id
    from public.ride_requests
    where id = p_request_id;
  end if;

  return found;
end;
$$;

-- ============================================================
-- guard_ride_request_transition: reject fulfillment after window
-- ============================================================
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
    if coalesce(old.latest_date, old.depart_at::date) < current_date then
      raise exception 'This ride request is no longer available';
    end if;
    return new;
  end if;

  raise exception 'Invalid ride request status transition';
end;
$$;

-- ============================================================
-- guard_message_update: block primary key mutation
-- ============================================================
create or replace function public.guard_message_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.body is distinct from old.body
     or new.sender_id is distinct from old.sender_id
     or new.conversation_id is distinct from old.conversation_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Only read_at may be updated on a message';
  end if;

  if new.read_at is distinct from old.read_at then
    if new.sender_id = auth.uid() then
      raise exception 'Senders cannot change read receipts on their own messages';
    end if;
    if old.read_at is not null and new.read_at is null then
      raise exception 'Read receipts cannot be cleared';
    end if;
  end if;

  return new;
end;
$$;

-- ============================================================
-- public_event_rides: event-scoped public ride feed
-- ============================================================
create or replace function public.public_event_rides(
  p_slug text,
  p_limit integer default 100
)
returns table (
  id uuid,
  driver_id uuid,
  origin_label text,
  destination_label text,
  pickup_location text,
  dropoff_location text,
  depart_at timestamptz,
  round_trip boolean,
  return_depart_at timestamptz,
  return_notes text,
  seats_total integer,
  seats_available integer,
  gas_contribution numeric,
  notes text,
  event_id uuid,
  status text,
  cancellation_reason text,
  created_at timestamptz,
  driver jsonb,
  event jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.driver_id,
    r.origin_label,
    r.destination_label,
    r.pickup_location,
    r.dropoff_location,
    r.depart_at,
    r.round_trip,
    r.return_depart_at,
    r.return_notes,
    r.seats_total,
    r.seats_available,
    r.gas_contribution,
    r.notes,
    r.event_id,
    r.status,
    r.cancellation_reason,
    r.created_at,
    case
      when p.id is null then null
      else jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'neighborhood', p.neighborhood,
        'pronouns', p.pronouns,
        'car_make_model', p.car_make_model,
        'car_color', p.car_color
      )
    end as driver,
    jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug) as event
  from public.events e
  join public.rides r on r.event_id = e.id
  left join public.profiles p on p.id = r.driver_id
  where e.slug = p_slug
    and e.is_active = true
    and coalesce(e.end_date, e.start_date) >= current_date
    and r.status = 'active'
    and r.depart_at >= now()
  order by r.depart_at asc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
$$;

-- ============================================================
-- public_upcoming_events / public_event_board: per-event ride counts
-- ============================================================
create or replace function public.public_upcoming_events()
returns table (
  id uuid,
  name text,
  slug text,
  description text,
  venue_label text,
  start_date date,
  end_date date,
  is_active boolean,
  created_at timestamptz,
  ride_count bigint,
  seats_available bigint
)
language sql
stable
security definer set search_path = public
as $$
  with public_ride_counts as (
    select
      r.event_id,
      count(*)::bigint as ride_count,
      coalesce(sum(r.seats_available), 0)::bigint as seats_available
    from public.rides r
    where r.status = 'active'
      and r.depart_at >= now()
      and r.event_id is not null
    group by r.event_id
  )
  select
    e.id,
    e.name,
    e.slug,
    e.description,
    e.venue_label,
    e.start_date,
    e.end_date,
    e.is_active,
    e.created_at,
    coalesce(counts.ride_count, 0)::bigint as ride_count,
    coalesce(counts.seats_available, 0)::bigint as seats_available
  from public.events e
  left join public_ride_counts counts on counts.event_id = e.id
  where e.is_active = true
    and coalesce(e.end_date, e.start_date) >= current_date
  order by e.start_date asc nulls last, e.created_at asc;
$$;

create or replace function public.public_event_board(p_slug text)
returns table (
  id uuid,
  name text,
  slug text,
  description text,
  venue_label text,
  start_date date,
  end_date date,
  is_active boolean,
  created_at timestamptz,
  ride_count bigint,
  seats_available bigint
)
language sql
stable
security definer set search_path = public
as $$
  with public_ride_counts as (
    select
      r.event_id,
      count(*)::bigint as ride_count,
      coalesce(sum(r.seats_available), 0)::bigint as seats_available
    from public.rides r
    where r.status = 'active'
      and r.depart_at >= now()
      and r.event_id is not null
    group by r.event_id
  )
  select
    e.id,
    e.name,
    e.slug,
    e.description,
    e.venue_label,
    e.start_date,
    e.end_date,
    e.is_active,
    e.created_at,
    coalesce(counts.ride_count, 0)::bigint as ride_count,
    coalesce(counts.seats_available, 0)::bigint as seats_available
  from public.events e
  left join public_ride_counts counts on counts.event_id = e.id
  where e.slug = p_slug
    and e.is_active = true
    and coalesce(e.end_date, e.start_date) >= current_date
  limit 1;
$$;

-- ============================================================
-- Function grants
-- ============================================================
revoke all on function public.public_event_rides(text, integer) from public;
grant execute on function public.public_event_rides(text, integer) to anon, authenticated;

grant execute on function public.confirm_passenger(uuid, uuid) to authenticated;
grant execute on function public.accept_ride_request(uuid) to authenticated;
revoke execute on function public.guard_ride_passenger_transition() from public, anon, authenticated;
revoke execute on function public.guard_ride_request_transition() from public, anon, authenticated;
revoke execute on function public.guard_message_update() from public, anon, authenticated;

-- ============================================================
-- Table grants: narrow anon/authenticated to current app contract
-- ============================================================
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all tables in schema public from authenticated;
alter default privileges in schema public revoke all privileges on tables from anon;
alter default privileges in schema public revoke all privileges on tables from authenticated;

grant select on table public.profiles to authenticated;
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

grant select, insert, update on table public.profile_contacts to authenticated;

grant select, insert, update, delete on table public.events to authenticated;
grant select, insert, update, delete on table public.places to authenticated;

grant select, insert on table public.rides to authenticated;
grant update (status, cancellation_reason) on table public.rides to authenticated;

grant select, insert on table public.ride_requests to authenticated;
grant update (status, accepted_driver_id, accepted_at) on table public.ride_requests to authenticated;

grant select, insert on table public.ride_passengers to authenticated;
grant update (status) on table public.ride_passengers to authenticated;

grant select on table public.conversations to authenticated;
grant select on table public.conversation_participants to authenticated;
grant select on table public.conversation_hides to authenticated;

grant select, insert on table public.messages to authenticated;
grant update (read_at) on table public.messages to authenticated;

grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

grant select, insert, update, delete on table public.event_requests to authenticated;

-- ============================================================
-- Grant assertions
-- ============================================================
do $$
begin
  if has_table_privilege('anon', 'public.profiles', 'SELECT')
     or has_table_privilege('anon', 'public.events', 'SELECT')
     or has_table_privilege('anon', 'public.messages', 'SELECT')
     or has_table_privilege('anon', 'public.notifications', 'SELECT')
     or has_table_privilege('anon', 'public.rides', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.messages', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.rides', 'TRUNCATE') then
    raise exception 'fresh sweep grant cleanup failed';
  end if;

  if not has_table_privilege('authenticated', 'public.messages', 'SELECT')
     or not has_column_privilege('authenticated', 'public.messages', 'read_at', 'UPDATE')
     or has_column_privilege('authenticated', 'public.messages', 'id', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.notifications', 'SELECT')
     or not has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.rides', 'SELECT')
     or not has_table_privilege('authenticated', 'public.ride_requests', 'SELECT') then
    raise exception 'fresh sweep required grants missing';
  end if;

  if not has_function_privilege('anon', 'public.public_event_rides(text,integer)', 'EXECUTE') then
    raise exception 'anon must execute public_event_rides';
  end if;
end $$;
