\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.task22_assert(
  label text,
  condition boolean
)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'assertion failed: %', label;
  end if;
end;
$$;

select pg_temp.task22_assert(
  'ride_passengers is realtime-published',
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ride_passengers'
  )
);

select pg_temp.task22_assert(
  'lifecycle trio remains published',
  (
    select count(*)
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('rides', 'ride_requests', 'ride_passengers')
  ) = 3
);

select pg_temp.task22_assert(
  'pickup notes side table stays off realtime',
  not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ride_passenger_pickup_notes'
  )
);

select pg_temp.task22_assert(
  'ride_passengers RLS stays enabled',
  (
    select relrowsecurity
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'ride_passengers'
  )
);

select pg_temp.task22_assert(
  'passengers_select policy remains for authenticated',
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ride_passengers'
      and policyname = 'passengers_select'
      and cmd = 'SELECT'
      and 'authenticated' = any(roles)
  )
);

select pg_temp.task22_assert(
  'ban_lockout policy remains on ride_passengers',
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ride_passengers'
      and policyname = 'ban_lockout'
      and 'authenticated' = any(roles)
  )
);

select pg_temp.task22_assert(
  'anon lacks direct ride_passengers SELECT',
  not has_table_privilege('anon', 'public.ride_passengers', 'SELECT')
);

select pg_temp.task22_assert(
  'authenticated retains ride_passengers SELECT',
  has_table_privilege('authenticated', 'public.ride_passengers', 'SELECT')
);

rollback;
