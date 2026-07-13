create or replace function public.accept_ride_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  if public.is_banned(auth.uid()) then
    raise exception 'account_suspended';
  end if;

  update public.ride_requests
  set status = 'fulfilled',
      accepted_driver_id = auth.uid(),
      accepted_at = now()
  where id = p_request_id
    and status = 'active'
    and rider_id <> auth.uid()
    and coalesce(latest_date, depart_at::date) >= current_date;

  if found then
    insert into public.notifications (recipient_id, actor_id, type, request_id)
    select rider_id, auth.uid(), 'request_accepted', id
    from public.ride_requests
    where id = p_request_id;
    return true;
  end if;

  return exists (
    select 1
    from public.ride_requests
    where id = p_request_id
      and status = 'fulfilled'
      and accepted_driver_id = auth.uid()
  );
end;
$$;

revoke all on function public.accept_ride_request(uuid) from public, anon;
grant execute on function public.accept_ride_request(uuid) to authenticated, service_role;
