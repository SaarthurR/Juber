-- Require a reachable driver and restrict chats to confirmed bookings.

create or replace function public.profile_has_contact(p_profile_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and (
        nullif(trim(coalesce(p.phone, '')), '') is not null
        or nullif(trim(coalesce(p.whatsapp, '')), '') is not null
      )
  );
$$;

create or replace function public.require_ride_driver_contact()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.profile_has_contact(new.driver_id) then
    raise exception 'Add a phone or WhatsApp number before posting a ride';
  end if;
  return new;
end;
$$;

drop trigger if exists rides_require_driver_contact on public.rides;
create trigger rides_require_driver_contact
  before insert or update of driver_id on public.rides
  for each row execute function public.require_ride_driver_contact();

create or replace function public.prevent_active_driver_contact_removal()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if nullif(trim(coalesce(new.phone, '')), '') is null
     and nullif(trim(coalesce(new.whatsapp, '')), '') is null
     and exists (
       select 1 from public.rides r
       where r.driver_id = new.id and r.status = 'active'
     ) then
    raise exception 'Keep a phone or WhatsApp number while you have an active ride';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_keep_active_driver_contact on public.profiles;
create trigger profiles_keep_active_driver_contact
  before update of phone, whatsapp on public.profiles
  for each row execute function public.prevent_active_driver_contact_removal();

-- Remove legacy chats that were opened without a completed booking.
delete from public.conversations c
where (c.ride_id is null and c.request_id is null)
   or (
     c.ride_id is not null
     and not exists (
       select 1
       from public.rides r
       join public.ride_passengers rp on rp.ride_id = r.id
       where r.id = c.ride_id
         and r.status = 'active'
         and rp.status = 'confirmed'
         and exists (
           select 1 from public.conversation_participants cp
           where cp.conversation_id = c.id and cp.user_id = r.driver_id
         )
         and exists (
           select 1 from public.conversation_participants cp
           where cp.conversation_id = c.id and cp.user_id = rp.passenger_id
         )
     )
   )
   or (
     c.request_id is not null
     and not exists (
       select 1
       from public.ride_requests rr
       where rr.id = c.request_id
         and rr.status = 'fulfilled'
         and rr.accepted_driver_id is not null
         and exists (
           select 1 from public.conversation_participants cp
           where cp.conversation_id = c.id and cp.user_id = rr.rider_id
         )
         and exists (
           select 1 from public.conversation_participants cp
           where cp.conversation_id = c.id and cp.user_id = rr.accepted_driver_id
         )
     )
   );

create or replace function public.open_conversation(
  p_other_user_id uuid,
  p_ride_id uuid default null,
  p_request_id uuid default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'Invalid conversation participant';
  end if;
  if (p_ride_id is null) = (p_request_id is null) then
    raise exception 'A booked ride or accepted request is required';
  end if;

  if p_ride_id is not null and not exists (
    select 1
    from public.rides r
    join public.ride_passengers rp on rp.ride_id = r.id
    where r.id = p_ride_id
      and r.status = 'active'
      and rp.status = 'confirmed'
      and (
        (r.driver_id = v_user_id and rp.passenger_id = p_other_user_id)
        or (r.driver_id = p_other_user_id and rp.passenger_id = v_user_id)
      )
  ) then
    raise exception 'Messaging unlocks after this ride is booked';
  end if;

  if p_request_id is not null and not exists (
    select 1
    from public.ride_requests rr
    where rr.id = p_request_id
      and rr.status = 'fulfilled'
      and (
        (rr.rider_id = v_user_id and rr.accepted_driver_id = p_other_user_id)
        or (rr.rider_id = p_other_user_id and rr.accepted_driver_id = v_user_id)
      )
  ) then
    raise exception 'Messaging unlocks after this request is accepted';
  end if;

  select c.id into v_conversation_id
  from public.conversations c
  where c.ride_id is not distinct from p_ride_id
    and c.request_id is not distinct from p_request_id
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = c.id and cp.user_id = v_user_id
    )
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = c.id and cp.user_id = p_other_user_id
    )
  order by c.created_at
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into public.conversations (ride_id, request_id)
  values (p_ride_id, p_request_id)
  returning id into v_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conversation_id, v_user_id), (v_conversation_id, p_other_user_id);

  return v_conversation_id;
end;
$$;

grant execute on function public.open_conversation(uuid, uuid, uuid) to authenticated;

create or replace function public.cancel_seat(p_ride_id uuid, p_reason text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_passenger_id uuid;
  v_driver_id uuid;
begin
  if v_user_id is null or nullif(trim(p_reason), '') is null then
    return false;
  end if;

  select p.id, r.driver_id into v_passenger_id, v_driver_id
  from public.ride_passengers p
  join public.rides r on r.id = p.ride_id
  where p.ride_id = p_ride_id
    and p.passenger_id = v_user_id
    and p.status in ('pending', 'confirmed')
    and r.status = 'active';

  if v_passenger_id is null or v_driver_id is null then
    return false;
  end if;

  delete from public.conversations c
  where c.ride_id = p_ride_id
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = c.id and cp.user_id = v_user_id
    )
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = c.id and cp.user_id = v_driver_id
    );

  delete from public.ride_passengers
  where id = v_passenger_id and passenger_id = v_user_id;

  insert into public.notifications (recipient_id, actor_id, type, ride_id, message)
  values (v_driver_id, v_user_id, 'seat_cancelled', p_ride_id, trim(p_reason));

  return true;
end;
$$;

grant execute on function public.cancel_seat(uuid, text) to authenticated;
