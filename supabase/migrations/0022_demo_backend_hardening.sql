-- Demo backend hardening: function-grant hygiene, per-user conversation hide/
-- resurrection, canonical conversation lock, message read guard, atomic ride
-- confirmation and event approval, storage listing removal, FK indexes, and
-- RLS init-plan optimization. Additive only; preserves existing semantics.

-- ============================================================
-- Messaging: per-user hide marker
-- ============================================================
alter table public.conversation_participants
  add column if not exists hidden_at timestamptz;

-- ============================================================
-- delete_conversation: per-caller hide + clear caller's new-message pings
-- ============================================================
create or replace function public.delete_conversation(p_conversation_id uuid)
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

  update public.conversation_participants
  set hidden_at = now()
  where conversation_id = p_conversation_id
    and user_id = v_user_id;

  if not found then
    return false;
  end if;

  update public.notifications
  set read_at = now()
  where recipient_id = v_user_id
    and conversation_id = p_conversation_id
    and type = 'new_message'
    and read_at is null;

  return true;
end;
$$;

-- ============================================================
-- open_conversation: booking validation, canonical order-independent lock,
-- reuse existing thread and resurrect the caller's hidden view
-- ============================================================
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

  perform pg_advisory_xact_lock(
    hashtext(coalesce(p_ride_id, p_request_id)::text),
    hashtext(least(v_user_id, p_other_user_id)::text || greatest(v_user_id, p_other_user_id)::text)
  );

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
    update public.conversation_participants
    set hidden_at = null
    where conversation_id = v_conversation_id
      and user_id = v_user_id
      and hidden_at is not null;
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

-- ============================================================
-- guard_message_update: immutable columns + read-receipt integrity.
-- Runs SECURITY INVOKER (fires as the updating participant) with a fixed
-- search_path.
-- ============================================================
create or replace function public.guard_message_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.body <> old.body
     or new.sender_id <> old.sender_id
     or new.conversation_id <> old.conversation_id
     or new.created_at <> old.created_at then
    raise exception 'Only read_at may be updated on a message';
  end if;

  if new.read_at is distinct from old.read_at then
    if new.sender_id = auth.uid() then
      raise exception 'Senders cannot change read receipts on their own messages';
    end if;
    if old.read_at is not null and new.read_at is null then
      raise exception 'Read receipts cannot be cleared';
    end if;
  end if;

  return new;
end;
$$;

-- ============================================================
-- confirm_passenger: driver-only, atomic seat confirmation with recount.
-- validate_ride_passenger / sync_seats remain as defense-in-depth.
-- ============================================================
create or replace function public.confirm_passenger(p_passenger_id uuid, p_ride_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_seats_total int;
  v_status text;
  v_confirmed int;
  v_target_id uuid;
begin
  if v_user_id is null then
    return false;
  end if;

  select r.seats_total, r.status
    into v_seats_total, v_status
  from public.rides r
  where r.id = p_ride_id
    and r.driver_id = v_user_id
  for update;

  if v_seats_total is null then
    return false;
  end if;

  if v_status <> 'active' then
    raise exception 'This ride is not accepting confirmations';
  end if;

  select count(*) into v_confirmed
  from public.ride_passengers
  where ride_id = p_ride_id
    and status = 'confirmed';

  if v_confirmed >= v_seats_total then
    raise exception 'This ride has no seats left';
  end if;

  select id into v_target_id
  from public.ride_passengers
  where ride_id = p_ride_id
    and passenger_id = p_passenger_id
    and status = 'pending'
  for update;

  if v_target_id is null then
    raise exception 'No pending seat request to confirm';
  end if;

  update public.ride_passengers
  set status = 'confirmed'
  where id = v_target_id;

  return true;
end;
$$;

-- ============================================================
-- approve_event_request: admin-only, atomic, idempotent event creation.
-- ============================================================
create or replace function public.approve_event_request(p_request_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_req public.event_requests%rowtype;
  v_event_id uuid;
  v_slug text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve event requests';
  end if;

  select * into v_req
  from public.event_requests
  where id = p_request_id
  for update;

  if not found then
    return null;
  end if;

  if v_req.status <> 'pending' then
    return v_req.approved_event_id;
  end if;

  v_slug := trim(both '-' from lower(regexp_replace(coalesce(v_req.name, 'event'), '[^a-zA-Z0-9]+', '-', 'g')));
  if v_slug = '' then
    v_slug := 'event';
  end if;
  if exists (select 1 from public.events e where e.slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  end if;

  insert into public.events (name, slug, description, venue_label, start_date, end_date, is_active, created_by)
  values (
    v_req.name,
    v_slug,
    v_req.description,
    v_req.venue_label,
    v_req.start_date,
    v_req.end_date,
    true,
    v_user_id
  )
  returning id into v_event_id;

  update public.event_requests
  set status = 'approved',
      reviewed_by = v_user_id,
      reviewed_at = now(),
      approved_event_id = v_event_id
  where id = p_request_id;

  return v_event_id;
end;
$$;

-- ============================================================
-- Foreign-key covering indexes
-- ============================================================
create index if not exists events_created_by_idx on public.events(created_by);
create index if not exists places_event_id_idx on public.places(event_id);
create index if not exists rides_driver_id_idx on public.rides(driver_id);
create index if not exists ride_requests_rider_id_idx on public.ride_requests(rider_id);
create index if not exists ride_requests_event_id_idx on public.ride_requests(event_id);
create index if not exists ride_requests_accepted_driver_id_idx on public.ride_requests(accepted_driver_id);
create index if not exists conversations_ride_id_idx on public.conversations(ride_id);
create index if not exists conversations_request_id_idx on public.conversations(request_id);
create index if not exists messages_sender_id_idx on public.messages(sender_id);
create index if not exists notifications_actor_id_idx on public.notifications(actor_id);
create index if not exists notifications_ride_id_idx on public.notifications(ride_id);
create index if not exists notifications_request_id_idx on public.notifications(request_id);
create index if not exists event_requests_requested_by_idx on public.event_requests(requested_by);
create index if not exists event_requests_reviewed_by_idx on public.event_requests(reviewed_by);
create index if not exists event_requests_approved_event_id_idx on public.event_requests(approved_event_id);

-- ============================================================
-- Storage hygiene: public avatar bucket keeps public object URLs and
-- owner-scoped writes, but drop the broad listing policy.
-- ============================================================
drop policy if exists "avatars_public_read" on storage.objects;

-- ============================================================
-- RLS init-plan optimization (auth.uid()/is_admin() wrapped in a scalar
-- subquery so they evaluate once per statement). Row-dependent helpers
-- (is_participant, shares_booking) are intentionally left unwrapped.
-- ============================================================
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "events_admin_write" on public.events;
create policy "events_insert_admin" on public.events
  for insert to authenticated with check ((select public.is_admin()));
create policy "events_update_admin" on public.events
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "events_delete_admin" on public.events
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists "places_admin_write" on public.places;
create policy "places_insert_admin" on public.places
  for insert to authenticated with check ((select public.is_admin()));
create policy "places_update_admin" on public.places
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "places_delete_admin" on public.places
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists "rides_insert_own" on public.rides;
create policy "rides_insert_own" on public.rides
  for insert to authenticated with check (driver_id = (select auth.uid()));
drop policy if exists "rides_update_own" on public.rides;
create policy "rides_update_own" on public.rides
  for update to authenticated using (driver_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "rides_delete_own" on public.rides;
create policy "rides_delete_own" on public.rides
  for delete to authenticated using (driver_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "requests_insert_own" on public.ride_requests;
create policy "requests_insert_own" on public.ride_requests
  for insert to authenticated with check (rider_id = (select auth.uid()));
drop policy if exists "requests_update_own" on public.ride_requests;
create policy "requests_update_own" on public.ride_requests
  for update to authenticated using (rider_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "requests_delete_own" on public.ride_requests;
create policy "requests_delete_own" on public.ride_requests
  for delete to authenticated using (rider_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "passengers_select" on public.ride_passengers;
create policy "passengers_select" on public.ride_passengers
  for select to authenticated using (
    status = 'confirmed'
    or passenger_id = (select auth.uid())
    or exists (
      select 1 from public.rides r
      where r.id = ride_id
        and (r.driver_id = (select auth.uid()) or (select public.is_admin()))
    )
  );
drop policy if exists "passengers_insert_own" on public.ride_passengers;
create policy "passengers_insert_own" on public.ride_passengers
  for insert to authenticated with check (passenger_id = (select auth.uid()));
drop policy if exists "passengers_update_driver" on public.ride_passengers;
create policy "passengers_update_driver" on public.ride_passengers
  for update to authenticated using (
    exists (
      select 1 from public.rides r
      where r.id = ride_id
        and (r.driver_id = (select auth.uid()) or (select public.is_admin()))
    )
  );
drop policy if exists "passengers_delete_own" on public.ride_passengers;
create policy "passengers_delete_own" on public.ride_passengers
  for delete to authenticated using (passenger_id = (select auth.uid()));

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert to authenticated with check (
    sender_id = (select auth.uid()) and public.is_participant(conversation_id)
  );

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (recipient_id = (select auth.uid()));
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

drop policy if exists "contacts_select_own_or_booking" on public.profile_contacts;
create policy "contacts_select_own_or_booking" on public.profile_contacts
  for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_booking(user_id));
drop policy if exists "contacts_insert_own" on public.profile_contacts;
create policy "contacts_insert_own" on public.profile_contacts
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "contacts_update_own" on public.profile_contacts;
create policy "contacts_update_own" on public.profile_contacts
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "event_requests_select_own_or_admin" on public.event_requests;
create policy "event_requests_select_own_or_admin" on public.event_requests
  for select to authenticated
  using (requested_by = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "event_requests_insert_own" on public.event_requests;
create policy "event_requests_insert_own" on public.event_requests
  for insert to authenticated with check (requested_by = (select auth.uid()));
drop policy if exists "event_requests_admin_update" on public.event_requests;
create policy "event_requests_admin_update" on public.event_requests
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "event_requests_admin_delete" on public.event_requests;
create policy "event_requests_admin_delete" on public.event_requests
  for delete to authenticated using ((select public.is_admin()));

-- ============================================================
-- Function execute grants: strip broad anon/PUBLIC access, re-grant only the
-- intended callable surface, and keep trigger-only functions uncallable.
-- ============================================================
alter default privileges in schema public revoke execute on functions from anon;
revoke execute on all functions in schema public from anon, public;

grant execute on function public.public_upcoming_rides(text, text, date, integer, boolean) to anon, authenticated;

grant execute on function public.accept_ride_request(uuid) to authenticated;
grant execute on function public.cancel_ride(uuid, text) to authenticated;
grant execute on function public.cancel_seat(uuid, text) to authenticated;
grant execute on function public.close_ride(uuid) to authenticated;
grant execute on function public.contacts_for_booking(uuid[]) to authenticated;
grant execute on function public.delete_conversation(uuid) to authenticated;
grant execute on function public.get_contact(uuid) to authenticated;
grant execute on function public.open_conversation(uuid, uuid, uuid) to authenticated;
grant execute on function public.profile_has_contact(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_participant(uuid) to authenticated;
grant execute on function public.shares_booking(uuid) to authenticated;
grant execute on function public.confirm_passenger(uuid, uuid) to authenticated;
grant execute on function public.approve_event_request(uuid) to authenticated;

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.sync_seats() from anon, authenticated;
revoke execute on function public.validate_ride_passenger() from anon, authenticated;
revoke execute on function public.notify_seat_requested() from anon, authenticated;
revoke execute on function public.notify_seat_status() from anon, authenticated;
revoke execute on function public.notify_ride_cancelled() from anon, authenticated;
revoke execute on function public.notify_new_message() from anon, authenticated;
revoke execute on function public.require_ride_driver_contact() from anon, authenticated;
revoke execute on function public.prevent_active_driver_contact_removal() from anon, authenticated;
revoke execute on function public.guard_message_update() from anon, authenticated;
