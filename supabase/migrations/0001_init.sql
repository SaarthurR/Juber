-- JCNC Carpool — initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- profiles
-- ============================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  avatar_url    text,
  neighborhood  text,
  phone         text,
  whatsapp      text,
  car_make_model text,
  car_color     text,
  bio           text,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up,
-- seeding name/avatar from the Google OAuth metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ============================================================
-- events
-- ============================================================
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  venue_label text,
  start_date  date,
  end_date    date,
  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- places (preset pickup / dropoff points)
-- ============================================================
create table public.places (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  address   text,
  kind      text not null default 'neighborhood' check (kind in ('hub','event','neighborhood')),
  event_id  uuid references public.events(id) on delete cascade,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- rides (ride offers from drivers)
-- ============================================================
create table public.rides (
  id               uuid primary key default gen_random_uuid(),
  driver_id        uuid not null references public.profiles(id) on delete cascade,
  origin_label     text not null,
  destination_label text not null default 'Jain Center of Northern California',
  depart_at        timestamptz not null,
  seats_total      int not null check (seats_total > 0),
  seats_available  int not null check (seats_available >= 0),
  gas_contribution numeric(8,2),
  notes            text,
  event_id         uuid references public.events(id) on delete set null,
  status           text not null default 'active' check (status in ('active','cancelled','completed')),
  created_at       timestamptz not null default now()
);
create index rides_depart_at_idx on public.rides(depart_at);
create index rides_event_idx on public.rides(event_id);

-- ============================================================
-- ride_requests (riders asking for a ride)
-- ============================================================
create table public.ride_requests (
  id               uuid primary key default gen_random_uuid(),
  rider_id         uuid not null references public.profiles(id) on delete cascade,
  origin_label     text not null,
  destination_label text not null default 'Jain Center of Northern California',
  depart_at        timestamptz not null,
  seats_needed     int not null default 1 check (seats_needed > 0),
  notes            text,
  event_id         uuid references public.events(id) on delete set null,
  status           text not null default 'active' check (status in ('active','fulfilled','cancelled')),
  created_at       timestamptz not null default now()
);
create index ride_requests_depart_at_idx on public.ride_requests(depart_at);

-- ============================================================
-- ride_passengers (seat join / booking)
-- ============================================================
create table public.ride_passengers (
  id           uuid primary key default gen_random_uuid(),
  ride_id      uuid not null references public.rides(id) on delete cascade,
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','confirmed','declined')),
  created_at   timestamptz not null default now(),
  unique (ride_id, passenger_id)
);

-- Keep seats_available in sync as passenger statuses change.
create or replace function public.sync_seats()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.rides r
  set seats_available = greatest(
    0,
    r.seats_total - (
      select count(*) from public.ride_passengers p
      where p.ride_id = r.id and p.status = 'confirmed'
    )
  )
  where r.id = coalesce(new.ride_id, old.ride_id);
  return coalesce(new, old);
end;
$$;

create trigger ride_passengers_sync_seats
  after insert or update or delete on public.ride_passengers
  for each row execute function public.sync_seats();

-- ============================================================
-- conversations / participants / messages
-- ============================================================
create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  ride_id    uuid references public.rides(id) on delete set null,
  request_id uuid references public.ride_requests(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  primary key (conversation_id, user_id)
);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  body            text not null,
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);
create index messages_conversation_idx on public.messages(conversation_id, created_at);

-- Helper: is the current user a participant of a conversation?
create or replace function public.is_participant(conv_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = conv_id and user_id = auth.uid()
  );
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles                 enable row level security;
alter table public.events                   enable row level security;
alter table public.places                   enable row level security;
alter table public.rides                    enable row level security;
alter table public.ride_requests            enable row level security;
alter table public.ride_passengers          enable row level security;
alter table public.conversations            enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages                 enable row level security;

-- profiles: anyone signed in can read; only owner can update.
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- events: read by all authenticated; write by admins only.
create policy "events_select" on public.events
  for select to authenticated using (true);
create policy "events_admin_write" on public.events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- places: read by all authenticated; write by admins only.
create policy "places_select" on public.places
  for select to authenticated using (true);
create policy "places_admin_write" on public.places
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- rides: read by all authenticated; owner manages; admin can moderate.
create policy "rides_select" on public.rides
  for select to authenticated using (true);
create policy "rides_insert_own" on public.rides
  for insert to authenticated with check (driver_id = auth.uid());
create policy "rides_update_own" on public.rides
  for update to authenticated using (driver_id = auth.uid() or public.is_admin());
create policy "rides_delete_own" on public.rides
  for delete to authenticated using (driver_id = auth.uid() or public.is_admin());

-- ride_requests: read by all authenticated; owner manages; admin moderates.
create policy "requests_select" on public.ride_requests
  for select to authenticated using (true);
create policy "requests_insert_own" on public.ride_requests
  for insert to authenticated with check (rider_id = auth.uid());
create policy "requests_update_own" on public.ride_requests
  for update to authenticated using (rider_id = auth.uid() or public.is_admin());
create policy "requests_delete_own" on public.ride_requests
  for delete to authenticated using (rider_id = auth.uid() or public.is_admin());

-- ride_passengers: read if you're the passenger or the ride's driver.
create policy "passengers_select" on public.ride_passengers
  for select to authenticated using (
    passenger_id = auth.uid()
    or exists (select 1 from public.rides r where r.id = ride_id and r.driver_id = auth.uid())
  );
create policy "passengers_insert_own" on public.ride_passengers
  for insert to authenticated with check (passenger_id = auth.uid());
-- passenger may cancel their own row; the driver may confirm/decline.
create policy "passengers_update" on public.ride_passengers
  for update to authenticated using (
    passenger_id = auth.uid()
    or exists (select 1 from public.rides r where r.id = ride_id and r.driver_id = auth.uid())
  );
create policy "passengers_delete_own" on public.ride_passengers
  for delete to authenticated using (passenger_id = auth.uid());

-- conversations: visible to participants; any authenticated user can create one.
create policy "conversations_select" on public.conversations
  for select to authenticated using (public.is_participant(id));
create policy "conversations_insert" on public.conversations
  for insert to authenticated with check (true);

-- participants: visible to fellow participants; insert allowed (used when starting a chat).
create policy "participants_select" on public.conversation_participants
  for select to authenticated using (public.is_participant(conversation_id));
create policy "participants_insert" on public.conversation_participants
  for insert to authenticated with check (true);

-- messages: only participants can read/send.
create policy "messages_select" on public.messages
  for select to authenticated using (public.is_participant(conversation_id));
create policy "messages_insert" on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid() and public.is_participant(conversation_id)
  );
create policy "messages_update_read" on public.messages
  for update to authenticated using (public.is_participant(conversation_id));

-- Realtime: broadcast message inserts to subscribed clients.
alter publication supabase_realtime add table public.messages;
