-- Message privacy hardening + performance indexes.
--
-- BACKGROUND
-- conversations / conversation_participants rows are only ever created through
-- the public.open_conversation() RPC (SECURITY DEFINER, see 0008), which adds
-- exactly the two correct participants and bypasses RLS. The original
-- "conversations_insert" / "participants_insert" policies used `with check (true)`,
-- which let ANY authenticated user insert themselves into ANY conversation_id and
-- then read every message in it via is_participant(). Since the app never inserts
-- these rows directly from the client, we simply remove the direct-insert path.

-- 1) Close the conversation-snooping hole ---------------------------------
drop policy if exists "participants_insert" on public.conversation_participants;
drop policy if exists "conversations_insert" on public.conversations;
-- (open_conversation runs as definer, so chat creation still works.)

-- 2) Prevent message tampering via the read-receipt UPDATE policy ----------
-- messages_update_read lets a participant UPDATE messages in the conversation so
-- read_at can be set, but it has no column scoping — a participant could rewrite
-- the *other* person's message body. Guard immutable columns with a trigger.
create or replace function public.guard_message_update()
returns trigger
language plpgsql
as $$
begin
  if new.body <> old.body
     or new.sender_id <> old.sender_id
     or new.conversation_id <> old.conversation_id
     or new.created_at <> old.created_at then
    raise exception 'Only read_at may be updated on a message';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_guard_update on public.messages;
create trigger messages_guard_update
  before update on public.messages
  for each row execute function public.guard_message_update();

-- 3) Missing indexes on hot filter / join columns -------------------------
-- ride_passengers is filtered by passenger_id under RLS (passengers_select);
-- the unique(ride_id, passenger_id) constraint only covers ride_id-leading lookups.
create index if not exists ride_passengers_passenger_idx
  on public.ride_passengers(passenger_id);

-- is_participant() and the "list my conversations" query both filter by user_id;
-- the PK (conversation_id, user_id) does not serve user_id-leading lookups.
create index if not exists conversation_participants_user_idx
  on public.conversation_participants(user_id);

-- markConversationRead() filters notifications by conversation_id (added in 0016).
create index if not exists notifications_conversation_idx
  on public.notifications(conversation_id);

-- 4) Remove anon write privileges -----------------------------------------
-- 0002 granted `all` on every table to anon. RLS still blocks anon (all policies
-- are `to authenticated`), but granting writes to the anonymous role is an
-- unnecessary footgun the moment a future table ships without RLS enabled. Anon's
-- only legitimate path is the SECURITY DEFINER public_upcoming_rides() RPC, so it
-- never needs direct table writes.
revoke insert, update, delete on all tables in schema public from anon;
alter default privileges in schema public revoke insert, update, delete on tables from anon;
