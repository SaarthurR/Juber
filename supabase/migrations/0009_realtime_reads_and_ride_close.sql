-- Live read receipts and atomic ride closing.

-- Make repeated local resets/db pushes tolerant of prior publication changes.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.conversation_participants;
exception
  when duplicate_object then null;
end $$;

-- Driver-only close flow. Marks the ride completed, then removes active
-- passenger links and all ride-scoped conversations/messages.
create or replace function public.close_ride(p_ride_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;

  update public.rides
  set status = 'completed'
  where id = p_ride_id
    and driver_id = v_user_id
    and status = 'active';

  if not found then
    return false;
  end if;

  delete from public.conversations
  where ride_id = p_ride_id;

  delete from public.ride_passengers
  where ride_id = p_ride_id;

  return true;
end;
$$;

grant execute on function public.close_ride(uuid) to authenticated;

-- Driver-only cancel flow. The ride update fires cancellation notifications,
-- then operational passenger links and ride-scoped chats are removed.
create or replace function public.cancel_ride(p_ride_id uuid, p_reason text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or nullif(trim(p_reason), '') is null then
    return false;
  end if;

  update public.rides
  set status = 'cancelled',
      cancellation_reason = trim(p_reason)
  where id = p_ride_id
    and driver_id = v_user_id
    and status = 'active';

  if not found then
    return false;
  end if;

  delete from public.conversations
  where ride_id = p_ride_id;

  delete from public.ride_passengers
  where ride_id = p_ride_id;

  return true;
end;
$$;

grant execute on function public.cancel_ride(uuid, text) to authenticated;
