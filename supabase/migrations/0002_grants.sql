-- JCNC Carpool — table grants
-- Fixes "permission denied for table rides" (and every other table).
--
-- RLS policies decide WHICH rows a role may touch, but the role still needs
-- the underlying table privilege first. Supabase's default privileges only
-- cover objects created by the `postgres` role with the right ownership; when
-- they don't kick in you get a hard "permission denied for table ..." error
-- (different from RLS, which says "new row violates row-level security policy").
-- Granting here is safe because RLS stays in force on top of these grants.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

-- Make sure anything created later inherits the same grants.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
