-- Effective DB enforcement of the coarse-only boundary on public.rides.
--
-- The prior column-level REVOKE (20260712185122) was a no-op: authenticated
-- holds a TABLE-level SELECT grant, which supersedes column-level revokes.
-- Enforce properly by dropping the table-level SELECT and re-granting SELECT on
-- every column EXCEPT the exact-meetup columns. Exact addresses live only in
-- the RLS-protected ride_meetup_locations side table (RPC-gated); the base
-- rides.pickup_location / dropoff_location are already coerced to coarse labels
-- by the capture trigger, so this is durable defense-in-depth that survives any
-- future change to that trigger.
--
-- Verified app-compatible: every authenticated rides read uses an explicit
-- column list (RIDE_COLUMNS / RIDE_WITH_JOIN) and never selects pickup_location,
-- dropoff_location, or rides.*. INSERT/UPDATE grants are untouched.
--
-- Rollback: grant select on public.rides to authenticated;

begin;

revoke select on public.rides from authenticated;

grant select (
  id,
  driver_id,
  origin_label,
  destination_label,
  depart_at,
  seats_total,
  seats_available,
  gas_contribution,
  notes,
  event_id,
  status,
  created_at,
  cancellation_reason,
  round_trip,
  return_depart_at,
  return_notes
) on public.rides to authenticated;

do $$
begin
  if has_column_privilege('authenticated', 'public.rides', 'pickup_location', 'SELECT') then
    raise exception 'authenticated must not retain SELECT on rides.pickup_location';
  end if;
  if has_column_privilege('authenticated', 'public.rides', 'dropoff_location', 'SELECT') then
    raise exception 'authenticated must not retain SELECT on rides.dropoff_location';
  end if;
  if not has_column_privilege('authenticated', 'public.rides', 'origin_label', 'SELECT') then
    raise exception 'authenticated must retain SELECT on coarse rides columns';
  end if;
  if not has_column_privilege('authenticated', 'public.rides', 'seats_available', 'SELECT') then
    raise exception 'authenticated must retain SELECT on coarse rides columns';
  end if;
end
$$;

commit;
