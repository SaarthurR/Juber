-- Phase 4 (CONTRACT): DB-enforced closure of the authenticated non-booked address leak.
--
-- Deferred until after the merged production app deployed the read path that
-- fetches exact meetup addresses only through the ride_meetup_location
-- SECURITY DEFINER RPC (gated on driver / confirmed passenger / fulfilled
-- request within the contact-entitlement window). No production consumer
-- selects rides.pickup_location / rides.dropoff_location directly anymore, so
-- authenticated no longer needs column-level SELECT on them.
--
-- INSERT is intentionally left intact: ride creation still writes these columns
-- as an authenticated user, and the AFTER trigger diverts the values into the
-- private ride_meetup_locations side table. anon was never granted either
-- privilege.
--
-- Instant rollback if a deploy gap surfaces:
--   grant select (pickup_location, dropoff_location) on public.rides to authenticated;

revoke select (pickup_location, dropoff_location) on public.rides from authenticated;
