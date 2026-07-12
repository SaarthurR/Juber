-- ride_completed notification when a ride transitions to completed (mirror ride_cancelled).

alter table public.notifications
  drop constraint if exists notifications_type_check,
  add constraint notifications_type_check check (
    type in (
      'seat_requested',
      'seat_confirmed',
      'seat_declined',
      'seat_cancelled',
      'ride_cancelled',
      'ride_completed',
      'request_accepted',
      'new_message',
      'event_request_approved',
      'event_request_rejected'
    )
  );

create or replace function public.notify_ride_completed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.notifications (recipient_id, actor_id, type, ride_id)
    select p.passenger_id, new.driver_id, 'ride_completed', new.id
    from public.ride_passengers p
    where p.ride_id = new.id
      and p.status in ('pending', 'confirmed');
  end if;
  return new;
end;
$$;

drop trigger if exists rides_notify_completed on public.rides;
create trigger rides_notify_completed
  after update on public.rides
  for each row execute function public.notify_ride_completed();

revoke execute on function public.notify_ride_completed() from public, anon, authenticated;
