-- Notifications for ride lifecycle events (seat requested/confirmed/declined, ride cancelled).
-- Notification rows are created exclusively by SECURITY DEFINER triggers, so clients never
-- insert them directly and cannot forge a notification for another user.

-- ============================================================
-- rides: store the driver's required cancellation reason
-- ============================================================
alter table public.rides
  add column if not exists cancellation_reason text;

-- ============================================================
-- notifications
-- ============================================================
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id     uuid references public.profiles(id) on delete set null,
  type         text not null check (
                 type in ('seat_requested','seat_confirmed','seat_declined','ride_cancelled')
               ),
  ride_id      uuid references public.rides(id) on delete cascade,
  message      text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists notifications_recipient_idx
  on public.notifications(recipient_id, created_at desc);

-- ============================================================
-- Triggers: seat requested / confirmed / declined
-- ============================================================
create or replace function public.notify_seat_requested()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_driver uuid;
begin
  select driver_id into v_driver from public.rides where id = new.ride_id;
  if v_driver is not null then
    insert into public.notifications (recipient_id, actor_id, type, ride_id)
    values (v_driver, new.passenger_id, 'seat_requested', new.ride_id);
  end if;
  return new;
end;
$$;

create trigger ride_passengers_notify_requested
  after insert on public.ride_passengers
  for each row execute function public.notify_seat_requested();

create or replace function public.notify_seat_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_driver uuid;
begin
  if new.status is distinct from old.status
     and new.status in ('confirmed', 'declined') then
    select driver_id into v_driver from public.rides where id = new.ride_id;
    insert into public.notifications (recipient_id, actor_id, type, ride_id)
    values (
      new.passenger_id,
      v_driver,
      case when new.status = 'confirmed' then 'seat_confirmed' else 'seat_declined' end,
      new.ride_id
    );
  end if;
  return new;
end;
$$;

create trigger ride_passengers_notify_status
  after update on public.ride_passengers
  for each row execute function public.notify_seat_status();

-- ============================================================
-- Trigger: ride cancelled -> notify every pending/confirmed rider
-- ============================================================
create or replace function public.notify_ride_cancelled()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into public.notifications (recipient_id, actor_id, type, ride_id, message)
    select p.passenger_id, new.driver_id, 'ride_cancelled', new.id, new.cancellation_reason
    from public.ride_passengers p
    where p.ride_id = new.id
      and p.status in ('pending', 'confirmed');
  end if;
  return new;
end;
$$;

create trigger rides_notify_cancelled
  after update on public.rides
  for each row execute function public.notify_ride_cancelled();

-- ============================================================
-- Row Level Security: recipients read & mark-read their own only
-- ============================================================
alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select to authenticated using (recipient_id = auth.uid());

create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Realtime: broadcast new notifications for the live unread badge.
alter publication supabase_realtime add table public.notifications;
