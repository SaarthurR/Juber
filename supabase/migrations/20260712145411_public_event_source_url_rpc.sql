-- Append public event source URLs without changing existing output column order,
-- filters, counts, or caller grants.

drop function public.public_upcoming_events();
drop function public.public_event_board(text);

create function public.public_upcoming_events()
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
  seats_available bigint,
  source_url text
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
    coalesce(counts.seats_available, 0)::bigint as seats_available,
    e.source_url
  from public.events e
  left join public_ride_counts counts on counts.event_id = e.id
  where e.is_active = true
    and coalesce(e.end_date, e.start_date) >= current_date
  order by e.start_date asc nulls last, e.created_at asc;
$$;

create function public.public_event_board(p_slug text)
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
  seats_available bigint,
  source_url text
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
    coalesce(counts.seats_available, 0)::bigint as seats_available,
    e.source_url
  from public.events e
  left join public_ride_counts counts on counts.event_id = e.id
  where e.slug = p_slug
    and e.is_active = true
    and coalesce(e.end_date, e.start_date) >= current_date
  limit 1;
$$;

revoke all on function public.public_upcoming_events()
  from public, anon, authenticated, service_role;
revoke all on function public.public_event_board(text)
  from public, anon, authenticated, service_role;

grant execute on function public.public_upcoming_events()
  to anon, authenticated, service_role;
grant execute on function public.public_event_board(text)
  to anon, authenticated, service_role;
