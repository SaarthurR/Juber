revoke all on table public.rides from anon;
revoke all on table public.ride_requests from anon;

do $$
begin
  if has_table_privilege('anon', 'public.rides', 'SELECT')
     or has_table_privilege('anon', 'public.ride_requests', 'SELECT') then
    raise exception 'anon must not retain SELECT on lifecycle tables';
  end if;

  if not has_table_privilege('authenticated', 'public.rides', 'SELECT')
     or not has_table_privilege('authenticated', 'public.ride_requests', 'SELECT') then
    raise exception 'authenticated must retain SELECT on lifecycle tables';
  end if;

  if not has_function_privilege(
    'anon',
    'public.public_upcoming_rides(text,text,date,integer,boolean)',
    'EXECUTE'
  ) then
    raise exception 'anon must retain public_upcoming_rides execute access';
  end if;

  if (
    select count(*)
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('rides', 'ride_requests')
  ) <> 2 then
    raise exception 'lifecycle tables must remain realtime-published';
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_hides'
  ) then
    raise exception 'conversation_hides must remain outside realtime publication';
  end if;
end
$$;
