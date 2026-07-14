\set ON_ERROR_STOP on

\set reporter 00000000-0000-4000-8000-000000028001
\set target 00000000-0000-4000-8000-000000028002
\set admin_one 00000000-0000-4000-8000-000000028003
\set admin_two 00000000-0000-4000-8000-000000028004
\set report_one 00000000-0000-4000-8000-000000028101
\set report_two 00000000-0000-4000-8000-000000028102
\set report_three 00000000-0000-4000-8000-000000028103
\set report_four 00000000-0000-4000-8000-000000028104
\set receipt_one 00000000-0000-4000-8000-000000028201
\set receipt_two 00000000-0000-4000-8000-000000028202
\set receipt_three 00000000-0000-4000-8000-000000028203
\set receipt_four 00000000-0000-4000-8000-000000028204

create extension if not exists dblink;

create or replace function pg_temp.task28_assert(label text, condition boolean)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'assertion failed: %', label;
  end if;
end;
$$;

create or replace function pg_temp.task28_capture_sqlstate(statement text)
returns text
language plpgsql
as $$
begin
  execute statement;
  return '00000';
exception
  when others then return sqlstate;
end;
$$;

create or replace function pg_temp.task28_capture_message(statement text)
returns text
language plpgsql
as $$
declare
  actual_message text;
begin
  execute statement;
  return null;
exception
  when others then
    get stacked diagnostics actual_message = message_text;
    return actual_message;
end;
$$;

create or replace function public.task28_try_close(
  p_report_id uuid,
  p_receipt_id uuid,
  p_enforcement text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  v_result := public.admin_close_report_case(
    p_report_id,
    0,
    p_receipt_id,
    'violation',
    p_enforcement,
    case when p_enforcement = 'none' then null else 'Task 28 safe reason' end,
    'Task 28 internal note',
    case when p_enforcement = 'temporary_ban' then 1 else null end
  );
  return v_result ->> 'outcome';
exception
  when others then return sqlerrm;
end;
$$;

revoke all on function public.task28_try_close(uuid, uuid, text) from public, anon;
grant execute on function public.task28_try_close(uuid, uuid, text) to authenticated;

select pg_temp.task28_assert(
  'new admin contracts are narrowly granted',
  has_function_privilege(
    'authenticated',
    'public.admin_close_report_case(uuid,integer,uuid,text,text,text,text,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.admin_revise_report_decision(uuid,integer,uuid,text,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.admin_compensate_ban(uuid,uuid,uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.admin_close_report_case(uuid,integer,uuid,text,text,text,text,integer)',
    'EXECUTE'
  )
);

select pg_temp.task28_assert(
  'legacy enforcement bypasses are retired',
  not has_function_privilege('authenticated', 'public.admin_warn_user(uuid,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.admin_ban_user(uuid,text,integer,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.admin_ban_user(uuid,text,timestamp with time zone,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.admin_unban_user(uuid,text,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.admin_unban_user(uuid,text)', 'EXECUTE')
);

select pg_temp.task28_assert(
  'all case functions use empty search paths',
  pg_get_functiondef('public.admin_close_report_case(uuid,integer,uuid,text,text,text,text,integer)'::regprocedure) ilike '%SET search_path TO %''''%'
  and pg_get_functiondef('public.admin_revise_report_decision(uuid,integer,uuid,text,text,text)'::regprocedure) ilike '%SET search_path TO %''''%'
  and pg_get_functiondef('public.admin_compensate_ban(uuid,uuid,uuid,text,text)'::regprocedure) ilike '%SET search_path TO %''''%'
);

select pg_temp.task28_assert(
  'non-evidence report RPCs never materialize the evidence column',
  pg_get_functiondef('public.admin_report_case_context(uuid)'::regprocedure)
    not ilike '%select * into v_report%'
  and pg_get_functiondef('public.admin_report_case_context(uuid)'::regprocedure)
    not ilike '%r.evidence%'
  and pg_get_functiondef('public.admin_set_report_status(uuid,text,text)'::regprocedure)
    not ilike '%select * into v_report%'
  and pg_get_functiondef('public.admin_close_report_case(uuid,integer,uuid,text,text,text,text,integer)'::regprocedure)
    not ilike '%select * into v_report%'
  and pg_get_functiondef('public.admin_revise_report_decision(uuid,integer,uuid,text,text,text)'::regprocedure)
    not ilike '%select * into v_report%'
);

delete from public.moderation_outcomes where recipient_id = :'target'::uuid;
set session_replication_role = replica;
delete from public.moderation_actions where report_id in (:'report_one'::uuid, :'report_two'::uuid, :'report_three'::uuid, :'report_four'::uuid);
set session_replication_role = origin;
delete from public.user_bans where user_id = :'target'::uuid;
delete from public.reports where id in (:'report_one'::uuid, :'report_two'::uuid, :'report_three'::uuid, :'report_four'::uuid);
delete from auth.users where id in (:'reporter'::uuid, :'target'::uuid, :'admin_one'::uuid, :'admin_two'::uuid);

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (:'reporter', 'task28-reporter@example.com', '{"full_name":"Task 28 Reporter"}'),
  (:'target', 'task28-target@example.com', '{"full_name":"Task 28 Target"}'),
  (:'admin_one', 'task28-admin-one@example.com', '{"full_name":"Task 28 Admin One"}'),
  (:'admin_two', 'task28-admin-two@example.com', '{"full_name":"Task 28 Admin Two"}')
on conflict (id) do update set email = excluded.email;

insert into public.profiles (id, full_name, is_admin)
values
  (:'reporter', 'Task 28 Reporter', false),
  (:'target', 'Task 28 Target', false),
  (:'admin_one', 'Task 28 Admin One', true),
  (:'admin_two', 'Task 28 Admin Two', true)
on conflict (id) do update set full_name = excluded.full_name, is_admin = excluded.is_admin;

insert into public.reports (
  id, reporter_id, target_type, target_id, target_user_id, reason, status,
  verdict, verdict_version, enforcement, ban_days
) values (
  :'report_one', :'reporter', 'user', :'target', :'target', 'Task 28 matrix',
  'actioned', 'violation', 1, 'temporary_ban', 7
);

insert into public.reports (
  id, reporter_id, target_type, target_id, target_user_id, reason, evidence
) values
  (
    :'report_two', :'reporter', 'message', :'report_two', :'target',
    'Task 28 revision',
    jsonb_build_object(
      'body', 'reported body',
      'created_at', now(),
      'conversation_id', gen_random_uuid(),
      'message_id', gen_random_uuid(),
      'sender_id', :'target'::uuid,
      'context_included', true,
      'context', jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(),
        'sender_id', :'reporter'::uuid,
        'body', 'context body',
        'created_at', now() - interval '1 minute'
      ))
    )
  ),
  (:'report_three', :'reporter', 'user', :'target', :'target', 'Task 28 compensation', '{}'),
  (:'report_four', :'reporter', 'user', :'reporter', null, 'Task 28 deleted target', '{}');

select pg_temp.task28_assert(
  'projection check rejects mismatched status and verdict',
  pg_temp.task28_capture_sqlstate(format(
    $sql$insert into public.reports (
      reporter_id,target_type,target_id,target_user_id,reason,status,
      verdict,verdict_version,enforcement
    ) values (%L::uuid,'user',%L::uuid,%L::uuid,'bad','dismissed','violation',1,'none')$sql$,
    :'reporter', :'target', :'target'
  )) = '23514'
);

select pg_temp.task28_assert(
  'projection check rejects invalid temporary duration',
  pg_temp.task28_capture_sqlstate(format(
    $sql$insert into public.reports (
      reporter_id,target_type,target_id,target_user_id,reason,status,
      verdict,verdict_version,enforcement,ban_days
    ) values (%L::uuid,'user',%L::uuid,%L::uuid,'bad','actioned','violation',1,'temporary_ban',2)$sql$,
    :'reporter', :'target', :'target'
  )) = '23514'
);

select pg_temp.task28_assert(
  'reporters lack new decision-column access',
  not has_column_privilege('authenticated', 'public.reports', 'verdict', 'SELECT')
  and not has_column_privilege('authenticated', 'public.reports', 'enforcement', 'SELECT')
  and not has_column_privilege('authenticated', 'public.reports', 'evidence', 'SELECT')
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_one', true);
select public.admin_report_evidence(:'report_two'::uuid) as payload \gset revision_evidence_
select pg_temp.task28_assert(
  'evidence is redacted and emits an exact receipt',
  (:'revision_evidence_payload'::jsonb ->> 'receipt_id') is not null
  and :'revision_evidence_payload'::jsonb::text not like '%conversation_id%'
  and :'revision_evidence_payload'::jsonb::text not like '%message_id%'
  and :'revision_evidence_payload'::jsonb::text not like '%sender_id%'
  and :'revision_evidence_payload'::jsonb -> 'report' -> 'target_id' = 'null'::jsonb
  and :'revision_evidence_payload'::jsonb -> 'evidence' -> 'context' -> 0 ->> 'role' = 'reporter'
);

select public.admin_report_evidence(:'report_four'::uuid) as payload \gset missing_target_evidence_
select pg_temp.task28_assert(
  'reported-member enforcement fails explicitly when the retained target is gone',
  pg_temp.task28_capture_message(format(
    'select public.admin_close_report_case(%L::uuid,0,%L::uuid,''violation'',''warn_reported'',''safe reason'',null,null)',
    :'report_four',
    (:'missing_target_evidence_payload'::jsonb ->> 'receipt_id')::uuid
  )) = 'Reported member is no longer available for enforcement'
);

select public.admin_close_report_case(
  :'report_two'::uuid,
  0,
  (:'revision_evidence_payload'::jsonb ->> 'receipt_id')::uuid,
  'no_violation',
  'none',
  null,
  'private close note',
  null
);
select public.admin_report_evidence(:'report_two'::uuid) as payload \gset revise_receipt_
select pg_temp.task28_assert(
  'revision rejects stale expected versions',
  pg_temp.task28_capture_sqlstate(format(
    'select public.admin_revise_report_decision(%L::uuid,0,%L::uuid,''inconclusive'',''stale test'',null)',
    :'report_two',
    (:'revise_receipt_payload'::jsonb ->> 'receipt_id')::uuid
  )) <> '00000'
);
select public.admin_revise_report_decision(
  :'report_two'::uuid,
  1,
  (:'revise_receipt_payload'::jsonb ->> 'receipt_id')::uuid,
  'inconclusive',
  'New evidence interpretation',
  'private revision note'
);
reset role;
select pg_temp.task28_assert(
  'revision writes a complete next-version snapshot',
  exists (
    select 1
    from public.reports r
    where r.id = :'report_two'::uuid
      and r.status = 'dismissed'
      and r.verdict = 'inconclusive'
      and r.verdict_version = 2
      and r.enforcement = 'none'
  )
  and exists (
    select 1
    from public.moderation_actions ma
    where ma.report_id = :'report_two'::uuid
      and ma.action = 'verdict_revised'
      and ma.detail -> 'before' ->> 'verdict_version' = '1'
      and ma.detail -> 'after' ->> 'verdict_version' = '2'
      and ma.detail ->> 'internal_note' = 'private revision note'
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_one', true);
select public.admin_report_evidence(:'report_three'::uuid) as payload \gset compensation_evidence_
select public.admin_close_report_case(
  :'report_three'::uuid,
  0,
  (:'compensation_evidence_payload'::jsonb ->> 'receipt_id')::uuid,
  'violation',
  'temporary_ban',
  'Task 28 safe ban',
  'private ban note',
  1
) as payload \gset compensation_close_
select pg_temp.task28_assert(
  'compensation rejects stale ban identity',
  pg_temp.task28_capture_sqlstate(format(
    'select public.admin_compensate_ban(%L::uuid,%L::uuid,%L::uuid,''safe lift'',null)',
    :'target', gen_random_uuid(), :'report_three'
  )) <> '00000'
);
select public.admin_compensate_ban(
  :'target'::uuid,
  (:'compensation_close_payload'::jsonb ->> 'ban_id')::uuid,
  :'report_three'::uuid,
  'Task 28 safe lift',
  'private compensation note'
);
reset role;
select pg_temp.task28_assert(
  'exact compensation preserves verdict and atomically emits unban',
  not exists (select 1 from public.user_bans where user_id = :'target'::uuid)
  and exists (
    select 1 from public.reports
    where id = :'report_three'::uuid
      and verdict = 'violation'
      and enforcement = 'temporary_ban'
  )
  and exists (
    select 1
    from public.moderation_outcomes mo
    join public.moderation_actions ma on ma.id = mo.source_action_id
    where mo.recipient_id = :'target'::uuid
      and mo.type = 'unban'
      and ma.report_id = :'report_three'::uuid
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'target', true);
select id as outcome_id
from public.moderation_outcomes
where recipient_id = :'target'::uuid
  and type = 'unban'
order by created_at desc, id desc
limit 1 \gset target_
select pg_temp.task28_assert(
  'recipient outcome starts unacknowledged',
  (select acknowledged_at is null from public.moderation_outcomes where id = :'target_outcome_id'::uuid)
);
select pg_temp.task28_assert(
  'member snapshot exposes only the safe compensation reason',
  exists (
    select 1
    from jsonb_array_elements(public.get_moderation_notices() -> 'outcomes') item
    where item ->> 'id' = :'target_outcome_id'
      and item ->> 'type' = 'unban'
      and item ->> 'member_reason' = 'Task 28 safe lift'
  )
  and public.get_moderation_notices()::text not like '%private compensation note%'
);
select pg_temp.task28_assert(
  'recipient can acknowledge its outcome',
  public.acknowledge_moderation_outcome(:'target_outcome_id'::uuid)
);
select pg_temp.task28_assert(
  'acknowledgement is idempotent',
  public.acknowledge_moderation_outcome(:'target_outcome_id'::uuid)
);
select pg_temp.task28_assert(
  'acknowledgement is durable',
  (select acknowledged_at is not null from public.moderation_outcomes where id = :'target_outcome_id'::uuid)
);

reset role;

rollback;

select format(
  'dbname=%s host=%s port=%s',
  current_database(),
  trim(split_part(current_setting('unix_socket_directories'), ',', 1)),
  current_setting('port')
) as task28_connstr \gset

select dblink_connect('task28_seed', :'task28_connstr');
select dblink_exec(
  'task28_seed',
  format(
    $sql$
      delete from public.moderation_outcomes where recipient_id = %L::uuid;
      set session_replication_role = replica;
      delete from public.moderation_actions where report_id in (%L::uuid,%L::uuid,%L::uuid);
      set session_replication_role = origin;
      delete from public.user_bans where user_id = %L::uuid;
      delete from public.reports where id in (%L::uuid,%L::uuid,%L::uuid);
      delete from auth.users where id in (%L::uuid,%L::uuid,%L::uuid,%L::uuid);
    $sql$,
    :'target', :'report_one', :'report_two', :'report_three', :'target',
    :'report_one', :'report_two', :'report_three',
    :'reporter', :'target', :'admin_one', :'admin_two'
  )
);

select dblink_exec(
  'task28_seed',
  format(
    $sql$
      insert into auth.users (id,email,raw_user_meta_data) values
        (%L::uuid,'task28-reporter@example.com','{}'),
        (%L::uuid,'task28-target@example.com','{}'),
        (%L::uuid,'task28-admin-one@example.com','{}'),
        (%L::uuid,'task28-admin-two@example.com','{}');
      insert into public.profiles (id,full_name,is_admin) values
        (%L::uuid,'Task 28 Reporter',false),
        (%L::uuid,'Task 28 Target',false),
        (%L::uuid,'Task 28 Admin One',true),
        (%L::uuid,'Task 28 Admin Two',true)
      on conflict (id) do update set full_name=excluded.full_name,is_admin=excluded.is_admin;
      insert into public.reports (id,reporter_id,target_type,target_id,target_user_id,reason,evidence) values
        (%L::uuid,%L::uuid,'user',%L::uuid,%L::uuid,'Task 28 same case','{}'),
        (%L::uuid,%L::uuid,'user',%L::uuid,%L::uuid,'Task 28 ban one','{}'),
        (%L::uuid,%L::uuid,'user',%L::uuid,%L::uuid,'Task 28 ban two','{}');
      insert into public.moderation_actions (id,actor_id,action,target_user_id,report_id,detail) values
        (%L::uuid,%L::uuid,'evidence_view',%L::uuid,%L::uuid,'{}'),
        (%L::uuid,%L::uuid,'evidence_view',%L::uuid,%L::uuid,'{}'),
        (%L::uuid,%L::uuid,'evidence_view',%L::uuid,%L::uuid,'{}'),
        (%L::uuid,%L::uuid,'evidence_view',%L::uuid,%L::uuid,'{}');
    $sql$,
    :'reporter', :'target', :'admin_one', :'admin_two',
    :'reporter', :'target', :'admin_one', :'admin_two',
    :'report_one', :'reporter', :'target', :'target',
    :'report_two', :'reporter', :'target', :'target',
    :'report_three', :'reporter', :'target', :'target',
    :'receipt_one', :'admin_one', :'target', :'report_one',
    :'receipt_two', :'admin_two', :'target', :'report_one',
    :'receipt_three', :'admin_one', :'target', :'report_two',
    :'receipt_four', :'admin_two', :'target', :'report_three'
  )
);

select dblink_connect('task28_one', :'task28_connstr');
select dblink_connect('task28_two', :'task28_connstr');
select dblink_exec('task28_one', 'begin; set role authenticated');
select dblink_exec('task28_one', format('set request.jwt.claim.sub = %L', :'admin_one'));
select result from dblink(
  'task28_one',
  format('select public.task28_try_close(%L::uuid,%L::uuid,''warn_reported'')', :'report_one', :'receipt_one')
) as response(result text) \gset first_

select dblink_exec('task28_two', 'set role authenticated');
select dblink_exec('task28_two', format('set request.jwt.claim.sub = %L', :'admin_two'));
select dblink_send_query(
  'task28_two',
  format('select public.task28_try_close(%L::uuid,%L::uuid,''warn_reported'')', :'report_one', :'receipt_two')
);
select pg_sleep(0.1);
select pg_temp.task28_assert('second close waits for report lock', dblink_is_busy('task28_two') = 1);
select dblink_exec('task28_one', 'commit');
select result from dblink_get_result('task28_two') as response(result text) \gset second_

select pg_temp.task28_assert(
  'two closes create one decision and one outcome',
  :'first_result' = 'closed'
  and :'second_result' = 'Report is already closed'
  and (select count(*) from public.moderation_actions where report_id = :'report_one'::uuid and action = 'report_status') = 1
  and (select count(*) from public.moderation_outcomes mo join public.moderation_actions ma on ma.id = mo.source_action_id where ma.report_id = :'report_one'::uuid) = 1
);

select dblink_disconnect('task28_two');
select dblink_connect('task28_two', :'task28_connstr');
select dblink_exec('task28_two', 'set role authenticated');
select dblink_exec('task28_two', format('set request.jwt.claim.sub = %L', :'admin_two'));

select dblink_exec('task28_one', 'begin; set role authenticated');
select dblink_exec('task28_one', format('set request.jwt.claim.sub = %L', :'admin_one'));
select result from dblink(
  'task28_one',
  format('select public.task28_try_close(%L::uuid,%L::uuid,''temporary_ban'')', :'report_two', :'receipt_three')
) as response(result text) \gset ban_first_

select dblink_send_query(
  'task28_two',
  format('select public.task28_try_close(%L::uuid,%L::uuid,''temporary_ban'')', :'report_three', :'receipt_four')
);
select pg_sleep(0.1);
select pg_temp.task28_assert('second user enforcement waits for serialization lock', dblink_is_busy('task28_two') = 1);
select dblink_exec('task28_one', 'commit');
select result from dblink_get_result('task28_two') as response(result text) \gset ban_second_

select pg_temp.task28_assert(
  'concurrent bans preserve the first stable ban',
  :'ban_first_result' = 'closed'
  and :'ban_second_result' = 'Target already has an active ban from another case'
  and (select report_id = :'report_two'::uuid from public.user_bans where user_id = :'target'::uuid)
  and (select verdict_version from public.reports where id = :'report_three'::uuid) = 0
);

select dblink_disconnect('task28_one');
select dblink_disconnect('task28_two');

select dblink_exec(
  'task28_seed',
  format(
    $sql$
      delete from public.moderation_outcomes where recipient_id = %L::uuid;
      set session_replication_role = replica;
      delete from public.moderation_actions where report_id in (%L::uuid,%L::uuid,%L::uuid);
      set session_replication_role = origin;
      delete from public.user_bans where user_id = %L::uuid;
      delete from public.reports where id in (%L::uuid,%L::uuid,%L::uuid);
      delete from auth.users where id in (%L::uuid,%L::uuid,%L::uuid,%L::uuid);
    $sql$,
    :'target', :'report_one', :'report_two', :'report_three', :'target',
    :'report_one', :'report_two', :'report_three',
    :'reporter', :'target', :'admin_one', :'admin_two'
  )
);
select dblink_disconnect('task28_seed');

drop function public.task28_try_close(uuid, uuid, text);
