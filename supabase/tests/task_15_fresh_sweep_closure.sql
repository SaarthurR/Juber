\set ON_ERROR_STOP on

\set driver 00000000-0000-4000-8000-000000008001
\set rider 00000000-0000-4000-8000-000000008002
\set accepter 00000000-0000-4000-8000-000000008003
\set recipient 00000000-0000-4000-8000-000000008004
\set expired_ride 00000000-0000-4000-8000-000000008101
\set fresh_ride 00000000-0000-4000-8000-000000008102
\set expired_request 00000000-0000-4000-8000-000000008201
\set fresh_request 00000000-0000-4000-8000-000000008202
\set cap_event 00000000-0000-4000-8000-000000008301
\set cap_ride 00000000-0000-4000-8000-000000008401
\set cap_conversation 00000000-0000-4000-8000-000000008501
\set cap_message 00000000-0000-4000-8000-000000008601

begin;

create temporary table task15_failures (
  label text primary key,
  detail text not null
);
grant select, insert on task15_failures to anon, authenticated;

create or replace function public.task15_assert(label text, condition boolean)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'assertion failed: %', label;
  end if;
end;
$$;

create or replace function public.task15_expect_rejected(
  label text,
  statement text,
  expected_message text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  actual_message text;
begin
  begin
    execute statement;
    insert into task15_failures values (label, 'statement succeeded')
    on conflict do nothing;
  exception
    when others then
      get stacked diagnostics actual_message = message_text;
      if expected_message is not null
         and actual_message not like '%' || expected_message || '%' then
        insert into task15_failures values (
          label,
          format('expected message containing %s, got %s', expected_message, actual_message)
        )
        on conflict do nothing;
      end if;
  end;
end;
$$;

grant execute on function public.task15_assert(text, boolean) to anon, authenticated;
grant execute on function public.task15_expect_rejected(text, text, text) to anon, authenticated;

insert into auth.users (id, raw_user_meta_data)
values
  (:'driver', '{"full_name":"Task 15 Driver"}'),
  (:'rider', '{"full_name":"Task 15 Rider"}'),
  (:'accepter', '{"full_name":"Task 15 Accepter"}'),
  (:'recipient', '{"full_name":"Task 15 Recipient"}')
on conflict (id) do nothing;

insert into public.profile_contacts (user_id, phone, whatsapp)
values
  (:'driver', '+15550008001', '+15550008001'),
  (:'rider', '+15550008002', '+15550008002'),
  (:'accepter', '+15550008003', '+15550008003'),
  (:'recipient', '+15550008004', '+15550008004')
on conflict (user_id) do update
set phone = excluded.phone,
    whatsapp = excluded.whatsapp;

insert into public.rides (
  id, driver_id, origin_label, destination_label, depart_at,
  seats_total, seats_available, status
)
values
  (:'expired_ride', :'driver', 'A', 'B', now() + interval '1 day', 2, 2, 'active'),
  (:'fresh_ride', :'driver', 'A', 'B', now() + interval '1 day', 2, 2, 'active');

insert into public.ride_passengers (ride_id, passenger_id, status)
values
  (:'expired_ride', :'rider', 'pending'),
  (:'fresh_ride', :'rider', 'pending');

update public.rides
set depart_at = now() - interval '1 hour'
where id = :'expired_ride';

insert into public.ride_requests (
  id, rider_id, origin_label, destination_label, depart_at,
  latest_date, seats_needed, status
)
values
  (
    :'expired_request',
    :'rider',
    'A',
    'B',
    now() + interval '1 day',
    current_date - 1,
    1,
    'active'
  ),
  (
    :'fresh_request',
    :'rider',
    'A',
    'B',
    now() + interval '1 day',
    current_date,
    1,
    'active'
  );

insert into public.events (id, name, slug, description, venue_label, start_date, end_date, is_active)
values (
  :'cap_event',
  'Task 15 Cap Event',
  'task-15-cap-event',
  'Event board cap test',
  'JCNC',
  current_date + 1,
  null,
  true
);

insert into public.rides (
  id, driver_id, origin_label, destination_label, depart_at,
  seats_total, seats_available, event_id, status
)
select
  gen_random_uuid(),
  :'driver',
  'Filler',
  'JCNC',
  now() + (seq * interval '1 minute'),
  1,
  1,
  null,
  'active'
from generate_series(1, 101) as seq;

insert into public.rides (
  id, driver_id, origin_label, destination_label, depart_at,
  seats_total, seats_available, event_id, status
)
values (
  :'cap_ride',
  :'driver',
  'Cap Origin',
  'JCNC',
  now() + interval '1 year',
  2,
  2,
  :'cap_event',
  'active'
);

insert into public.conversations (id)
values (:'cap_conversation');

insert into public.conversation_participants (conversation_id, user_id)
values
  (:'cap_conversation', :'driver'),
  (:'cap_conversation', :'recipient');

insert into public.messages (id, conversation_id, sender_id, body)
values (
  :'cap_message',
  :'cap_conversation',
  :'driver',
  'Unread task 15 message'
);

-- Expired ride: confirm_passenger rejected
set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task15_expect_rejected(
  'expired ride confirm_passenger rejected',
  format(
    'select public.confirm_passenger(%L::uuid, %L::uuid)',
    :'rider',
    :'expired_ride'
  ),
  'This ride is not accepting confirmations'
);
do $task15_expired_confirm$
begin
  update public.ride_passengers
  set status = 'confirmed'
  where ride_id = '00000000-0000-4000-8000-000000008101'
    and passenger_id = '00000000-0000-4000-8000-000000008002';
  insert into task15_failures values (
    'expired ride direct confirm rejected',
    'statement succeeded'
  ) on conflict do nothing;
exception
  when others then
    if sqlerrm not like '%This ride is not accepting confirmations%' then
      insert into task15_failures values (
        'expired ride direct confirm rejected',
        sqlerrm
      ) on conflict do nothing;
    end if;
end
$task15_expired_confirm$;
insert into task15_failures
select 'expired ride passenger stayed pending', 'status changed from pending'
where (
  select status <> 'pending'
  from public.ride_passengers
  where ride_id = :'expired_ride' and passenger_id = :'rider'
)
on conflict do nothing;

reset role;
insert into task15_failures
select 'expired ride seat_confirmed notification leaked', 'notification exists'
where exists (
  select 1
  from public.notifications
  where ride_id = :'expired_ride'
    and type = 'seat_confirmed'
)
on conflict do nothing;

-- Fresh ride: confirm_passenger succeeds
set role authenticated;
select set_config('request.jwt.claim.sub', :'driver', false);
select public.task15_assert(
  'fresh ride confirm_passenger succeeds',
  public.confirm_passenger(:'rider', :'fresh_ride')
);
select public.task15_assert(
  'fresh ride passenger confirmed',
  (
    select status = 'confirmed'
    from public.ride_passengers
    where ride_id = :'fresh_ride' and passenger_id = :'rider'
  )
);

-- Expired request: accept_ride_request returns false
select set_config('request.jwt.claim.sub', :'accepter', false);
select public.task15_assert(
  'expired request accept_ride_request returns false',
  public.accept_ride_request(:'expired_request') = false
);
do $task15_expired_fulfill$
begin
  update public.ride_requests
  set status = 'fulfilled',
      accepted_driver_id = '00000000-0000-4000-8000-000000008003',
      accepted_at = now()
  where id = '00000000-0000-4000-8000-000000008201';
  if found then
    insert into task15_failures values (
      'expired request direct fulfill rejected',
      'request became fulfilled'
    ) on conflict do nothing;
  end if;
exception
  when others then
    if sqlerrm not like '%This ride request is no longer available%'
       and sqlerrm not like '%Invalid ride request status transition%' then
      insert into task15_failures values (
        'expired request direct fulfill rejected',
        sqlerrm
      ) on conflict do nothing;
    end if;
end
$task15_expired_fulfill$;

-- Fresh request: accept_ride_request succeeds
select public.task15_assert(
  'fresh request accept_ride_request succeeds',
  public.accept_ride_request(:'fresh_request')
);
reset role;
insert into task15_failures
select 'expired request request_accepted notification leaked', 'notification exists'
where exists (
  select 1
  from public.notifications
  where request_id = :'expired_request'
    and type = 'request_accepted'
)
on conflict do nothing;
select public.task15_assert(
  'fresh request request_accepted notification created',
  exists (
    select 1
    from public.notifications
    where request_id = :'fresh_request'
      and type = 'request_accepted'
      and actor_id = :'accepter'::uuid
  )
);
set role authenticated;
select set_config('request.jwt.claim.sub', :'accepter', false);

-- Message identity: recipient cannot mutate id; read_at update succeeds
select set_config('request.jwt.claim.sub', :'recipient', false);
do $task15_msg$
declare
  v_message text;
  v_sqlstate text;
begin
  begin
    update public.messages
    set id = gen_random_uuid()
    where id = '00000000-0000-4000-8000-000000008601';
    insert into task15_failures values (
      'message id mutation rejected',
      'statement succeeded'
    ) on conflict do nothing;
  exception
    when others then
      get stacked diagnostics
        v_message = message_text,
        v_sqlstate = returned_sqlstate;
      if v_sqlstate <> '42501'
         and v_message not like '%Only read_at may be updated on a message%' then
        insert into task15_failures values (
          'message id mutation rejected',
          format('unexpected error %s: %s', v_sqlstate, v_message)
        ) on conflict do nothing;
      end if;
  end;
end
$task15_msg$;
update public.messages
set read_at = now()
where id = :'cap_message';
select public.task15_assert(
  'message read_at update succeeds',
  (
    select read_at is not null
    from public.messages
    where id = :'cap_message'
  )
);

reset role;

-- Grants
select public.task15_assert(
  'anon has no profiles select',
  not has_table_privilege('anon', 'public.profiles', 'SELECT')
);
select public.task15_assert(
  'anon has no events select',
  not has_table_privilege('anon', 'public.events', 'SELECT')
);
select public.task15_assert(
  'anon has no messages select',
  not has_table_privilege('anon', 'public.messages', 'SELECT')
);
select public.task15_assert(
  'authenticated lacks messages truncate',
  not has_table_privilege('authenticated', 'public.messages', 'TRUNCATE')
);
select public.task15_assert(
  'authenticated lacks rides truncate',
  not has_table_privilege('authenticated', 'public.rides', 'TRUNCATE')
);
select public.task15_assert(
  'authenticated lacks messages id update',
  not has_column_privilege('authenticated', 'public.messages', 'id', 'UPDATE')
);
select public.task15_assert(
  'authenticated keeps messages select',
  has_table_privilege('authenticated', 'public.messages', 'SELECT')
);
select public.task15_assert(
  'authenticated keeps messages read_at update',
  has_column_privilege('authenticated', 'public.messages', 'read_at', 'UPDATE')
);
select public.task15_assert(
  'authenticated keeps notifications select',
  has_table_privilege('authenticated', 'public.notifications', 'SELECT')
);
select public.task15_assert(
  'authenticated keeps ride_requests select',
  has_table_privilege('authenticated', 'public.ride_requests', 'SELECT')
);
select public.task15_assert(
  'anon executes public_event_rides',
  has_function_privilege('anon', 'public.public_event_rides(text,integer)', 'EXECUTE')
);

-- Event board cap
set role anon;
select public.task15_assert(
  'event board cap reports one ride',
  (
    select ride_count = 1
    from public.public_event_board('task-15-cap-event')
  )
);
select public.task15_assert(
  'event scoped rides returns cap ride',
  exists (
    select 1
    from public.public_event_rides('task-15-cap-event', 100)
    where id = :'cap_ride'::uuid
  )
);
select public.task15_assert(
  'global upcoming rides omits cap ride beyond first 100',
  not exists (
    select 1
    from public.public_upcoming_rides(null, null, null, 100, null)
    where id = :'cap_ride'::uuid
  )
);
reset role;

table task15_failures;

select public.task15_assert(
  'task15 fresh sweep closure checks have no failures',
  not exists (select 1 from task15_failures)
);

drop function public.task15_expect_rejected(text, text, text);
drop function public.task15_assert(text, boolean);

rollback;

select 'task_15_fresh_sweep_closure: PASS' as result;
