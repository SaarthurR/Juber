\set ON_ERROR_STOP on

\set reporter 00000000-0000-4000-8000-000000018001
\set reported 00000000-0000-4000-8000-000000018002
\set outsider 00000000-0000-4000-8000-000000018003
\set admin_one 00000000-0000-4000-8000-000000018004
\set admin_two 00000000-0000-4000-8000-000000018005
\set race_user 00000000-0000-4000-8000-000000018006
\set concurrent_user 00000000-0000-4000-8000-000000018007
\set exact_user 00000000-0000-4000-8000-000000018008
\set valid_conversation 00000000-0000-4000-8000-000000018101
\set foreign_conversation 00000000-0000-4000-8000-000000018102
\set valid_message 00000000-0000-4000-8000-000000018201
\set foreign_message 00000000-0000-4000-8000-000000018202
\set forged_message 00000000-0000-4000-8000-000000018203

create extension if not exists dblink;

create or replace function pg_temp.task18_assert(label text, condition boolean)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'assertion failed: %', label;
  end if;
end;
$$;

create or replace function pg_temp.task18_capture_sqlstate(statement text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
begin
  execute statement;
  return '00000';
exception
  when others then return sqlstate;
end;
$$;

create temporary table task18_results (
  label text primary key,
  payload jsonb not null
);

select format(
  'dbname=%s host=%s port=%s',
  current_database(),
  trim(split_part(current_setting('unix_socket_directories'), ',', 1)),
  current_setting('port')
) as task18_connstr \gset

select dblink_connect('task18_seed', :'task18_connstr');

-- Clean any residue from a previously interrupted run.
select dblink_exec(
  'task18_seed',
  format(
    $sql$
      set session_replication_role = replica;
      delete from public.moderation_actions
      where actor_id in (
        %L::uuid, %L::uuid, %L::uuid, %L::uuid, %L::uuid,
        %L::uuid, %L::uuid, %L::uuid
      )
         or target_user_id in (%L::uuid, %L::uuid, %L::uuid);
      set session_replication_role = origin;
      delete from public.appeals
      where user_id in (%L::uuid, %L::uuid, %L::uuid);
      delete from public.user_bans
      where user_id in (%L::uuid, %L::uuid, %L::uuid);
      delete from public.reports
      where reporter_id in (%L::uuid, %L::uuid, %L::uuid);
      delete from public.messages
      where conversation_id in (%L::uuid, %L::uuid);
      delete from public.conversation_participants
      where conversation_id in (%L::uuid, %L::uuid);
      delete from public.conversations
      where id in (%L::uuid, %L::uuid);
      delete from auth.users
      where id in (
        %L::uuid, %L::uuid, %L::uuid, %L::uuid, %L::uuid,
        %L::uuid, %L::uuid, %L::uuid
      )
    $sql$,
    :'reporter', :'reported', :'outsider', :'admin_one', :'admin_two',
    :'race_user', :'concurrent_user', :'exact_user',
    :'race_user', :'concurrent_user', :'exact_user',
    :'race_user', :'concurrent_user', :'exact_user',
    :'race_user', :'concurrent_user', :'exact_user',
    :'reporter', :'reported', :'outsider',
    :'valid_conversation', :'foreign_conversation',
    :'valid_conversation', :'foreign_conversation',
    :'valid_conversation', :'foreign_conversation',
    :'reporter', :'reported', :'outsider', :'admin_one', :'admin_two',
    :'race_user', :'concurrent_user', :'exact_user'
  )
);

select dblink_exec(
  'task18_seed',
  format(
    $sql$
      insert into auth.users (id, raw_user_meta_data)
      values
        (%L::uuid, '{"full_name":"Task 18 Reporter"}'),
        (%L::uuid, '{"full_name":"Task 18 Reported"}'),
        (%L::uuid, '{"full_name":"Task 18 Outsider"}'),
        (%L::uuid, '{"full_name":"Task 18 Admin One"}'),
        (%L::uuid, '{"full_name":"Task 18 Admin Two"}'),
        (%L::uuid, '{"full_name":"Task 18 Race User"}'),
        (%L::uuid, '{"full_name":"Task 18 Concurrent User"}'),
        (%L::uuid, '{"full_name":"Task 18 Exact User"}')
    $sql$,
    :'reporter', :'reported', :'outsider', :'admin_one', :'admin_two',
    :'race_user', :'concurrent_user', :'exact_user'
  )
);

select dblink_exec(
  'task18_seed',
  format(
    $sql$
      update public.profiles
      set is_admin = true
      where id in (%L::uuid, %L::uuid);

      insert into public.conversations (id)
      values (%L::uuid), (%L::uuid);

      insert into public.conversation_participants (conversation_id, user_id)
      values
        (%L::uuid, %L::uuid),
        (%L::uuid, %L::uuid),
        (%L::uuid, %L::uuid),
        (%L::uuid, %L::uuid);

      insert into public.messages (
        id, conversation_id, sender_id, body, created_at
      )
      values
        (
          %L::uuid, %L::uuid, %L::uuid,
          'Task 18 valid target', clock_timestamp()
        ),
        (
          %L::uuid, %L::uuid, %L::uuid,
          'Task 18 foreign target', clock_timestamp()
        ),
        (
          %L::uuid, %L::uuid, %L::uuid,
          'Task 18 forged sender', clock_timestamp()
        );

      insert into public.messages (
        conversation_id, sender_id, body, created_at
      )
      select
        %L::uuid,
        case when g %% 2 = 0 then %L::uuid else %L::uuid end,
        'Task 18 context ' || g,
        clock_timestamp() + make_interval(secs => g)
      from generate_series(1, 12) g
    $sql$,
    :'admin_one', :'admin_two',
    :'valid_conversation', :'foreign_conversation',
    :'valid_conversation', :'reporter',
    :'valid_conversation', :'reported',
    :'foreign_conversation', :'reported',
    :'foreign_conversation', :'outsider',
    :'valid_message', :'valid_conversation', :'reported',
    :'foreign_message', :'foreign_conversation', :'reported',
    :'forged_message', :'valid_conversation', :'outsider',
    :'valid_conversation', :'reporter', :'reported'
  )
);

-- Message evidence: unauthorized/forged targets fail, valid context is bounded.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'reporter', true);

select pg_temp.task18_assert(
  'nonparticipant cannot snapshot foreign conversation evidence',
  pg_temp.task18_capture_sqlstate(
    format(
      'select public.submit_report(''message'', %L::uuid, ''foreign'', null)',
      :'foreign_message'
    )
  ) = 'P0001'
);

select pg_temp.task18_assert(
  'forged sender/message/participant combination is rejected',
  pg_temp.task18_capture_sqlstate(
    format(
      'select public.submit_report(''message'', %L::uuid, ''forged'', null)',
      :'forged_message'
    )
  ) = 'P0001'
);

select pg_temp.task18_assert(
  'rejected message reports persist no evidence',
  not exists (
    select 1
    from public.reports
    where reporter_id = :'reporter'::uuid
      and target_id in (:'foreign_message'::uuid, :'forged_message'::uuid)
  )
);

select public.submit_report(
  'message',
  :'valid_message'::uuid,
  'valid participant report',
  null
) as valid_report_id \gset

reset role;

select pg_temp.task18_assert(
  'valid participant report binds the other participant',
  exists (
    select 1
    from public.reports r
    where r.id = :'valid_report_id'::uuid
      and r.reporter_id = :'reporter'::uuid
      and r.target_user_id = :'reported'::uuid
      and r.evidence ->> 'conversation_id' = :'valid_conversation'
      and r.evidence ->> 'sender_id' = :'reported'
      and jsonb_array_length(r.evidence -> 'context') <= 11
      and not exists (
        select 1
        from jsonb_array_elements(r.evidence -> 'context') item
        where item ->> 'sender_id' not in (:'reporter', :'reported')
      )
  )
);

select pg_temp.task18_assert(
  'report evidence is trigger-immutable',
  pg_temp.task18_capture_sqlstate(
    format(
      'update public.reports set evidence = ''{}''::jsonb where id = %L::uuid',
      :'valid_report_id'
    )
  ) = 'P0001'
);
rollback;

-- Seed three current bans and their exact appeals through the public RPCs.
select dblink_exec('task18_seed', 'set role authenticated');
select dblink_exec(
  'task18_seed',
  format('set request.jwt.claim.sub = %L', :'admin_one')
);

select result
from dblink(
  'task18_seed',
  format(
    'select public.admin_ban_user(%L::uuid, ''old race ban'', null, null)',
    :'race_user'
  )
) as response(result boolean);

select result
from dblink(
  'task18_seed',
  format(
    'select public.admin_ban_user(%L::uuid, ''concurrent ban'', null, null)',
    :'concurrent_user'
  )
) as response(result boolean);

select result
from dblink(
  'task18_seed',
  format(
    'select public.admin_ban_user(%L::uuid, ''exact ban'', null, null)',
    :'exact_user'
  )
) as response(result boolean);

select dblink_exec(
  'task18_seed',
  format('set request.jwt.claim.sub = %L', :'race_user')
);
select appeal_id
from dblink(
  'task18_seed',
  'select public.submit_appeal(''race appeal'')'
) as response(appeal_id uuid)
\gset race_

select dblink_exec(
  'task18_seed',
  format('set request.jwt.claim.sub = %L', :'concurrent_user')
);
select appeal_id
from dblink(
  'task18_seed',
  'select public.submit_appeal(''concurrent appeal'')'
) as response(appeal_id uuid)
\gset concurrent_

select dblink_exec(
  'task18_seed',
  format('set request.jwt.claim.sub = %L', :'exact_user')
);
select appeal_id
from dblink(
  'task18_seed',
  'select public.submit_appeal(''exact appeal'')'
) as response(appeal_id uuid)
\gset exact_

-- Old-appeal/new-ban race: resolver waits on the current-ban row, then must
-- observe the newly issued ban_id and leave that ban in place.
select dblink_connect('task18_reban', :'task18_connstr');
select dblink_connect('task18_race_resolve', :'task18_connstr');
select dblink_exec('task18_reban', 'begin');
select dblink_exec('task18_reban', 'set role authenticated');
select dblink_exec(
  'task18_reban',
  format('set request.jwt.claim.sub = %L', :'admin_one')
);
select ban_id
from dblink(
  'task18_reban',
  format(
    'select ban_id from public.user_bans where user_id = %L::uuid for update',
    :'race_user'
  )
) as locked(ban_id uuid);

select dblink_exec('task18_race_resolve', 'set role authenticated');
select dblink_exec(
  'task18_race_resolve',
  format('set request.jwt.claim.sub = %L', :'admin_two')
);
select dblink_send_query(
  'task18_race_resolve',
  format(
    'select public.admin_resolve_appeal(%L::uuid, ''granted'', ''race'')',
    :'race_appeal_id'
  )
);
select pg_sleep(0.1);
select pg_temp.task18_assert(
  'stale appeal resolution waits behind ban reissue',
  dblink_is_busy('task18_race_resolve') = 1
);

select result
from dblink(
  'task18_reban',
  format(
    'select public.admin_ban_user(%L::uuid, ''new race ban'', null, null)',
    :'race_user'
  )
) as response(result boolean);
select dblink_exec('task18_reban', 'commit');

insert into task18_results (label, payload)
select 'stale race', payload
from dblink_get_result('task18_race_resolve') as response(payload jsonb);

select pg_temp.task18_assert(
  'old appeal never clears the new ban',
  exists (
    select 1
    from public.user_bans ub
    join public.appeals a on a.id = :'race_appeal_id'::uuid
    where ub.user_id = :'race_user'::uuid
      and ub.ban_id <> a.ban_id
  )
  and (
    select payload ->> 'unbanned' = 'false'
    from task18_results
    where label = 'stale race'
  )
);

select dblink_disconnect('task18_reban');
select dblink_disconnect('task18_race_resolve');

-- Concurrent resolution: the second admin waits on the appeal row and then
-- observes the first terminal result; only one resolution audit is written.
select dblink_connect('task18_resolve_one', :'task18_connstr');
select dblink_connect('task18_resolve_two', :'task18_connstr');
select dblink_exec('task18_resolve_one', 'begin');
select dblink_exec('task18_resolve_one', 'set role authenticated');
select dblink_exec(
  'task18_resolve_one',
  format('set request.jwt.claim.sub = %L', :'admin_one')
);
insert into task18_results (label, payload)
select 'concurrent first', payload
from dblink(
  'task18_resolve_one',
  format(
    'select public.admin_resolve_appeal(%L::uuid, ''granted'', ''first'')',
    :'concurrent_appeal_id'
  )
) as response(payload jsonb);

select dblink_exec('task18_resolve_two', 'set role authenticated');
select dblink_exec(
  'task18_resolve_two',
  format('set request.jwt.claim.sub = %L', :'admin_two')
);
select dblink_send_query(
  'task18_resolve_two',
  format(
    'select public.admin_resolve_appeal(%L::uuid, ''denied'', ''second'')',
    :'concurrent_appeal_id'
  )
);
select pg_sleep(0.1);
select pg_temp.task18_assert(
  'second resolution waits behind appeal lock',
  dblink_is_busy('task18_resolve_two') = 1
);
select dblink_exec('task18_resolve_one', 'commit');

insert into task18_results (label, payload)
select 'concurrent second', payload
from dblink_get_result('task18_resolve_two') as response(payload jsonb);

select pg_temp.task18_assert(
  'concurrent resolution has one effective transition',
  (
    select payload ->> 'outcome' = 'resolved'
       and payload ->> 'unbanned' = 'true'
    from task18_results
    where label = 'concurrent first'
  )
  and (
    select payload ->> 'outcome' = 'already_terminal'
    from task18_results
    where label = 'concurrent second'
  )
  and not exists (
    select 1
    from public.user_bans
    where user_id = :'concurrent_user'::uuid
  )
  and (
    select count(*) = 1
    from public.moderation_actions
    where action = 'appeal_resolved'
      and detail ->> 'appeal_id' = :'concurrent_appeal_id'
  )
);

select dblink_disconnect('task18_resolve_one');
select dblink_disconnect('task18_resolve_two');

-- Exact-match grant removes only the ban identified by the appeal.
select dblink_exec(
  'task18_seed',
  format('set request.jwt.claim.sub = %L', :'admin_one')
);
insert into task18_results (label, payload)
select 'exact match', payload
from dblink(
  'task18_seed',
  format(
    'select public.admin_resolve_appeal(%L::uuid, ''granted'', ''exact'')',
    :'exact_appeal_id'
  )
) as response(payload jsonb);

select pg_temp.task18_assert(
  'exact-match appeal unbans',
  (
    select payload ->> 'outcome' = 'resolved'
       and payload ->> 'ban_matches' = 'true'
       and payload ->> 'unbanned' = 'true'
    from task18_results
    where label = 'exact match'
  )
  and not exists (
    select 1
    from public.user_bans
    where user_id = :'exact_user'::uuid
  )
);

-- Cleanup all committed concurrency fixtures.
select dblink_exec('task18_seed', 'reset role');
select dblink_exec(
  'task18_seed',
  format(
    $sql$
      set session_replication_role = replica;
      delete from public.moderation_actions
      where actor_id in (
        %L::uuid, %L::uuid, %L::uuid, %L::uuid, %L::uuid,
        %L::uuid, %L::uuid, %L::uuid
      )
         or target_user_id in (%L::uuid, %L::uuid, %L::uuid);
      set session_replication_role = origin;
      delete from public.appeals
      where user_id in (%L::uuid, %L::uuid, %L::uuid);
      delete from public.user_bans
      where user_id in (%L::uuid, %L::uuid, %L::uuid);
      delete from public.messages
      where conversation_id in (%L::uuid, %L::uuid);
      delete from public.conversation_participants
      where conversation_id in (%L::uuid, %L::uuid);
      delete from public.conversations
      where id in (%L::uuid, %L::uuid);
      delete from auth.users
      where id in (
        %L::uuid, %L::uuid, %L::uuid, %L::uuid, %L::uuid,
        %L::uuid, %L::uuid, %L::uuid
      )
    $sql$,
    :'reporter', :'reported', :'outsider', :'admin_one', :'admin_two',
    :'race_user', :'concurrent_user', :'exact_user',
    :'race_user', :'concurrent_user', :'exact_user',
    :'race_user', :'concurrent_user', :'exact_user',
    :'race_user', :'concurrent_user', :'exact_user',
    :'valid_conversation', :'foreign_conversation',
    :'valid_conversation', :'foreign_conversation',
    :'valid_conversation', :'foreign_conversation',
    :'reporter', :'reported', :'outsider', :'admin_one', :'admin_two',
    :'race_user', :'concurrent_user', :'exact_user'
  )
);
select dblink_disconnect('task18_seed');

select pg_temp.task18_assert(
  'task18 fixtures are removed',
  not exists (
    select 1
    from public.profiles
    where id in (
      :'reporter'::uuid,
      :'reported'::uuid,
      :'outsider'::uuid,
      :'admin_one'::uuid,
      :'admin_two'::uuid,
      :'race_user'::uuid,
      :'concurrent_user'::uuid,
      :'exact_user'::uuid
    )
  )
);
