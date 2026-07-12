\set ON_ERROR_STOP on

\set driver 00000000-0000-4000-8000-000000007001
\set requester 00000000-0000-4000-8000-000000007002
\set visible_event 00000000-0000-4000-8000-000000007101
\set past_event 00000000-0000-4000-8000-000000007102
\set inactive_event 00000000-0000-4000-8000-000000007103
\set visible_ride 00000000-0000-4000-8000-000000007201
\set private_request 00000000-0000-4000-8000-000000007301

begin;

create temporary table task6_failures (
  label text primary key,
  detail text not null
);
grant select, insert on task6_failures to anon, authenticated;

create or replace function public.task6_assert(label text, condition boolean)
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

create or replace function public.task6_expect_rejected(
  label text,
  statement text,
  expected_sqlstate text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  actual_sqlstate text;
begin
  begin
    execute statement;
    insert into task6_failures values (label, 'statement succeeded')
    on conflict do nothing;
  exception
    when others then
      get stacked diagnostics actual_sqlstate = returned_sqlstate;
      if actual_sqlstate is distinct from expected_sqlstate then
        insert into task6_failures values (
          label,
          format('expected %s, got %s', expected_sqlstate, actual_sqlstate)
        )
        on conflict do nothing;
      end if;
  end;
end;
$$;

grant execute on function public.task6_assert(text, boolean) to anon, authenticated;
grant execute on function public.task6_expect_rejected(text, text, text) to anon, authenticated;

insert into auth.users (id, raw_user_meta_data)
values
  (:'driver', '{"full_name":"Task 6 Driver"}'),
  (:'requester', '{"full_name":"Task 6 Requester"}')
on conflict (id) do nothing;

insert into public.profile_contacts (user_id, phone, whatsapp)
values (:'driver', '+15550007001', '+15550007001')
on conflict (user_id) do update
set phone = excluded.phone,
    whatsapp = excluded.whatsapp;

insert into public.events (id, name, slug, description, venue_label, start_date, end_date, is_active)
values
  (:'visible_event', 'Task 6 Visible', 'task-6-visible', 'Public board', 'JCNC', current_date + 1, null, true),
  (:'past_event', 'Task 6 Past', 'task-6-past', null, 'JCNC', current_date - 2, current_date - 1, true),
  (:'inactive_event', 'Task 6 Inactive', 'task-6-inactive', null, 'JCNC', current_date + 1, null, false);

insert into public.rides (
  id, driver_id, origin_label, destination_label, depart_at,
  seats_total, seats_available, event_id, status
)
values (
  :'visible_ride',
  :'driver',
  'San Jose',
  'JCNC',
  now() + interval '1 day',
  3,
  2,
  :'visible_event',
  'active'
);

insert into public.ride_requests (
  id, rider_id, origin_label, destination_label, depart_at,
  seats_needed, event_id, status
)
values (
  :'private_request',
  :'requester',
  'Fremont',
  'JCNC',
  now() + interval '1 day',
  1,
  :'visible_event',
  'active'
);

select public.task6_assert(
  'public_upcoming_events anon grant',
  has_function_privilege('anon', 'public.public_upcoming_events()', 'EXECUTE')
);
select public.task6_assert(
  'public_event_board anon grant',
  has_function_privilege('anon', 'public.public_event_board(text)', 'EXECUTE')
);
select public.task6_assert(
  'anon has no events table privilege',
  not has_table_privilege('anon', 'public.events', 'SELECT')
);

set role anon;
select public.task6_expect_rejected(
  'anon direct events select denied',
  'select * from public.events limit 1',
  '42501'
);
select public.task6_expect_rejected(
  'anon direct ride requests select denied',
  'select * from public.ride_requests limit 1',
  '42501'
);

create temporary table task6_anon_events as
select * from public.public_upcoming_events();
create temporary table task6_anon_board as
select * from public.public_event_board('task-6-visible');
reset role;

select public.task6_assert(
  'anon RPC includes visible active non-past event',
  exists (select 1 from task6_anon_events where id = :'visible_event')
);
select public.task6_assert(
  'anon RPC excludes past event',
  not exists (select 1 from task6_anon_events where id = :'past_event')
);
select public.task6_assert(
  'anon RPC excludes inactive event',
  not exists (select 1 from task6_anon_events where id = :'inactive_event')
);
select public.task6_assert(
  'anon event counts come from public ride feed',
  (
    select ride_count = 1 and seats_available = 2
    from task6_anon_events
    where id = :'visible_event'
  )
);
select public.task6_assert(
  'anon board returns one visible event',
  (select count(*) = 1 from task6_anon_board where id = :'visible_event')
);
select public.task6_assert(
  'public event RPC does not expose creator/request identity columns',
  not exists (
    select 1
    from information_schema.columns
    where table_schema = pg_my_temp_schema()::regnamespace::text
      and table_name in ('task6_anon_events', 'task6_anon_board')
      and column_name in ('created_by', 'requested_by', 'rider_id')
  )
);

table task6_failures;

select public.task6_assert(
  'task6 public event privacy checks have no failures',
  not exists (select 1 from task6_failures)
);

drop function public.task6_expect_rejected(text, text, text);
drop function public.task6_assert(text, boolean);

rollback;

select 'task_6_public_events: PASS' as result;
