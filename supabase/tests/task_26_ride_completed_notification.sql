\set ON_ERROR_STOP on

\set driver_id 00000000-0000-4000-8000-000000026001
\set rider_pending 00000000-0000-4000-8000-000000026002
\set rider_confirmed 00000000-0000-4000-8000-000000026003
\set rider_declined 00000000-0000-4000-8000-000000026004
\set complete_ride 00000000-0000-4000-8000-000000026101

begin;

create or replace function pg_temp.task26_assert(
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

insert into auth.users (id, raw_user_meta_data)
values
  (:'driver_id'::uuid, '{"full_name":"Task 26 Driver"}'),
  (:'rider_pending'::uuid, '{"full_name":"Task 26 Pending"}'),
  (:'rider_confirmed'::uuid, '{"full_name":"Task 26 Confirmed"}'),
  (:'rider_declined'::uuid, '{"full_name":"Task 26 Declined"}')
on conflict (id) do nothing;

insert into public.profiles (id, full_name)
values
  (:'driver_id'::uuid, 'Task 26 Driver'),
  (:'rider_pending'::uuid, 'Task 26 Pending'),
  (:'rider_confirmed'::uuid, 'Task 26 Confirmed'),
  (:'rider_declined'::uuid, 'Task 26 Declined')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.profile_contacts (user_id, phone, whatsapp)
values (:'driver_id'::uuid, '+14085550026', '+14085550026')
on conflict (user_id) do update
set phone = excluded.phone,
    whatsapp = excluded.whatsapp;

delete from public.notifications where ride_id = :'complete_ride'::uuid;
delete from public.ride_passengers where ride_id = :'complete_ride'::uuid;
delete from public.rides where id = :'complete_ride'::uuid;

insert into public.rides (
  id, driver_id, origin_label, destination_label, depart_at,
  seats_total, seats_available, status
)
values (
  :'complete_ride'::uuid, :'driver_id'::uuid,
  'Complete Origin', 'Complete Dest', now() + interval '2 days',
  4, 1, 'active'
);

insert into public.ride_passengers (ride_id, passenger_id, status)
values
  (:'complete_ride'::uuid, :'rider_pending'::uuid, 'pending'),
  (:'complete_ride'::uuid, :'rider_confirmed'::uuid, 'confirmed'),
  (:'complete_ride'::uuid, :'rider_declined'::uuid, 'declined');

set role authenticated;
select set_config('request.jwt.claim.sub', :'driver_id', false);

select pg_temp.task26_assert(
  'close_ride emits ride_completed for pending and confirmed passengers only',
  (
    with before_count as (
      select count(*) as c
      from public.notifications
      where ride_id = :'complete_ride'::uuid
        and type = 'ride_completed'
    ),
    _close as (
      select public.close_ride(:'complete_ride'::uuid) as ok
    ),
    after_rows as (
      select recipient_id, actor_id, ride_id, type
      from public.notifications
      where ride_id = :'complete_ride'::uuid
        and type = 'ride_completed'
    )
    select (select ok from _close) = true
      and (select c from before_count) = 0
      and (select count(*) from after_rows) = 2
      and exists (
        select 1 from after_rows
        where recipient_id = :'rider_pending'::uuid
          and actor_id = :'driver_id'::uuid
          and ride_id = :'complete_ride'::uuid
      )
      and exists (
        select 1 from after_rows
        where recipient_id = :'rider_confirmed'::uuid
          and actor_id = :'driver_id'::uuid
          and ride_id = :'complete_ride'::uuid
      )
      and not exists (
        select 1 from after_rows
        where recipient_id = :'rider_declined'::uuid
      )
      and not exists (
        select 1 from after_rows
        where recipient_id = :'driver_id'::uuid
      )
  )
);

select pg_temp.task26_assert(
  'repeat completed update emits no duplicate ride_completed notifications',
  (
    with before_count as (
      select count(*) as c
      from public.notifications
      where ride_id = :'complete_ride'::uuid
        and type = 'ride_completed'
    ),
    _noop as (
      update public.rides
      set pickup_location = 'Completed noop touch'
      where id = :'complete_ride'::uuid
        and status = 'completed'
      returning 1
    ),
    after_count as (
      select count(*) as c
      from public.notifications
      where ride_id = :'complete_ride'::uuid
        and type = 'ride_completed'
    )
    select (select c from before_count) = (select c from after_count)
  )
);

select pg_temp.task26_assert(
  'notify_ride_completed execute revoked from authenticated and public',
  not has_function_privilege('authenticated', 'public.notify_ride_completed()', 'EXECUTE')
    and not has_function_privilege('public', 'public.notify_ride_completed()', 'EXECUTE')
);

reset role;
rollback;
