create function public.public_ride_detail(p_ride_id uuid)
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
    null::text,
    r.seats_total,
    r.seats_available,
    r.gas_contribution,
    null::text,
    r.event_id,
    r.status,
    r.cancellation_reason,
    r.created_at,
    case when p.id is null then null else jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'avatar_url', p.avatar_url,
      'neighborhood', p.neighborhood,
      'pronouns', p.pronouns,
      'car_make_model', p.car_make_model,
      'car_color', p.car_color
    ) end,
    case when e.id is null then null else jsonb_build_object(
      'id', e.id,
      'name', e.name,
      'slug', e.slug
    ) end
  from public.rides r
  left join public.profiles p on p.id = r.driver_id
  left join public.events e on e.id = r.event_id
  where r.id = p_ride_id
    and r.status = 'active'
    and r.depart_at >= now();
$$;

revoke all on function public.public_ride_detail(uuid) from public;
grant execute on function public.public_ride_detail(uuid) to anon, authenticated;
