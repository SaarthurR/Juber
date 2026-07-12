-- Move pickup_note off broadly-selectable ride_passengers into a private side table.
-- Gated SECURITY DEFINER RPCs remain the only read path; strip free-text notes from anon public RPCs.

create table public.ride_passenger_pickup_notes (
  ride_passenger_id uuid primary key
    references public.ride_passengers(id) on delete cascade,
  pickup_note text not null
    check (char_length(pickup_note) <= 500)
);

alter table public.ride_passenger_pickup_notes enable row level security;

revoke all on table public.ride_passenger_pickup_notes from anon, authenticated, public;

insert into public.ride_passenger_pickup_notes (ride_passenger_id, pickup_note)
select id, pickup_note
from public.ride_passengers
where pickup_note is not null;

alter table public.ride_passengers drop column if exists pickup_note;

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

  if p_guest_count < 0 or p_guest_count > 4 then
    raise exception 'Guest count must be between 0 and 4';
  end if;

  v_pickup_note := nullif(trim(coalesce(p_pickup_note, '')), '');
  if v_pickup_note is not null and char_length(v_pickup_note) > 500 then
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

  if v_pickup_note is not null then
    insert into public.ride_passenger_pickup_notes (ride_passenger_id, pickup_note)
    values (v_passenger_id, v_pickup_note);
  end if;

  return 'requested';
end;
$$;

create or replace function public.ride_meetup_location(p_ride_id uuid)
returns table (
  pickup_location text,
  dropoff_location text,
  pickup_note text,
  passenger_id uuid
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.pickup_location,
    r.dropoff_location,
    pn.pickup_note,
    rp.passenger_id
  from public.rides r
  left join public.ride_passengers rp
    on rp.ride_id = r.id
   and rp.status in ('pending', 'confirmed')
   and (
     r.driver_id = auth.uid()
     or public.is_admin()
     or (
       rp.passenger_id = auth.uid()
       and rp.status = 'confirmed'
     )
   )
  left join public.ride_passenger_pickup_notes pn
    on pn.ride_passenger_id = rp.id
  where r.id = p_ride_id
    and auth.uid() is not null
    and (
      r.driver_id = auth.uid()
      or public.is_admin()
      or exists (
        select 1
        from public.ride_passengers self_rp
        where self_rp.ride_id = r.id
          and self_rp.passenger_id = auth.uid()
          and self_rp.status = 'confirmed'
          and public.shares_booking(r.driver_id)
      )
    );
$$;

drop function if exists public.public_upcoming_rides(text, text, date, integer, boolean);

create or replace function public.public_upcoming_rides(
  p_from text default null,
  p_to text default null,
  p_date date default null,
  p_limit integer default 50,
  p_round_trip boolean default null
)
returns table (
  id uuid,
  driver_id uuid,
  origin_label text,
  destination_label text,
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
security definer set search_path = public
as $$
  select
    r.id,
    r.driver_id,
    r.origin_label,
    r.destination_label,
    r.depart_at,
    r.round_trip,
    r.return_depart_at,
    null::text as return_notes,
    r.seats_total,
    r.seats_available,
    r.gas_contribution,
    null::text as notes,
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
    case
      when e.id is null then null
      else jsonb_build_object(
        'id', e.id,
        'name', e.name,
        'slug', e.slug
      )
    end as event
  from public.rides r
  left join public.profiles p on p.id = r.driver_id
  left join public.events e on e.id = r.event_id
  where r.status = 'active'
    and r.depart_at >= now()
    and (p_from is null or r.origin_label ilike ('%' || p_from || '%'))
    and (p_to is null or r.destination_label ilike ('%' || p_to || '%'))
    and (p_round_trip is null or r.round_trip = p_round_trip)
    and (
      p_date is null
      or (
        r.depart_at >= p_date::timestamptz
        and r.depart_at < (p_date + 1)::timestamptz
      )
    )
  order by r.depart_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

drop function if exists public.public_event_rides(text, integer);

create or replace function public.public_event_rides(
  p_slug text,
  p_limit integer default 100
)
returns table (
  id uuid,
  driver_id uuid,
  origin_label text,
  destination_label text,
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
    r.depart_at,
    r.round_trip,
    r.return_depart_at,
    null::text as return_notes,
    r.seats_total,
    r.seats_available,
    r.gas_contribution,
    null::text as notes,
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

revoke execute on function public.request_seat(uuid, integer, text) from public, anon;
grant execute on function public.request_seat(uuid, integer, text) to authenticated;

revoke execute on function public.ride_meetup_location(uuid) from public, anon;
grant execute on function public.ride_meetup_location(uuid) to authenticated;

revoke all on function public.public_upcoming_rides(text, text, date, integer, boolean) from public;
grant execute on function public.public_upcoming_rides(text, text, date, integer, boolean) to anon, authenticated;

revoke all on function public.public_event_rides(text, integer) from public;
grant execute on function public.public_event_rides(text, integer) to anon, authenticated;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ride_passengers'
      and column_name = 'pickup_note'
  ) then
    raise exception 'pickup_note column must be dropped from ride_passengers';
  end if;

  if has_table_privilege('authenticated', 'public.ride_passenger_pickup_notes', 'SELECT') then
    raise exception 'authenticated must not directly select pickup notes table';
  end if;

  if has_table_privilege('anon', 'public.ride_passenger_pickup_notes', 'SELECT') then
    raise exception 'anon must not directly select pickup notes table';
  end if;

  if not has_function_privilege('authenticated', 'public.request_seat(uuid,integer,text)', 'EXECUTE') then
    raise exception 'authenticated must execute request_seat';
  end if;

  if not has_function_privilege('authenticated', 'public.ride_meetup_location(uuid)', 'EXECUTE') then
    raise exception 'authenticated must execute ride_meetup_location';
  end if;
end $$;
