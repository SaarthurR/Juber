-- Public preview feed for signed-out visitors.
--
-- Keep the broad tables behind authenticated RLS while exposing only the ride
-- card fields and safe driver profile fields needed for the marketing preview.

create or replace function public.public_upcoming_rides(
  p_from text default null,
  p_to text default null,
  p_date date default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  driver_id uuid,
  origin_label text,
  destination_label text,
  depart_at timestamptz,
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

grant execute on function public.public_upcoming_rides(text, text, date, integer) to anon, authenticated;
