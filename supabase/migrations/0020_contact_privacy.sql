-- Contact privacy: stop leaking phone/WhatsApp numbers to every signed-in user.
--
-- profiles_select uses `using (true)`, so any authenticated user can read every
-- row, and the broad `profiles(*)` joins return phone/whatsapp. RLS is row-level
-- and cannot gate individual columns. Rather than rely on column-level privilege
-- behavior at the PostgREST layer, we move the two sensitive columns into a
-- separate, booking-scoped table — so `profiles(*)` provably can no longer
-- return them. Numbers are served through SECURITY DEFINER RPCs that check the
-- caller is the owner or a confirmed booking counterparty.

create table if not exists public.profile_contacts (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  phone      text,
  whatsapp   text,
  updated_at timestamptz not null default now()
);

-- Copy existing numbers across before they are dropped from profiles.
insert into public.profile_contacts (user_id, phone, whatsapp)
  select id, phone, whatsapp
  from public.profiles
  where phone is not null or whatsapp is not null
on conflict (user_id) do nothing;

alter table public.profile_contacts enable row level security;
grant select, insert, update on public.profile_contacts to authenticated;

-- True when the current user and p_other share a *confirmed* booking — a
-- confirmed seat (driver<->passenger) or a fulfilled request (rider<->driver).
create or replace function public.shares_booking(p_other uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from public.rides r
    join public.ride_passengers rp on rp.ride_id = r.id
    where rp.status = 'confirmed'
      and (
        (r.driver_id = auth.uid() and rp.passenger_id = p_other)
        or (r.driver_id = p_other and rp.passenger_id = auth.uid())
      )
  ) or exists (
    select 1
    from public.ride_requests rr
    where rr.status = 'fulfilled'
      and (
        (rr.rider_id = auth.uid() and rr.accepted_driver_id = p_other)
        or (rr.rider_id = p_other and rr.accepted_driver_id = auth.uid())
      )
  );
$$;

create policy "contacts_select_own_or_booking" on public.profile_contacts
  for select to authenticated
  using (user_id = auth.uid() or public.shares_booking(user_id));
create policy "contacts_insert_own" on public.profile_contacts
  for insert to authenticated with check (user_id = auth.uid());
create policy "contacts_update_own" on public.profile_contacts
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Returns a single profile's numbers only to the owner or a booking counterparty.
create or replace function public.get_contact(p_user_id uuid)
returns table (phone text, whatsapp text)
language sql
security definer set search_path = public
stable
as $$
  select c.phone, c.whatsapp
  from public.profile_contacts c
  where c.user_id = p_user_id
    and (p_user_id = auth.uid() or public.shares_booking(p_user_id));
$$;

-- Batch lookup for the cancellation SMS path: id/name/phone for the users the
-- caller shares a booking with (or themselves).
create or replace function public.contacts_for_booking(p_user_ids uuid[])
returns table (id uuid, full_name text, phone text)
language sql
security definer set search_path = public
stable
as $$
  select p.id, p.full_name, c.phone
  from public.profiles p
  left join public.profile_contacts c on c.user_id = p.id
  where p.id = any(p_user_ids)
    and (p.id = auth.uid() or public.shares_booking(p.id));
$$;

-- 0018's guards read phone/whatsapp from profiles; repoint them at the new table.
create or replace function public.profile_has_contact(p_profile_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profile_contacts c
    where c.user_id = p_profile_id
      and (
        nullif(trim(coalesce(c.phone, '')), '') is not null
        or nullif(trim(coalesce(c.whatsapp, '')), '') is not null
      )
  );
$$;

-- The active-driver contact-retention guard now lives on profile_contacts.
drop trigger if exists profiles_keep_active_driver_contact on public.profiles;
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
       where r.driver_id = new.user_id and r.status = 'active'
     ) then
    raise exception 'Keep a phone or WhatsApp number while you have an active ride';
  end if;
  return new;
end;
$$;
drop trigger if exists profile_contacts_keep_active_driver_contact on public.profile_contacts;
create trigger profile_contacts_keep_active_driver_contact
  before update on public.profile_contacts
  for each row execute function public.prevent_active_driver_contact_removal();

grant execute on function public.shares_booking(uuid) to authenticated;
grant execute on function public.get_contact(uuid) to authenticated;
grant execute on function public.contacts_for_booking(uuid[]) to authenticated;
grant execute on function public.profile_has_contact(uuid) to authenticated;

-- Finally, remove the sensitive columns from the world-readable profiles table.
alter table public.profiles drop column if exists phone;
alter table public.profiles drop column if exists whatsapp;
