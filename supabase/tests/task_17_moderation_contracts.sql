\set ON_ERROR_STOP on

\set reporter 00000000-0000-4000-8000-000000017001
\set reported 00000000-0000-4000-8000-000000017002
\set banned 00000000-0000-4000-8000-000000017003
\set admin 00000000-0000-4000-8000-000000017004
\set admin_target 00000000-0000-4000-8000-000000017005
\set test_ride 00000000-0000-4000-8000-000000017101
\set test_message 00000000-0000-4000-8000-000000017201
\set test_conversation 00000000-0000-4000-8000-000000017202
\set flood_reporter 00000000-0000-4000-8000-000000017006
\set flood_target_a 00000000-0000-4000-8000-000000017007
\set flood_target_b 00000000-0000-4000-8000-000000017008
\set flood_target_c 00000000-0000-4000-8000-000000017009
\set flood_target_d 00000000-0000-4000-8000-00000001700a
\set flood_target_e 00000000-0000-4000-8000-00000001700b
\set flood_target_f 00000000-0000-4000-8000-00000001700c

create temporary table task17_failures (
  label text primary key,
  detail text not null
);
grant select, insert on task17_failures to authenticated;

create or replace function public.task17_assert(label text, condition boolean)
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

create or replace function public.task17_capture_sqlstate(statement text)
returns text
language plpgsql
set search_path = public
as $$
begin
  execute statement;
  return '00000';
exception
  when others then return sqlstate;
end;
$$;

create or replace function public.task17_expect_suspended(label text, statement text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  actual_message text;
begin
  begin
    execute statement;
    insert into task17_failures values (label, 'statement succeeded')
    on conflict do nothing;
  exception
    when others then
      get stacked diagnostics actual_message = message_text;
      if actual_message not like '%account_suspended%' then
        insert into task17_failures values (
          label,
          format('expected account_suspended, got %s', actual_message)
        )
        on conflict do nothing;
      end if;
  end;
end;
$$;

grant execute on function public.task17_assert(text, boolean) to authenticated;
grant execute on function public.task17_capture_sqlstate(text) to authenticated;
grant execute on function public.task17_expect_suspended(text, text) to authenticated;

insert into auth.users (id, email, raw_user_meta_data)
values
  (:'reporter', 'task17-reporter@example.com', '{"full_name":"Task 17 Reporter"}'),
  (:'reported', 'task17-reported@example.com', '{"full_name":"Task 17 Reported"}'),
  (:'banned', 'task17-banned@example.com', '{"full_name":"Task 17 Banned"}'),
  (:'admin', 'task17-admin@example.com', '{"full_name":"Task 17 Admin"}'),
  (:'admin_target', 'task17-admin-target@example.com', '{"full_name":"Task 17 Admin Target"}'),
  (:'flood_reporter', 'task17-flood@example.com', '{"full_name":"Task 17 Flood"}'),
  (:'flood_target_a', 'task17-flood-a@example.com', '{"full_name":"Task 17 Flood A"}'),
  (:'flood_target_b', 'task17-flood-b@example.com', '{"full_name":"Task 17 Flood B"}'),
  (:'flood_target_c', 'task17-flood-c@example.com', '{"full_name":"Task 17 Flood C"}'),
  (:'flood_target_d', 'task17-flood-d@example.com', '{"full_name":"Task 17 Flood D"}'),
  (:'flood_target_e', 'task17-flood-e@example.com', '{"full_name":"Task 17 Flood E"}'),
  (:'flood_target_f', 'task17-flood-f@example.com', '{"full_name":"Task 17 Flood F"}')
on conflict (id) do update
set email = excluded.email;

insert into public.profiles (id, full_name, is_admin)
values
  (:'reporter', 'Task 17 Reporter', false),
  (:'reported', 'Task 17 Reported', false),
  (:'banned', 'Task 17 Banned', false),
  (:'admin', 'Task 17 Admin', true),
  (:'admin_target', 'Task 17 Admin Target', true),
  (:'flood_reporter', 'Task 17 Flood', false),
  (:'flood_target_a', 'Task 17 Flood A', false),
  (:'flood_target_b', 'Task 17 Flood B', false),
  (:'flood_target_c', 'Task 17 Flood C', false),
  (:'flood_target_d', 'Task 17 Flood D', false),
  (:'flood_target_e', 'Task 17 Flood E', false),
  (:'flood_target_f', 'Task 17 Flood F', false)
on conflict (id) do update
set full_name = excluded.full_name,
    is_admin = excluded.is_admin;

insert into public.profile_contacts (user_id, phone, whatsapp)
values
  (:'reporter', '+15550017001', '+15550017001'),
  (:'reported', '+15550017002', '+15550017002'),
  (:'banned', '+15550017003', '+15550017003'),
  (:'admin', '+15550017004', '+15550017004')
on conflict (user_id) do update
set phone = excluded.phone,
    whatsapp = excluded.whatsapp;

insert into public.rides (
  id, driver_id, origin_label, destination_label, depart_at,
  seats_total, seats_available, status, pickup_location, dropoff_location
)
values (
  :'test_ride', :'reported', 'Mod Origin', 'Mod Dest',
  now() + interval '2 days', 4, 4, 'active',
  '123 Private Pickup St', '456 Private Dropoff Ave'
)
on conflict (id) do nothing;

insert into public.ride_passengers (ride_id, passenger_id, status, guest_count)
values (:'test_ride', :'banned', 'confirmed', 0)
on conflict do nothing;

insert into public.conversations (id)
values (:'test_conversation')
on conflict (id) do nothing;

insert into public.conversation_participants (conversation_id, user_id)
values
  (:'test_conversation', :'reporter'),
  (:'test_conversation', :'reported')
on conflict do nothing;

insert into public.messages (id, conversation_id, sender_id, body)
values (
  :'test_message', :'test_conversation', :'reported', 'Task 17 reported message body'
)
on conflict (id) do nothing;

-- Catalog assertions
select public.task17_assert(
  'is_banned exists',
  to_regprocedure('public.is_banned(uuid)') is not null
);
select public.task17_assert(
  'ban_lockout on profiles',
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'ban_lockout'
  )
);
select public.task17_assert(
  'anon zero grants on reports',
  not has_table_privilege('anon', 'public.reports', 'SELECT')
    and not has_table_privilege('anon', 'public.reports', 'INSERT')
);
select public.task17_assert(
  'authenticated cannot direct insert reports',
  not has_table_privilege('authenticated', 'public.reports', 'INSERT')
);
select public.task17_assert(
  'authenticated cannot direct insert appeals',
  not has_table_privilege('authenticated', 'public.appeals', 'INSERT')
);
select public.task17_assert(
  'submit_report uses advisory lock',
  pg_get_functiondef('public.submit_report(text,uuid,text,text)'::regprocedure)
    ilike '%pg_advisory_xact_lock%'
);
select public.task17_assert(
  'never-banned is_banned false',
  public.is_banned('00000000-0000-4000-8000-000000000099'::uuid) = false
);

-- Seed ban for banned user
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select public.admin_ban_user(
  :'banned'::uuid,
  'Task 17 contract ban',
  now() + interval '1 day',
  null
);
reset role;

-- Banned lockout: SELECT on member tables
set role authenticated;
select set_config('request.jwt.claim.sub', :'banned', false);
select public.task17_assert(
  'banned cannot select rides',
  (select count(*) from public.rides) = 0
);
select public.task17_assert(
  'banned cannot select messages',
  (select count(*) from public.messages) = 0
);
select public.task17_assert(
  'banned cannot insert rides',
  public.task17_capture_sqlstate(
    format(
      $sql$insert into public.rides (driver_id, origin_label, depart_at, seats_total, seats_available)
       values (%L::uuid, 'X', now() + interval '1 day', 2, 2)$sql$,
      :'banned'
    )
  ) = '42501'
);
select public.task17_assert(
  'banned can read own user_bans',
  exists (select 1 from public.user_bans where user_id = :'banned'::uuid)
);
select public.task17_assert(
  'banned is_banned self true',
  public.is_banned(:'banned'::uuid)
);
select public.task17_expect_suspended(
  'banned get_contact blocked',
  format('select * from public.get_contact(%L::uuid)', :'reported')
);
select public.task17_expect_suspended(
  'banned request_seat blocked',
  format('select public.request_seat(%L::uuid)', :'test_ride')
);
select public.task17_expect_suspended(
  'banned ride_meetup_location blocked',
  format('select 1 from public.ride_meetup_location(%L::uuid) limit 1', :'test_ride')
);
select public.task17_expect_suspended(
  'banned get_home_address blocked',
  'select public.get_home_address()'
);
select public.task17_expect_suspended(
  'banned set_home_address blocked',
  format('select public.set_home_address(%L)', '999 Banned Home Rd')
);
select public.task17_assert(
  'direct reports insert denied',
  public.task17_capture_sqlstate(
    format(
      $sql$insert into public.reports (reporter_id, target_type, target_id, reason, evidence, status)
       values (%L::uuid, 'user', %L::uuid, 'forged', '{"forged":true}'::jsonb, 'reviewing')$sql$,
      :'banned',
      :'reported'
    )
  ) = '42501'
);
select public.task17_assert(
  'direct appeals insert denied',
  public.task17_capture_sqlstate(
    format(
      $sql$insert into public.appeals (user_id, ban_created_at, text, status)
       values (%L::uuid, now() - interval '1 year', 'forged appeal', 'pending')$sql$,
      :'banned'
    )
  ) = '42501'
);
reset role;

-- Appeal carve-out
set role authenticated;
select set_config('request.jwt.claim.sub', :'banned', false);
select public.task17_assert(
  'banned can submit appeal via rpc',
  public.submit_appeal('Please review my ban') is not null
);
select public.task17_assert(
  'banned cannot submit second pending appeal',
  public.task17_capture_sqlstate(
    'select public.submit_appeal(''duplicate appeal'')'
  ) <> '00000'
);
reset role;

-- Report flow
set role authenticated;
select set_config('request.jwt.claim.sub', :'reporter', false);
select public.task17_assert(
  'submit_report returns id',
  public.submit_report('message', :'test_message'::uuid, 'Harassment', 'Details here') is not null
);
select public.task17_assert(
  'dedupe rejects second pending report',
  public.task17_capture_sqlstate(
    format(
      'select public.submit_report(''message'', %L::uuid, ''Dup'', null)',
      :'test_message'
    )
  ) <> '00000'
);
reset role;

-- Report flood rate limit (5/hour, serialized per reporter)
set role authenticated;
select set_config('request.jwt.claim.sub', :'flood_reporter', false);
select public.task17_assert(
  'flood reporter report 1',
  public.submit_report('user', :'flood_target_a'::uuid, 'Flood 1', null) is not null
);
select public.task17_assert(
  'flood reporter report 2',
  public.submit_report('user', :'flood_target_b'::uuid, 'Flood 2', null) is not null
);
select public.task17_assert(
  'flood reporter report 3',
  public.submit_report('user', :'flood_target_c'::uuid, 'Flood 3', null) is not null
);
select public.task17_assert(
  'flood reporter report 4',
  public.submit_report('user', :'flood_target_d'::uuid, 'Flood 4', null) is not null
);
select public.task17_assert(
  'flood reporter report 5',
  public.submit_report('user', :'flood_target_e'::uuid, 'Flood 5', null) is not null
);
select public.task17_assert(
  'flood reporter 6th report rate limited',
  public.task17_capture_sqlstate(
    format(
      'select public.submit_report(''user'', %L::uuid, ''Flood 6'', null)',
      :'flood_target_f'
    )
  ) <> '00000'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'reported', false);
select public.task17_assert(
  'reported user cannot see report about them',
  (select count(*) from public.reports where target_id = :'test_message'::uuid) = 0
);
reset role;

-- Admin evidence + ban admin rejection
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select public.task17_assert(
  'admin cannot ban admin',
  public.task17_capture_sqlstate(
    format(
      'select public.admin_ban_user(%L::uuid, ''nope'', null, null)',
      :'admin_target'
    )
  ) <> '00000'
);
select public.task17_assert(
  'admin evidence includes reporter/reported email and phone',
  (
    select (payload->'reporter'->>'email') is not null
       and (payload->'reporter'->>'phone') is not null
       and (payload->'reported'->>'email') is not null
       and (payload->'reported'->>'phone') is not null
    from (
      select public.admin_report_evidence(r.id) as payload
      from public.reports r
      where r.reporter_id = :'reporter'::uuid
      order by r.created_at desc
      limit 1
    ) row
  )
);
reset role;

-- Unban restores access
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select public.task17_assert(
  'admin_unban_user succeeds',
  public.admin_unban_user(:'banned'::uuid, 'appeal granted via test')
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'banned', false);
select public.task17_assert(
  'unbanned user can select rides again',
  (select count(*) from public.rides where id = :'test_ride'::uuid) = 1
);
reset role;

-- Append-only audit (superuser exercises trigger, not privilege denial)
select public.task17_assert(
  'moderation_actions update blocked by trigger',
  public.task17_capture_sqlstate(
    'update public.moderation_actions set detail = ''{}''::jsonb where id = (select id from public.moderation_actions limit 1)'
  ) = 'P0001'
);
select public.task17_assert(
  'moderation_actions delete blocked by trigger',
  public.task17_capture_sqlstate(
    'delete from public.moderation_actions where id = (select id from public.moderation_actions limit 1)'
  ) = 'P0001'
);

-- Anon public feed still works
set role anon;
select public.task17_assert(
  'anon public_upcoming_rides still callable',
  (select count(*) from public.public_upcoming_rides(null, null, null, 5, null)) >= 0
);
reset role;

-- Failures summary
select public.task17_assert(
  'no task17 failures',
  (select count(*) from task17_failures) = 0
);
