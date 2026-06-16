alter table public.rides
  add column if not exists pickup_location text,
  add column if not exists dropoff_location text;
