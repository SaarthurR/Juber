-- Ensure anonymous event browsing remains RPC-only on databases where 0030 was
-- applied before these explicit table revokes were added.

revoke all on table public.events from anon;
revoke all on table public.ride_requests from anon;
