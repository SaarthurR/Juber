-- Replace Instagram-facing contact preferences with WhatsApp, move passenger
-- cancellation reasons into notifications, and mirror new DMs in notifications.

alter table public.notifications
  add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;

alter table public.notifications
  drop constraint if exists notifications_type_check,
  add constraint notifications_type_check check (
    type in (
      'seat_requested',
      'seat_confirmed',
      'seat_declined',
      'seat_cancelled',
      'ride_cancelled',
      'request_accepted',
      'new_message'
    )
  );

alter table public.profiles
  drop constraint if exists profiles_preferred_contact_check;

update public.profiles
set preferred_contact = 'whatsapp'
where preferred_contact = 'instagram';

alter table public.profiles
  add constraint profiles_preferred_contact_check check (
    preferred_contact in ('phone', 'whatsapp', 'message')
  );

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

  select p.id, r.driver_id
    into v_passenger_id, v_driver_id
  from public.ride_passengers p
  join public.rides r on r.id = p.ride_id
  where p.ride_id = p_ride_id
    and p.passenger_id = v_user_id
    and p.status in ('pending', 'confirmed')
    and r.status = 'active';

  if v_passenger_id is null or v_driver_id is null then
    return false;
  end if;

  delete from public.ride_passengers
  where id = v_passenger_id
    and passenger_id = v_user_id;

  insert into public.notifications (recipient_id, actor_id, type, ride_id, message)
  values (v_driver_id, v_user_id, 'seat_cancelled', p_ride_id, trim(p_reason));

  return true;
end;
$$;

grant execute on function public.cancel_seat(uuid, text) to authenticated;

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, actor_id, type, conversation_id, message)
  select cp.user_id, new.sender_id, 'new_message', new.conversation_id, 'One new message'
  from public.conversation_participants cp
  where cp.conversation_id = new.conversation_id
    and cp.user_id <> new.sender_id;

  return new;
end;
$$;

drop trigger if exists messages_notify_new_message on public.messages;
create trigger messages_notify_new_message
  after insert on public.messages
  for each row execute function public.notify_new_message();
