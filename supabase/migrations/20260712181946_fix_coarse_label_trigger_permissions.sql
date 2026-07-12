begin;

alter function public.enforce_ride_coarse_labels()
  security definer;
alter function public.enforce_ride_coarse_labels()
  set search_path = public;

alter function public.enforce_request_coarse_labels()
  security definer;
alter function public.enforce_request_coarse_labels()
  set search_path = public;

revoke all on function public.enforce_ride_coarse_labels()
  from public, anon, authenticated;
revoke all on function public.enforce_request_coarse_labels()
  from public, anon, authenticated;
revoke all on function public.assert_coarse_label(text)
  from public, anon, authenticated;

do $$
begin
  if not (
    select prosecdef
    from pg_proc
    where oid = 'public.enforce_ride_coarse_labels()'::regprocedure
  ) then
    raise exception 'ride coarse-label trigger must be security definer';
  end if;

  if not (
    select prosecdef
    from pg_proc
    where oid = 'public.enforce_request_coarse_labels()'::regprocedure
  ) then
    raise exception 'request coarse-label trigger must be security definer';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.assert_coarse_label(text)',
    'EXECUTE'
  ) then
    raise exception 'coarse-label helper must remain non-executable';
  end if;
end
$$;

commit;
