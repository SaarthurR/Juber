\set ON_ERROR_STOP on

\set spammer 00000000-0000-4000-8000-000000025001
\set peer_a 00000000-0000-4000-8000-000000025002
\set peer_b 00000000-0000-4000-8000-000000025003
\set peer_c 00000000-0000-4000-8000-000000025004
\set other 00000000-0000-4000-8000-000000025005
\set admin 00000000-0000-4000-8000-000000025006
\set conv_a 00000000-0000-4000-8000-000000025101
\set conv_b 00000000-0000-4000-8000-000000025102
\set conv_c 00000000-0000-4000-8000-000000025103

create extension if not exists dblink;

create temporary table task25_failures (
  label text primary key,
  detail text not null
);
grant select, insert on task25_failures to authenticated;

create or replace function public.task25_assert(label text, condition boolean)
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

create or replace function public.task25_expect_jb429(
  label text,
  statement text,
  expected_scope text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sqlstate text;
  v_detail text;
  v_hint text;
  v_message text;
begin
  begin
    execute statement;
    insert into task25_failures values (label, 'expected JB429, statement succeeded')
    on conflict do nothing;
  exception
    when others then
      get stacked diagnostics
        v_message = message_text,
        v_sqlstate = returned_sqlstate,
        v_detail = pg_exception_detail,
        v_hint = pg_exception_hint;
      if v_sqlstate <> 'JB429' then
        insert into task25_failures values (
          label,
          format('expected JB429, got %s (%s)', v_sqlstate, v_message)
        )
        on conflict do nothing;
      end if;
      if v_detail is distinct from format('scope=%s', expected_scope) then
        insert into task25_failures values (
          label,
          format('unexpected detail %s', coalesce(v_detail, '<null>'))
        )
        on conflict do nothing;
      end if;
      if v_hint is null or v_hint !~ '^retry_after_seconds=[1-9][0-9]*$' then
        insert into task25_failures values (
          label,
          format('unexpected hint %s', coalesce(v_hint, '<null>'))
        )
        on conflict do nothing;
      end if;
      if v_detail ~* 'count|user|sender|driver|rider|00000000' then
        insert into task25_failures values (label, 'detail leaked sensitive data')
        on conflict do nothing;
      end if;
  end;
end;
$$;

create or replace function public.task25_capture_sqlstate(statement text)
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

grant execute on function public.task25_assert(text, boolean) to authenticated;
grant execute on function public.task25_expect_jb429(text, text, text) to authenticated;
grant execute on function public.task25_capture_sqlstate(text) to authenticated;

insert into auth.users (id, raw_user_meta_data)
values
  (:'spammer', '{"full_name":"Task 25 Spammer"}'),
  (:'peer_a', '{"full_name":"Task 25 Peer A"}'),
  (:'peer_b', '{"full_name":"Task 25 Peer B"}'),
  (:'peer_c', '{"full_name":"Task 25 Peer C"}'),
  (:'other', '{"full_name":"Task 25 Other"}'),
  (:'admin', '{"full_name":"Task 25 Admin"}')
on conflict (id) do nothing;

insert into public.profiles (id, full_name, is_admin)
values
  (:'spammer', 'Task 25 Spammer', false),
  (:'peer_a', 'Task 25 Peer A', false),
  (:'peer_b', 'Task 25 Peer B', false),
  (:'peer_c', 'Task 25 Peer C', false),
  (:'other', 'Task 25 Other', false),
  (:'admin', 'Task 25 Admin', true)
on conflict (id) do update
set full_name = excluded.full_name,
    is_admin = excluded.is_admin;

insert into public.profile_contacts (user_id, phone, whatsapp)
select id, '+15550025001', '+15550025001'
from public.profiles
where id in (:'spammer', :'peer_a', :'peer_b', :'peer_c', :'other', :'admin')
on conflict (user_id) do update
set phone = excluded.phone,
    whatsapp = excluded.whatsapp;

insert into public.conversations (id)
values (:'conv_a'), (:'conv_b'), (:'conv_c')
on conflict (id) do nothing;

insert into public.conversation_participants (conversation_id, user_id)
values
  (:'conv_a', :'spammer'), (:'conv_a', :'peer_a'), (:'conv_a', :'other'),
  (:'conv_a', :'admin'),
  (:'conv_b', :'spammer'), (:'conv_b', :'peer_b'),
  (:'conv_c', :'spammer'), (:'conv_c', :'peer_c')
on conflict do nothing;

-- Seed the exact 30-row burst cap across conversations (global fan-out).
alter table public.messages disable trigger messages_enforce_rate;
insert into public.messages (conversation_id, sender_id, body, created_at)
select
  case (g % 3)
    when 0 then :'conv_a'::uuid
    when 1 then :'conv_b'::uuid
    else :'conv_c'::uuid
  end,
  :'spammer'::uuid,
  'seed-' || g,
  now() - interval '5 seconds'
from generate_series(1, 30) g;
alter table public.messages enable trigger messages_enforce_rate;

select public.task25_assert(
  'messages index exists',
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'messages'
      and indexname = 'messages_sender_created_idx'
  )
);

select public.task25_assert(
  'messages count query uses sender index',
  (
    select pg_get_indexdef(i.indexrelid)
    from pg_indexes ix
    join pg_class c on c.relname = ix.indexname
    join pg_index i on i.indexrelid = c.oid
    where ix.schemaname = 'public'
      and ix.tablename = 'messages'
      and ix.indexname = 'messages_sender_created_idx'
  ) is not null
);

select public.task25_assert(
  'trigger functions are not directly executable',
  not has_function_privilege('authenticated', 'public.enforce_message_rate()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.enforce_message_rate()', 'EXECUTE')
);

-- The 31st message in the burst window should fail globally.
select public.task25_expect_jb429(
  'message burst limit',
  format(
    $sql$
      set role authenticated;
      select set_config('request.jwt.claim.sub', %L, true);
      insert into public.messages (conversation_id, sender_id, body)
      values (%L::uuid, %L::uuid, 'burst-over');
    $sql$,
    :'spammer', :'conv_a', :'spammer'
  ),
  'message_burst'
);

-- Cross-user isolation: other user unaffected at same moment.
select public.task25_assert(
  'cross-user message insert succeeds',
  public.task25_capture_sqlstate(
    format(
      $sql$
        set role authenticated;
        select set_config('request.jwt.claim.sub', %L, true);
        insert into public.messages (conversation_id, sender_id, body)
        values (%L::uuid, %L::uuid, 'other-user-msg');
      $sql$,
      :'other', :'conv_a', :'other'
    )
  ) = '00000'
);

-- Actor mismatch skips rate limit; RLS rejects without JB429.
select public.task25_assert(
  'actor mismatch is RLS not rate limit',
  public.task25_capture_sqlstate(
    format(
      $sql$
        set role authenticated;
        select set_config('request.jwt.claim.sub', %L, true);
        insert into public.messages (conversation_id, sender_id, body)
        values (%L::uuid, %L::uuid, 'spoofed-sender');
      $sql$,
      :'spammer', :'conv_a', :'other'
    )
  ) <> 'JB429'
);

-- Normal authenticated own inserts force client-supplied created_at to server time.
set role authenticated;
select set_config('request.jwt.claim.sub', :'other', true);
select public.task25_assert(
  'created_at normalized to server time',
  (
    with inserted as (
      insert into public.messages (conversation_id, sender_id, body, created_at)
      values (
        :'conv_b'::uuid,
        :'other'::uuid,
        'time-normalized',
        timestamptz '2000-01-01'
      )
      returning created_at
    )
    select created_at > now() - interval '5 seconds'
    from inserted
  )
);
reset role;
reset request.jwt.claim.sub;

-- Window expiry: backdate seeded rows, then allow insert again.
update public.messages
set created_at = now() - interval '61 seconds'
where sender_id = :'spammer'::uuid
  and body like 'seed-%';

select public.task25_assert(
  'window expiry allows next message',
  public.task25_capture_sqlstate(
    format(
      $sql$
        set role authenticated;
        select set_config('request.jwt.claim.sub', %L, true);
        insert into public.messages (conversation_id, sender_id, body)
        values (%L::uuid, %L::uuid, 'after-window');
      $sql$,
      :'spammer', :'conv_c', :'spammer'
    )
  ) = '00000'
);

-- Hourly message cap (600): isolated window after clearing prior spammer rows.
delete from public.messages where sender_id = :'spammer'::uuid;

alter table public.messages disable trigger messages_enforce_rate;
insert into public.messages (conversation_id, sender_id, body, created_at)
select
  :'conv_a'::uuid,
  :'spammer'::uuid,
  'hour-seed-' || g,
  now() - interval '30 minutes'
from generate_series(1, 599) g;
alter table public.messages enable trigger messages_enforce_rate;

select public.task25_assert(
  'hourly message 600th succeeds',
  public.task25_capture_sqlstate(
    format(
      $sql$
        set role authenticated;
        select set_config('request.jwt.claim.sub', %L, true);
        insert into public.messages (conversation_id, sender_id, body)
        values (%L::uuid, %L::uuid, 'hour-600');
      $sql$,
      :'spammer', :'conv_a', :'spammer'
    )
  ) = '00000'
);

select public.task25_expect_jb429(
  'hourly message limit',
  format(
    $sql$
      set role authenticated;
      select set_config('request.jwt.claim.sub', %L, true);
      insert into public.messages (conversation_id, sender_id, body)
      values (%L::uuid, %L::uuid, 'hour-601');
    $sql$,
    :'spammer', :'conv_a', :'spammer'
  ),
  'message_hour'
);

-- Admins bypass limits but still receive a trusted server timestamp.
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', true);
select public.task25_assert(
  'admin bypasses message limits and gets server time',
  (
    with inserted as (
      insert into public.messages (
        conversation_id, sender_id, body, created_at
      )
      values (
        :'conv_a'::uuid,
        :'admin'::uuid,
        'admin-bypass',
        timestamptz '2000-01-01'
      )
      returning created_at
    )
    select created_at > now() - interval '5 seconds'
    from inserted
  )
);
reset role;
reset request.jwt.claim.sub;

-- Service/system imports preserve an explicit timestamp when auth.uid() is null.
select public.task25_assert(
  'service role bypasses message limits and preserves created_at',
  (
    with inserted as (
      insert into public.messages (
        conversation_id, sender_id, body, created_at
      )
      values (
        :'conv_a'::uuid,
        :'spammer'::uuid,
        'service-bypass',
        timestamptz '2000-01-02'
      )
      returning created_at
    )
    select created_at = timestamptz '2000-01-02'
    from inserted
  )
);

-- Actor mismatch bypass also precedes timestamp normalization; RLS rejection
-- remains covered above for the authenticated direct-insert path.
select set_config('request.jwt.claim.sub', :'spammer', true);
select public.task25_assert(
  'actor mismatch preserves created_at before RLS',
  (
    with inserted as (
      insert into public.messages (
        conversation_id, sender_id, body, created_at
      )
      values (
        :'conv_a'::uuid,
        :'other'::uuid,
        'mismatch-import',
        timestamptz '2000-01-03'
      )
      returning created_at
    )
    select created_at = timestamptz '2000-01-03'
    from inserted
  )
);
reset request.jwt.claim.sub;

-- Ride burst + depart_at immunity.
alter table public.rides disable trigger rides_enforce_rate;
insert into public.rides (
  driver_id, origin_label, destination_label, depart_at,
  seats_total, seats_available, status, created_at
)
select
  :'spammer'::uuid,
  'San Jose',
  'Jain Center of Northern California',
  now() + interval '365 days',
  1,
  1,
  'active',
  now() - interval '2 minutes'
from generate_series(1, 5);
alter table public.rides enable trigger rides_enforce_rate;

select public.task25_expect_jb429(
  'ride burst limit',
  format(
    $sql$
      set role authenticated;
      select set_config('request.jwt.claim.sub', %L, true);
      insert into public.rides (
        driver_id, origin_label, destination_label, depart_at,
        seats_total, seats_available, status
      )
      values (
        %L::uuid, 'San Jose', 'Jain Center of Northern California',
        now() + interval '999 days', 1, 1, 'active'
      );
    $sql$,
    :'spammer', :'spammer'
  ),
  'ride_burst'
);

select public.task25_assert(
  'other driver ride insert succeeds',
  public.task25_capture_sqlstate(
    format(
      $sql$
        set role authenticated;
        select set_config('request.jwt.claim.sub', %L, true);
        insert into public.rides (
          driver_id, origin_label, destination_label, depart_at,
          seats_total, seats_available, status
        )
        values (
          %L::uuid, 'San Jose', 'Jain Center of Northern California',
          now() + interval '1 day', 1, 1, 'active'
        );
      $sql$,
      :'other', :'other'
    )
  ) = '00000'
);

reset role;
reset request.jwt.claim.sub;
select public.task25_assert(
  'service ride import preserves created_at',
  (
    with inserted as (
      insert into public.rides (
        driver_id, origin_label, destination_label, depart_at,
        seats_total, seats_available, status, created_at
      )
      values (
        :'spammer'::uuid,
        'San Jose',
        'Jain Center of Northern California',
        now() + interval '1 day',
        1,
        1,
        'active',
        timestamptz '2000-01-04'
      )
      returning created_at
    )
    select created_at = timestamptz '2000-01-04'
    from inserted
  )
);

-- Ride request burst.
alter table public.ride_requests disable trigger ride_requests_enforce_rate;
insert into public.ride_requests (
  rider_id, origin_label, destination_label, depart_at,
  earliest_date, latest_date, seats_needed, status, created_at
)
select
  :'spammer'::uuid,
  'San Jose',
  'Jain Center of Northern California',
  now() + interval '365 days',
  current_date,
  current_date + 1,
  1,
  'active',
  now() - interval '2 minutes'
from generate_series(1, 5);
alter table public.ride_requests enable trigger ride_requests_enforce_rate;

select public.task25_expect_jb429(
  'request burst limit',
  format(
    $sql$
      set role authenticated;
      select set_config('request.jwt.claim.sub', %L, true);
      insert into public.ride_requests (
        rider_id, origin_label, destination_label, depart_at,
        earliest_date, latest_date, seats_needed, status
      )
      values (
        %L::uuid, 'San Jose', 'Jain Center of Northern California',
        now() + interval '999 days', current_date, current_date + 1, 1, 'active'
      );
    $sql$,
    :'spammer', :'spammer'
  ),
  'request_burst'
);

reset role;
reset request.jwt.claim.sub;
select public.task25_assert(
  'service request import preserves created_at',
  (
    with inserted as (
      insert into public.ride_requests (
        rider_id, origin_label, destination_label, depart_at,
        earliest_date, latest_date, seats_needed, status, created_at
      )
      values (
        :'spammer'::uuid,
        'San Jose',
        'Jain Center of Northern California',
        now() + interval '1 day',
        current_date,
        current_date + 1,
        1,
        'active',
        timestamptz '2000-01-05'
      )
      returning created_at
    )
    select created_at = timestamptz '2000-01-05'
    from inserted
  )
);

-- Concurrent boundary: 29 existing + two racing inserts => one success, one JB429.
delete from public.messages
where sender_id = :'spammer'::uuid;

alter table public.messages disable trigger messages_enforce_rate;
insert into public.messages (conversation_id, sender_id, body, created_at)
select :'conv_a'::uuid, :'spammer'::uuid, 'race-' || g, now() - interval '5 seconds'
from generate_series(1, 29) g;
alter table public.messages enable trigger messages_enforce_rate;

create or replace function pg_temp.task25_cleanup_race_links()
returns void
language plpgsql
as $$
declare
  v_connection text;
begin
  if 'task25_race_b' = any (
    coalesce(dblink_get_connections(), array[]::text[])
  ) then
    begin
      if dblink_is_busy('task25_race_b') = 1 then
        perform dblink_cancel_query('task25_race_b');
      end if;
      begin
        perform sqlstate
        from dblink_get_result('task25_race_b') as response(sqlstate text);
      exception
        when others then null;
      end;
    exception
      when others then null;
    end;
  end if;

  foreach v_connection in array array['task25_race_a', 'task25_race_b']
  loop
    if v_connection = any (
      coalesce(dblink_get_connections(), array[]::text[])
    ) then
      begin
        perform dblink_exec(v_connection, 'rollback');
      exception
        when others then null;
      end;
      begin
        perform dblink_disconnect(v_connection);
      exception
        when others then null;
      end;
    end if;
  end loop;
end;
$$;

create or replace function pg_temp.task25_run_message_race(
  p_connection text,
  p_user_id uuid,
  p_conversation_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_winner text;
  v_loser text;
  v_auth_a uuid;
  v_auth_b uuid;
  v_blocked boolean;
begin
  perform pg_temp.task25_cleanup_race_links();

  perform dblink_connect('task25_race_a', p_connection);
  perform dblink_connect('task25_race_b', p_connection);
  perform dblink_exec('task25_race_a', 'begin');
  perform dblink_exec('task25_race_b', 'begin');
  perform dblink_exec('task25_race_a', 'set local role authenticated');
  perform dblink_exec('task25_race_b', 'set local role authenticated');
  perform dblink_exec(
    'task25_race_a',
    format('set local request.jwt.claim.sub = %L', p_user_id)
  );
  perform dblink_exec(
    'task25_race_b',
    format('set local request.jwt.claim.sub = %L', p_user_id)
  );

  select remote_uid
  into v_auth_a
  from dblink(
    'task25_race_a',
    'select auth.uid()'
  ) as authenticated_context(remote_uid uuid);

  select remote_uid
  into v_auth_b
  from dblink(
    'task25_race_b',
    'select auth.uid()'
  ) as authenticated_context(remote_uid uuid);

  if v_auth_a is distinct from p_user_id
     or v_auth_b is distinct from p_user_id then
    raise exception 'race connections lack stable authenticated context';
  end if;

  v_winner := dblink_exec(
    'task25_race_a',
    format(
      $sql$
        insert into public.messages (conversation_id, sender_id, body)
        values (%L::uuid, %L::uuid, 'race-a')
      $sql$,
      p_conversation_id,
      p_user_id
    )
  );

  perform dblink_send_query(
    'task25_race_b',
    format(
      $sql$
        select public.task25_capture_sqlstate(
          $insert$
            insert into public.messages (conversation_id, sender_id, body)
            values (%L::uuid, %L::uuid, 'race-b')
          $insert$
        )
      $sql$,
      p_conversation_id,
      p_user_id
    )
  );

  perform pg_sleep(0.1);
  v_blocked := dblink_is_busy('task25_race_b') = 1;
  if not v_blocked then
    raise exception 'losing race insert did not wait on the advisory lock';
  end if;

  -- The winner must commit so the waiting READ COMMITTED insert sees row 30.
  perform dblink_exec('task25_race_a', 'commit');

  select sqlstate
  into v_loser
  from dblink_get_result('task25_race_b') as response(sqlstate text);

  perform pg_temp.task25_cleanup_race_links();

  return jsonb_build_object(
    'winner', v_winner,
    'loser', v_loser,
    'auth_a', v_auth_a,
    'auth_b', v_auth_b,
    'blocked', v_blocked
  );
exception
  when others then
    perform pg_temp.task25_cleanup_race_links();
    raise;
end;
$$;

create temporary table task25_race_results (
  result jsonb not null
);

insert into task25_race_results (result)
select pg_temp.task25_run_message_race(
  format('dbname=%s', current_database()),
  :'spammer'::uuid,
  :'conv_a'::uuid
);

select public.task25_assert(
  'concurrent boundary has one success and one JB429',
  (
    select result ->> 'winner' = 'INSERT 0 1'
       and result ->> 'loser' = 'JB429'
       and (result ->> 'blocked')::boolean
       and result ->> 'auth_a' = :'spammer'
       and result ->> 'auth_b' = :'spammer'
    from task25_race_results
  )
);

select public.task25_assert(
  'concurrent boundary leaves no extra row',
  (
    select count(*)
    from public.messages
    where sender_id = :'spammer'::uuid
      and body like 'race-%'
      and created_at > now() - interval '1 minute'
  ) = 30
);

select public.task25_assert(
  'concurrent race rolls back and disconnects both links',
  not (
    'task25_race_a' = any (
      coalesce(dblink_get_connections(), array[]::text[])
    )
    or 'task25_race_b' = any (
      coalesce(dblink_get_connections(), array[]::text[])
    )
  )
);

select label, detail from task25_failures order by label;

select public.task25_assert(
  'task 25 contracts passed',
  (select count(*) from task25_failures) = 0
);
