alter table public.rides
  add column if not exists round_trip boolean not null default false,
  add column if not exists return_depart_at timestamptz,
  add column if not exists return_notes text;

drop function if exists public.public_upcoming_rides(text, text, date, integer);

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
security definer set search_path = public
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

grant execute on function public.public_upcoming_rides(text, text, date, integer, boolean) to anon, authenticated;
