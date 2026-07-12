-- Chat lifecycle: publish ride_passengers for live seat-cancel thread refresh.
-- Retention: soft hide removes inbox visibility; message bodies stay indefinitely
-- for user history, lost-item follow-up, and admin evidence. No silent hard delete.
-- Future redact-not-delete requires explicit product approval.

do $$
begin
  if not exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'ride_passengers'
      and relation.relrowsecurity
  ) then
    raise exception 'ride_passengers must have RLS enabled before Realtime publication';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ride_passengers'
      and policyname = 'passengers_select'
      and cmd = 'SELECT'
      and 'authenticated' = any(roles)
  ) then
    raise exception 'ride_passengers requires passengers_select for authenticated';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ride_passengers'
      and cmd = 'SELECT'
      and ('anon' = any(roles) or 'public' = any(roles))
  ) then
    raise exception 'ride_passengers must not expose rows to anonymous subscribers';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ride_passengers'
      and policyname = 'ban_lockout'
      and 'authenticated' = any(roles)
  ) then
    raise exception 'ride_passengers ban_lockout policy must remain in force';
  end if;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.ride_passengers;
exception
  when duplicate_object then null;
end
$$;

revoke all on table public.ride_passengers from anon;

do $$
begin
  if has_table_privilege('anon', 'public.ride_passengers', 'SELECT') then
    raise exception 'anon must not retain SELECT on ride_passengers';
  end if;

  if not has_table_privilege('authenticated', 'public.ride_passengers', 'SELECT') then
    raise exception 'authenticated must retain SELECT on ride_passengers';
  end if;

  if (
    select count(*)
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('rides', 'ride_requests', 'ride_passengers')
  ) <> 3 then
    raise exception 'lifecycle tables must remain realtime-published';
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('conversation_hides', 'ride_passenger_pickup_notes')
  ) then
    raise exception 'private tables must remain outside realtime publication';
  end if;
end
$$;
