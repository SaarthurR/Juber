-- Address trigger hardening: AFTER capture closes duplicate-ignore exploit (C2),
-- per-column side-table writes (I1), and coarse public label enforcement (I2).

begin;

-- ---------------------------------------------------------------------------
-- Fix 3: coarse public label validator (fail closed for direct REST clients)
-- ---------------------------------------------------------------------------
create or replace function public.assert_coarse_label(p_label text)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if p_label is null or btrim(p_label) = '' then
    raise exception 'coarse_label_required'
      using hint = 'Use a city or neighborhood, not a street address.';
  end if;

  if exists (
    select 1
    from public.places
    where active = true
      and name = p_label
  ) then
    return;
  end if;

  if char_length(p_label) > 80 then
    raise exception 'coarse_label_too_long'
      using hint = 'Use a city or neighborhood, not a street address.';
  end if;

  if p_label ~ '[0-9]' then
    raise exception 'coarse_label_has_digits'
      using hint = 'Use a city or neighborhood, not a street address.';
  end if;

  if p_label ~* '\m(apt|apartment|suite|ste|unit|#|p\.?o\.? box|po box)\M' then
    raise exception 'coarse_label_has_unit_token'
      using hint = 'Use a city or neighborhood, not a street address.';
  end if;

  if p_label !~ '^[[:alpha:][:space:],\.\&''\-]+$' then
    raise exception 'coarse_label_invalid_chars'
      using hint = 'Use a city or neighborhood, not a street address.';
  end if;
end;
$$;

revoke all on function public.assert_coarse_label(text) from public, anon, authenticated;

-- Coarsen legacy public labels that look like street addresses before enforcement.
update public.rides
set origin_label = regexp_replace(btrim(origin_label), '^\d+\s+', '')
where origin_label ~ '[0-9]'
  and not exists (
    select 1 from public.places where active = true and name = rides.origin_label
  );

update public.rides
set destination_label = regexp_replace(btrim(destination_label), '^\d+\s+', '')
where destination_label ~ '[0-9]'
  and not exists (
    select 1 from public.places where active = true and name = rides.destination_label
  );

update public.ride_requests
set origin_label = regexp_replace(btrim(origin_label), '^\d+\s+', '')
where origin_label ~ '[0-9]'
  and not exists (
    select 1 from public.places where active = true and name = ride_requests.origin_label
  );

update public.ride_requests
set destination_label = regexp_replace(btrim(destination_label), '^\d+\s+', '')
where destination_label ~ '[0-9]'
  and not exists (
    select 1 from public.places where active = true and name = ride_requests.destination_label
  );

update public.rides
set origin_label = 'San Jose'
where origin_label ~ '[0-9]';

update public.rides
set destination_label = 'JCNC'
where destination_label ~ '[0-9]';

update public.ride_requests
set origin_label = 'San Jose'
where origin_label ~ '[0-9]';

update public.ride_requests
set destination_label = 'JCNC'
where destination_label ~ '[0-9]';

update public.rides
set pickup_location = origin_label,
    dropoff_location = destination_label
where pickup_location is distinct from origin_label
   or dropoff_location is distinct from destination_label;

do $$
declare
  v_label text;
begin
  for v_label in
    select distinct label
    from (
      select origin_label as label from public.rides
      union all
      select destination_label from public.rides
      union all
      select origin_label from public.ride_requests
      union all
      select destination_label from public.ride_requests
    ) labels
    where label is not null
  loop
    perform public.assert_coarse_label(v_label);
  end loop;
end
$$;

create or replace function public.enforce_ride_coarse_labels()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.assert_coarse_label(new.origin_label);
  perform public.assert_coarse_label(new.destination_label);
  return new;
end;
$$;

create or replace function public.enforce_request_coarse_labels()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.assert_coarse_label(new.origin_label);
  perform public.assert_coarse_label(new.destination_label);
  return new;
end;
$$;

revoke all on function public.enforce_ride_coarse_labels() from public, anon, authenticated;
revoke all on function public.enforce_request_coarse_labels() from public, anon, authenticated;

drop trigger if exists rides_enforce_coarse_labels on public.rides;
create trigger rides_enforce_coarse_labels
  before insert or update of origin_label, destination_label on public.rides
  for each row
  execute function public.enforce_ride_coarse_labels();

drop trigger if exists ride_requests_enforce_coarse_labels on public.ride_requests;
create trigger ride_requests_enforce_coarse_labels
  before insert or update of origin_label, destination_label on public.ride_requests
  for each row
  execute function public.enforce_request_coarse_labels();

-- ---------------------------------------------------------------------------
-- Fix 1 + 2: AFTER capture with recursion guard and per-column side writes
-- ---------------------------------------------------------------------------
drop trigger if exists rides_divert_meetup on public.rides;

create or replace function public.divert_ride_meetup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pickup text;
  v_dropoff text;
  v_pickup_set boolean := false;
  v_dropoff_set boolean := false;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if tg_op = 'INSERT' then
    if new.pickup_location is not null
       and btrim(new.pickup_location) <> ''
       and new.pickup_location is distinct from new.origin_label then
      v_pickup := new.pickup_location;
      v_pickup_set := true;
    elsif new.pickup_location is null
       or btrim(new.pickup_location) = ''
       or new.pickup_location is not distinct from new.origin_label then
      v_pickup := null;
      v_pickup_set := true;
    end if;

    if new.dropoff_location is not null
       and btrim(new.dropoff_location) <> ''
       and new.dropoff_location is distinct from new.destination_label then
      v_dropoff := new.dropoff_location;
      v_dropoff_set := true;
    elsif new.dropoff_location is null
       or btrim(new.dropoff_location) = ''
       or new.dropoff_location is not distinct from new.destination_label then
      v_dropoff := null;
      v_dropoff_set := true;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.pickup_location is not distinct from old.pickup_location then
      v_pickup_set := false;
    elsif new.pickup_location is not null
       and btrim(new.pickup_location) <> ''
       and new.pickup_location is distinct from new.origin_label then
      v_pickup := new.pickup_location;
      v_pickup_set := true;
    else
      v_pickup := null;
      v_pickup_set := true;
    end if;

    if new.dropoff_location is not distinct from old.dropoff_location then
      v_dropoff_set := false;
    elsif new.dropoff_location is not null
       and btrim(new.dropoff_location) <> ''
       and new.dropoff_location is distinct from new.destination_label then
      v_dropoff := new.dropoff_location;
      v_dropoff_set := true;
    else
      v_dropoff := null;
      v_dropoff_set := true;
    end if;
  end if;

  if v_pickup_set or v_dropoff_set then
    if v_pickup is not null or v_dropoff is not null then
      insert into public.ride_meetup_locations
        (ride_id, pickup_location, dropoff_location, updated_at)
      values (new.id, v_pickup, v_dropoff, now())
      on conflict (ride_id) do update
        set pickup_location = case
              when v_pickup_set then excluded.pickup_location
              else ride_meetup_locations.pickup_location
            end,
            dropoff_location = case
              when v_dropoff_set then excluded.dropoff_location
              else ride_meetup_locations.dropoff_location
            end,
            updated_at = now();
    elsif tg_op = 'UPDATE' and (v_pickup_set or v_dropoff_set) then
      update public.ride_meetup_locations
      set pickup_location = case when v_pickup_set then null else pickup_location end,
          dropoff_location = case when v_dropoff_set then null else dropoff_location end,
          updated_at = now()
      where ride_id = new.id
        and (v_pickup_set or v_dropoff_set);
    end if;
  end if;

  if new.pickup_location is distinct from new.origin_label
     or new.dropoff_location is distinct from new.destination_label then
    update public.rides
       set pickup_location = origin_label,
           dropoff_location = destination_label
     where id = new.id
       and (
         pickup_location is distinct from origin_label
         or dropoff_location is distinct from destination_label
       );
  end if;

  return null;
end;
$$;

revoke all on function public.divert_ride_meetup() from public, anon, authenticated;

create trigger rides_capture_meetup
  after insert or update on public.rides
  for each row
  execute function public.divert_ride_meetup();

-- Re-assert RPC grants and guard contracts (unchanged semantics).
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

  if has_function_privilege('authenticated', 'public.request_seat(uuid,integer,text)', 'EXECUTE') then
    null;
  else
    raise exception 'authenticated must execute request_seat';
  end if;
end
$$;

commit;
