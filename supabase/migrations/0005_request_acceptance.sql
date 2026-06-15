-- Harden request acceptance and passenger status updates.

alter table public.ride_requests
  add column if not exists accepted_driver_id uuid references public.profiles(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add constraint ride_requests_date_order check (
    earliest_date is null or latest_date is null or earliest_date <= latest_date
  ),
  add constraint ride_requests_max_price_nonnegative check (
    max_price is null or max_price >= 0
  );

alter table public.notifications
  add column if not exists request_id uuid references public.ride_requests(id) on delete cascade;

alter table public.notifications
  drop constraint if exists notifications_type_check,
  add constraint notifications_type_check check (
    type in (
      'seat_requested',
      'seat_confirmed',
      'seat_declined',
      'ride_cancelled',
      'request_accepted'
    )
  );

create or replace function public.accept_ride_request(p_request_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.ride_requests
  set status = 'fulfilled',
      accepted_driver_id = auth.uid(),
      accepted_at = now()
  where id = p_request_id
    and status = 'active'
    and rider_id <> auth.uid();

  if found then
    insert into public.notifications (recipient_id, actor_id, type, request_id)
    select rider_id, auth.uid(), 'request_accepted', id
    from public.ride_requests
    where id = p_request_id;
  end if;

  return found;
end;
$$;

grant execute on function public.accept_ride_request(uuid) to authenticated;

drop policy if exists "passengers_update" on public.ride_passengers;
create policy "passengers_update_driver" on public.ride_passengers
  for update to authenticated using (
    exists (
      select 1 from public.rides r
      where r.id = ride_id
        and (r.driver_id = auth.uid() or public.is_admin())
    )
  );
