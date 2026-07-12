create or replace function public.ride_meetup_location(p_ride_id uuid)
returns table (
  pickup_location text,
  dropoff_location text,
  pickup_note text,
  passenger_id uuid
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is not null and public.is_banned(auth.uid()) then
    raise exception 'account_suspended';
  end if;

  return query
  select
    case
      when r.driver_id = auth.uid()
        or public.is_admin()
        or (
          rp.passenger_id = auth.uid()
          and rp.status = 'confirmed'
          and public.shares_booking(r.driver_id)
        )
      then r.pickup_location
      else null
    end,
    case
      when r.driver_id = auth.uid()
        or public.is_admin()
        or (
          rp.passenger_id = auth.uid()
          and rp.status = 'confirmed'
          and public.shares_booking(r.driver_id)
        )
      then r.dropoff_location
      else null
    end,
    pn.pickup_note,
    rp.passenger_id
  from public.rides r
  left join public.ride_passengers rp
    on rp.ride_id = r.id
   and rp.status in ('pending', 'confirmed')
   and (
     r.driver_id = auth.uid()
     or public.is_admin()
     or rp.passenger_id = auth.uid()
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
          and (
            self_rp.status = 'pending'
            or (
              self_rp.status = 'confirmed'
              and public.shares_booking(r.driver_id)
            )
          )
      )
    );
end;
$$;

revoke execute on function public.ride_meetup_location(uuid) from public, anon;
grant execute on function public.ride_meetup_location(uuid) to authenticated;

do $$
declare
  v_definition text :=
    pg_get_functiondef('public.ride_meetup_location(uuid)'::regprocedure);
begin
  if v_definition not ilike '%is_banned%'
     or v_definition not ilike '%self_rp.status = ''pending''%'
     or v_definition not ilike '%rp.passenger_id = auth.uid()%' then
    raise exception 'ride_meetup_location guards are incomplete';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.ride_meetup_location(uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must execute ride_meetup_location';
  end if;

  if has_function_privilege(
    'anon',
    'public.ride_meetup_location(uuid)',
    'EXECUTE'
  ) then
    raise exception 'anon must not execute ride_meetup_location';
  end if;
end
$$;
