-- Moober feature additions for JCNC Carpool

-- profiles: add contact & identity fields
alter table public.profiles
  add column if not exists pronouns         text,
  add column if not exists instagram        text,
  add column if not exists preferred_contact text
    check (preferred_contact in ('phone','instagram','message'));

-- ride_requests: add flexible date range and price ceiling
alter table public.ride_requests
  add column if not exists earliest_date date,
  add column if not exists latest_date   date,
  add column if not exists max_price     numeric(8,2);

-- back-fill date range columns from existing depart_at values
update public.ride_requests
  set earliest_date = depart_at::date,
      latest_date   = depart_at::date
  where earliest_date is null;
