do $$
begin
  if not exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in ('rides', 'ride_requests')
      and relation.relrowsecurity
    group by namespace.nspname
    having count(*) = 2
  ) then
    raise exception 'Lifecycle tables must have RLS enabled before Realtime publication';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('rides', 'ride_requests')
      and cmd = 'SELECT'
      and 'authenticated' = any(roles)
      and qual = 'true'
  ) <> 2 then
    raise exception 'Lifecycle tables require authenticated public-read policies';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('rides', 'ride_requests')
      and cmd = 'SELECT'
      and ('anon' = any(roles) or 'public' = any(roles))
  ) then
    raise exception 'Lifecycle tables must not expose rows to anonymous subscribers';
  end if;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.rides;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.ride_requests;
exception
  when duplicate_object then null;
end
$$;
