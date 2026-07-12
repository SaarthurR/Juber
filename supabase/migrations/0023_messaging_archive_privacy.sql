create table public.conversation_hides (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_hides enable row level security;
revoke all on table public.conversation_hides from anon, public;
revoke insert, update, delete on table public.conversation_hides from authenticated;
grant select on table public.conversation_hides to authenticated;

create policy "conversation_hides_select_own"
  on public.conversation_hides for select to authenticated
  using (user_id = (select auth.uid()));

insert into public.conversation_hides (conversation_id, user_id, hidden_at)
select conversation_id, user_id, hidden_at
from public.conversation_participants
where hidden_at is not null
on conflict (conversation_id, user_id)
do update set hidden_at = excluded.hidden_at;

alter table public.conversation_participants drop column hidden_at;

alter table public.ride_passengers
  drop constraint ride_passengers_status_check;
alter table public.ride_passengers
  add constraint ride_passengers_status_check
  check (status in ('pending', 'confirmed', 'declined', 'cancelled'));

do $$
begin
  alter publication supabase_realtime add table public.conversation_hides;
exception
  when duplicate_object then null;
end $$;

create or replace function public.delete_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = v_user_id
  ) then
    return false;
  end if;

  insert into public.conversation_hides (conversation_id, user_id, hidden_at)
  values (p_conversation_id, v_user_id, now())
  on conflict (conversation_id, user_id)
  do update set hidden_at = excluded.hidden_at;

  update public.notifications
  set read_at = now()
  where recipient_id = v_user_id
    and conversation_id = p_conversation_id
    and type = 'new_message'
    and read_at is null;

  return true;
end;
$$;

create or replace function public.open_conversation(
  p_other_user_id uuid,
  p_ride_id uuid default null,
  p_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
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

  perform pg_advisory_xact_lock(
    hashtext(coalesce(p_ride_id, p_request_id)::text),
    hashtext(least(v_user_id, p_other_user_id)::text || greatest(v_user_id, p_other_user_id)::text)
  );

  select c.id into v_conversation_id
  from public.conversations c
  where c.ride_id is not distinct from p_ride_id
    and c.request_id is not distinct from p_request_id
    and exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id = c.id
        and cp.user_id = v_user_id
    )
    and exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id = c.id
        and cp.user_id = p_other_user_id
    )
  order by c.created_at
  limit 1;

  if v_conversation_id is not null then
    delete from public.conversation_hides
    where conversation_id = v_conversation_id
      and user_id = v_user_id;
    return v_conversation_id;
  end if;

  if p_ride_id is not null and not exists (
    select 1
    from public.rides r
    join public.ride_passengers rp on rp.ride_id = r.id
    where r.id = p_ride_id
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
      and rr.accepted_driver_id is not null
      and (
        (rr.rider_id = v_user_id and rr.accepted_driver_id = p_other_user_id)
        or (rr.rider_id = p_other_user_id and rr.accepted_driver_id = v_user_id)
      )
  ) then
    raise exception 'Messaging unlocks after this request is accepted';
  end if;

  insert into public.conversations (ride_id, request_id)
  values (p_ride_id, p_request_id)
  returning id into v_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conversation_id, v_user_id), (v_conversation_id, p_other_user_id);

  return v_conversation_id;
end;
$$;

create or replace function public.close_ride(p_ride_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
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

  return true;
end;
$$;

create or replace function public.cancel_ride(p_ride_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
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

  return true;
end;
$$;

create or replace function public.cancel_seat(p_ride_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
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
    and r.status = 'active'
  for update of p;

  if v_passenger_id is null or v_driver_id is null then
    return false;
  end if;

  update public.ride_passengers
  set status = 'cancelled'
  where id = v_passenger_id
    and passenger_id = v_user_id
    and status in ('pending', 'confirmed');

  if not found then
    return false;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, ride_id, message)
  values (v_driver_id, v_user_id, 'seat_cancelled', p_ride_id, trim(p_reason));

  return true;
end;
$$;

create or replace function public.shares_booking(p_other uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null and (
    exists (
      select 1
      from public.rides r
      join public.ride_passengers rp on rp.ride_id = r.id
      where r.status = 'active'
        and rp.status = 'confirmed'
        and now() <= r.depart_at + interval '24 hours'
        and (
          (r.driver_id = auth.uid() and rp.passenger_id = p_other)
          or (r.driver_id = p_other and rp.passenger_id = auth.uid())
        )
    )
    or exists (
      select 1
      from public.ride_requests rr
      where rr.status = 'fulfilled'
        and rr.accepted_driver_id is not null
        and now() <= rr.depart_at + interval '24 hours'
        and (
          (rr.rider_id = auth.uid() and rr.accepted_driver_id = p_other)
          or (rr.rider_id = p_other and rr.accepted_driver_id = auth.uid())
        )
    )
  );
$$;

create or replace function public.conversation_message_summaries(p_conversation_ids uuid[])
returns table (
  conversation_id uuid,
  last_message_id uuid,
  last_sender_id uuid,
  last_body text,
  last_created_at timestamptz,
  last_read_at timestamptz,
  unread_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with requested as (
    select cp.conversation_id, ch.hidden_at
    from public.conversation_participants cp
    left join public.conversation_hides ch
      on ch.conversation_id = cp.conversation_id
     and ch.user_id = cp.user_id
    where cp.user_id = auth.uid()
      and cp.conversation_id = any(p_conversation_ids)
  )
  select
    requested.conversation_id,
    latest.id,
    latest.sender_id,
    latest.body,
    latest.created_at,
    latest.read_at,
    coalesce(unread.unread_count, 0)
  from requested
  left join lateral (
    select m.id, m.sender_id, m.body, m.created_at, m.read_at
    from public.messages m
    where m.conversation_id = requested.conversation_id
      and (requested.hidden_at is null or m.created_at > requested.hidden_at)
    order by m.created_at desc, m.id desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*)::bigint as unread_count
    from public.messages m
    where m.conversation_id = requested.conversation_id
      and m.sender_id <> auth.uid()
      and m.read_at is null
      and (requested.hidden_at is null or m.created_at > requested.hidden_at)
  ) unread on true;
$$;

create or replace function public.visible_notification_ids(
  p_limit integer default null,
  p_unread_only boolean default false
)
returns table (id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select n.id
  from public.notifications n
  left join public.conversation_hides ch
    on ch.conversation_id = n.conversation_id
   and ch.user_id = n.recipient_id
  where n.recipient_id = auth.uid()
    and (not p_unread_only or n.read_at is null)
    and (
      n.type <> 'new_message'
      or ch.hidden_at is null
      or n.created_at > ch.hidden_at
    )
  order by n.created_at desc, n.id desc
  limit p_limit;
$$;

revoke execute on function public.delete_conversation(uuid) from public, anon;
revoke execute on function public.open_conversation(uuid, uuid, uuid) from public, anon;
revoke execute on function public.close_ride(uuid) from public, anon;
revoke execute on function public.cancel_ride(uuid, text) from public, anon;
revoke execute on function public.cancel_seat(uuid, text) from public, anon;
revoke execute on function public.shares_booking(uuid) from public, anon;
revoke execute on function public.conversation_message_summaries(uuid[]) from public, anon;
revoke execute on function public.visible_notification_ids(integer, boolean) from public, anon;

grant execute on function public.delete_conversation(uuid) to authenticated;
grant execute on function public.open_conversation(uuid, uuid, uuid) to authenticated;
grant execute on function public.close_ride(uuid) to authenticated;
grant execute on function public.cancel_ride(uuid, text) to authenticated;
grant execute on function public.cancel_seat(uuid, text) to authenticated;
grant execute on function public.shares_booking(uuid) to authenticated;
grant execute on function public.conversation_message_summaries(uuid[]) to authenticated;
grant execute on function public.visible_notification_ids(integer, boolean) to authenticated;
