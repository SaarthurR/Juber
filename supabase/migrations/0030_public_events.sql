-- Privacy-safe public event browsing.
--
-- Anonymous users can browse active, non-past event ride boards without direct
-- table access or ride request identity exposure.

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
      ride.event_id,
      count(*)::bigint as ride_count,
      coalesce(sum(ride.seats_available), 0)::bigint as seats_available
    from public.public_upcoming_rides(null, null, null, 100, null) ride
    where ride.event_id is not null
    group by ride.event_id
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
      ride.event_id,
      count(*)::bigint as ride_count,
      coalesce(sum(ride.seats_available), 0)::bigint as seats_available
    from public.public_upcoming_rides(null, null, null, 100, null) ride
    where ride.event_id is not null
    group by ride.event_id
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

revoke all on function public.public_upcoming_events() from public;
revoke all on function public.public_event_board(text) from public;

grant execute on function public.public_upcoming_events() to anon, authenticated;
grant execute on function public.public_event_board(text) to anon, authenticated;

revoke all on table public.events from anon;
revoke all on table public.ride_requests from anon;
