-- Address zero-downtime closure: private exact meetup side table, coarse compat columns,
-- diverter trigger, and gated RPC reads from side table (Plan A adjudication).

begin;

create table public.ride_meetup_locations (
  ride_id uuid primary key
    references public.rides (id) on delete cascade
    deferrable initially deferred,
  pickup_location text
    check (pickup_location is null or char_length(pickup_location) <= 500),
  dropoff_location text
    check (dropoff_location is null or char_length(dropoff_location) <= 500),
  updated_at timestamptz not null default now()
);

alter table public.ride_meetup_locations enable row level security;

revoke all on table public.ride_meetup_locations from anon, authenticated, public;

insert into public.ride_meetup_locations (ride_id, pickup_location, dropoff_location)
select id, pickup_location, dropoff_location
from public.rides
where pickup_location is distinct from origin_label
   or dropoff_location is distinct from destination_label;

update public.rides
set pickup_location = origin_label,
    dropoff_location = destination_label
where pickup_location is distinct from origin_label
   or dropoff_location is distinct from destination_label;

create or replace function public.divert_ride_meetup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pickup text;
  v_dropoff text;
  v_capture boolean := false;
begin
  if tg_op = 'INSERT' then
    v_capture :=
      new.pickup_location is distinct from new.origin_label
      or new.dropoff_location is distinct from new.destination_label;
    if v_capture then
      v_pickup := new.pickup_location;
      v_dropoff := new.dropoff_location;
    end if;
  elsif tg_op = 'UPDATE' then
    if (
      new.pickup_location is distinct from old.pickup_location
      or new.dropoff_location is distinct from old.dropoff_location
    ) and (
      new.pickup_location is distinct from new.origin_label
      or new.dropoff_location is distinct from new.destination_label
    ) then
      v_capture := true;
      v_pickup := new.pickup_location;
      v_dropoff := new.dropoff_location;
    end if;
  end if;

  if v_capture then
    insert into public.ride_meetup_locations
      (ride_id, pickup_location, dropoff_location, updated_at)
    values (new.id, v_pickup, v_dropoff, now())
    on conflict (ride_id) do update
      set pickup_location = excluded.pickup_location,
          dropoff_location = excluded.dropoff_location,
          updated_at = now();
  end if;

  new.pickup_location := new.origin_label;
  new.dropoff_location := new.destination_label;
  return new;
end;
$$;

revoke all on function public.divert_ride_meetup() from public, anon, authenticated;

create trigger rides_divert_meetup
  before insert or update on public.rides
  for each row
  execute function public.divert_ride_meetup();

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
      then coalesce(m.pickup_location, r.pickup_location)
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
      then coalesce(m.dropoff_location, r.dropoff_location)
      else null
    end,
    pn.pickup_note,
    rp.passenger_id
  from public.rides r
  left join public.ride_meetup_locations m
    on m.ride_id = r.id
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

  if has_table_privilege('authenticated', 'public.ride_meetup_locations', 'SELECT') then
    raise exception 'authenticated must not directly select ride_meetup_locations';
  end if;

  if has_table_privilege('anon', 'public.ride_meetup_locations', 'SELECT') then
    raise exception 'anon must not directly select ride_meetup_locations';
  end if;
end
$$;

commit;
