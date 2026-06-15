-- Seed data for JCNC Carpool.
-- Run after 0001_init.sql.

-- Default destination hub.
insert into public.places (name, address, kind, active)
values (
  'Jain Center of Northern California',
  '722 S Main St, Milpitas, CA 95035',
  'hub',
  true
)
on conflict do nothing;

-- A few common Bay Area neighborhoods to get people started.
insert into public.places (name, kind, active) values
  ('San Jose', 'neighborhood', true),
  ('Fremont', 'neighborhood', true),
  ('Sunnyvale', 'neighborhood', true),
  ('Santa Clara', 'neighborhood', true),
  ('Cupertino', 'neighborhood', true),
  ('Mountain View', 'neighborhood', true),
  ('San Ramon', 'neighborhood', true),
  ('Pleasanton', 'neighborhood', true)
on conflict do nothing;

-- To make yourself an admin after signing in, run:
--   update public.profiles set is_admin = true where id = (
--     select id from auth.users where email = 'ranka.saarth@gmail.com'
--   );
