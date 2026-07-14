\set ON_ERROR_STOP on

\set reporter 00000000-0000-4000-8000-000000027001
\set reported 00000000-0000-4000-8000-000000027002
\set admin_one 00000000-0000-4000-8000-000000027003
\set admin_two 00000000-0000-4000-8000-000000027004
\set non_admin 00000000-0000-4000-8000-000000027005
\set conversation 00000000-0000-4000-8000-000000027101
\set message_one 00000000-0000-4000-8000-000000027201
\set message_two 00000000-0000-4000-8000-000000027202
\set message_three 00000000-0000-4000-8000-000000027203
\set message_history_prior 00000000-0000-4000-8000-000000027204
\set message_history_target 00000000-0000-4000-8000-000000027205
\set message_history_later 00000000-0000-4000-8000-000000027206

begin;

create or replace function pg_temp.task27_assert(label text, condition boolean)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'assertion failed: %', label;
  end if;
end;
$$;

create or replace function pg_temp.task27_capture_sqlstate(statement text)
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

create temporary table task27_payloads (
  label text primary key,
  payload jsonb not null
);
grant select, insert on task27_payloads to authenticated;

insert into auth.users (id, email, raw_user_meta_data)
values
  (:'reporter', 'task27-reporter@example.com', '{"full_name":"Task 27 Reporter"}'),
  (:'reported', 'task27-reported@example.com', '{"full_name":"Task 27 Reported"}'),
  (:'admin_one', 'task27-admin-one@example.com', '{"full_name":"Task 27 Admin One"}'),
  (:'admin_two', 'task27-admin-two@example.com', '{"full_name":"Task 27 Admin Two"}'),
  (:'non_admin', 'task27-non-admin@example.com', '{"full_name":"Task 27 Non Admin"}')
on conflict (id) do update
set email = excluded.email,
    raw_user_meta_data = excluded.raw_user_meta_data;

insert into public.profiles (id, full_name, is_admin)
values
  (:'reporter', 'Task 27 Reporter', false),
  (:'reported', 'Task 27 Reported', false),
  (:'admin_one', 'Task 27 Admin One', true),
  (:'admin_two', 'Task 27 Admin Two', true),
  (:'non_admin', 'Task 27 Non Admin', false)
on conflict (id) do update
set full_name = excluded.full_name,
    is_admin = excluded.is_admin;

insert into public.conversations (id) values (:'conversation');
insert into public.conversation_participants (conversation_id, user_id)
values
  (:'conversation', :'reporter'),
  (:'conversation', :'reported');
insert into public.messages (id, conversation_id, sender_id, body, created_at)
values
  (:'message_one', :'conversation', :'reported', 'Task 27 reported one', now() - interval '3 minutes'),
  (:'message_two', :'conversation', :'reporter', 'Task 27 reporter context', now() - interval '2 minutes'),
  (:'message_three', :'conversation', :'reported', 'Task 27 reported two', now() - interval '1 minute'),
  (:'message_history_prior', :'conversation', :'reporter', 'Task 27 history prior', now() - interval '12 minutes'),
  (:'message_history_target', :'conversation', :'reported', 'Task 27 history target', now() - interval '11 minutes'),
  (:'message_history_later', :'conversation', :'reporter', 'Task 27 history later', now() - interval '10 minutes');

insert into public.messages (id, conversation_id, sender_id, body, created_at)
select
  ('00000000-0000-4000-8000-' || lpad((27179 + n)::text, 12, '0'))::uuid,
  :'conversation'::uuid,
  case when n % 2 = 0 then :'reporter'::uuid else :'reported'::uuid end,
  format('Task 27 tied context %s', n),
  (select created_at from public.messages where id = :'message_three'::uuid)
from generate_series(1, 12) n;

select pg_temp.task27_assert(
  'anon cannot submit reports',
  not has_function_privilege(
    'anon',
    'public.submit_report(text,uuid,text,text,boolean)',
    'EXECUTE'
  )
);
select pg_temp.task27_assert(
  'authenticated can submit scoped reports',
  has_function_privilege(
    'authenticated',
    'public.submit_report(text,uuid,text,text,boolean)',
    'EXECUTE'
  )
);
select pg_temp.task27_assert(
  'authenticated cannot call timestamp ban rpc',
  not has_function_privilege(
    'authenticated',
    'public.admin_ban_user(uuid,text,timestamp with time zone,uuid)',
    'EXECUTE'
  )
);
select pg_temp.task27_assert(
  'authenticated uses report-scoped unban rpc',
  has_function_privilege(
    'authenticated',
    'public.admin_unban_user(uuid,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.admin_unban_user(uuid,text)',
    'EXECUTE'
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'reporter', true);
select public.submit_report(
  'message',
  :'message_one'::uuid,
  'Harassment',
  'Task 27 default scope',
  false
) as report_default \gset
select public.submit_report(
  'message',
  :'message_three'::uuid,
  'Harassment',
  'Task 27 context scope',
  true
) as report_context \gset
select public.submit_report(
  'message',
  :'message_history_target'::uuid,
  'Harassment',
  'Task 27 history scope',
  true
) as report_history \gset
reset role;

select pg_temp.task27_assert(
  'message-only report stores exact immutable message and empty context',
  (
    select evidence ->> 'message_id' = :'message_one'
      and evidence ->> 'body' = 'Task 27 reported one'
      and not (evidence ->> 'context_included')::boolean
      and jsonb_array_length(evidence -> 'context') = 0
    from public.reports
    where id = :'report_default'::uuid
  )
);
select pg_temp.task27_assert(
  'tied opted-in context stores exactly ten deterministic siblings outside the target',
  (
    select (evidence ->> 'context_included')::boolean
      and jsonb_array_length(evidence -> 'context') = 10
      and evidence -> 'context' -> 0 ->> 'id' = '00000000-0000-4000-8000-000000027180'
      and evidence -> 'context' -> 9 ->> 'id' = '00000000-0000-4000-8000-000000027189'
      and not (evidence -> 'context' @> jsonb_build_array(
        jsonb_build_object('id', :'message_three'::uuid)
      ))
    from public.reports
    where id = :'report_context'::uuid
  )
);
select pg_temp.task27_assert(
  'opted-in context retains prior history and excludes later pre-submission messages',
  (
    select evidence ->> 'message_id' = :'message_history_target'
      and evidence ->> 'body' = 'Task 27 history target'
      and jsonb_array_length(evidence -> 'context') = 1
      and evidence -> 'context' @> jsonb_build_array(
        jsonb_build_object('id', :'message_history_prior'::uuid)
      )
      and not (evidence -> 'context' @> jsonb_build_array(
        jsonb_build_object('id', :'message_history_later'::uuid)
      ))
    from public.reports
    where id = :'report_history'::uuid
  )
);
select pg_temp.task27_assert(
  'each fixture admin receives one generic actorless notification',
  (
    select count(*) = 6
      and bool_and(actor_id is null)
      and bool_and(message is null)
    from public.notifications
    where report_id in (:'report_default'::uuid, :'report_context'::uuid, :'report_history'::uuid)
      and recipient_id in (:'admin_one'::uuid, :'admin_two'::uuid)
      and type = 'moderation_report_submitted'
  )
);
select pg_temp.task27_assert(
  'non-admin receives no report notification',
  not exists (
    select 1 from public.notifications
    where report_id in (:'report_default'::uuid, :'report_context'::uuid, :'report_history'::uuid)
      and recipient_id = :'non_admin'::uuid
  )
);

insert into public.messages (conversation_id, sender_id, body)
values (:'conversation', :'reported', 'Task 27 post-report message');

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_one', true);
insert into task27_payloads (label, payload)
values (
  'evidence',
  public.admin_report_evidence(:'report_default'::uuid)
);
select pg_temp.task27_assert(
  'invalid ban duration fails before mutation',
  pg_temp.task27_capture_sqlstate(
    format(
      'select public.admin_ban_user(%L::uuid, ''invalid'', 2, %L::uuid)',
      :'reported',
      :'report_context'
    )
  ) <> '00000'
);
insert into task27_payloads (label, payload)
values (
  'ban',
  public.admin_ban_user(
    :'reported'::uuid,
    'Task 27 one-day ban',
    1,
    :'report_context'::uuid
  )
);
select pg_temp.task27_assert(
  'second report is dismissed for terminal mutation checks',
  public.admin_set_report_status(
    :'report_default'::uuid,
    'dismissed',
    'Task 27 dismissed'
  ) ->> 'outcome' = 'updated'
);
select pg_temp.task27_assert(
  'warnings reject actioned and dismissed reports',
  pg_temp.task27_capture_sqlstate(format(
    'select public.admin_warn_user(%L::uuid, %L::uuid, ''blocked'')',
    :'reported',
    :'report_context'
  )) <> '00000'
  and pg_temp.task27_capture_sqlstate(format(
    'select public.admin_warn_user(%L::uuid, %L::uuid, ''blocked'')',
    :'reported',
    :'report_default'
  )) <> '00000'
);
select pg_temp.task27_assert(
  'unban rejects actioned and dismissed reports',
  pg_temp.task27_capture_sqlstate(format(
    'select public.admin_unban_user(%L::uuid, ''blocked'', %L::uuid)',
    :'reported',
    :'report_context'
  )) <> '00000'
  and pg_temp.task27_capture_sqlstate(format(
    'select public.admin_unban_user(%L::uuid, ''blocked'', %L::uuid)',
    :'reported',
    :'report_default'
  )) <> '00000'
);
reset role;

select pg_temp.task27_assert(
  'admin evidence returns only stored snapshot without contacts or live thread',
  (
    select payload -> 'evidence' ->> 'body' = 'Task 27 reported one'
      and jsonb_array_length(payload -> 'evidence' -> 'context') = 0
      and not (payload ? 'thread')
      and payload::text not like '%email%'
      and payload::text not like '%phone%'
      and payload::text not like '%post-report message%'
    from task27_payloads
    where label = 'evidence'
  )
);
select pg_temp.task27_assert(
  'duration ban returns expiry and actions the linked report',
  (
    select payload ->> 'outcome' = 'applied'
      and payload ->> 'report_status' = 'actioned'
      and payload ->> 'expires_at' is not null
    from task27_payloads
    where label = 'ban'
  )
  and exists (
    select 1 from public.user_bans
    where user_id = :'reported'::uuid
      and report_id = :'report_context'::uuid
      and expires_at between now() + interval '23 hours 59 minutes'
                         and now() + interval '24 hours 1 minute'
  )
  and exists (
    select 1 from public.reports
    where id = :'report_context'::uuid
      and status = 'actioned'
      and resolution like 'Temporary ban until %'
      and reviewed_by = :'admin_one'::uuid
      and reviewed_at is not null
  )
  and exists (
    select 1 from public.moderation_actions
    where report_id = :'report_context'::uuid
      and action = 'ban'
      and detail ->> 'duration_days' = '1'
      and detail ->> 'report_status' = 'actioned'
  )
);
select pg_temp.task27_assert(
  'terminal mutation attempts leave ban and warning audit unchanged',
  exists (
    select 1 from public.user_bans
    where user_id = :'reported'::uuid
      and report_id = :'report_context'::uuid
  )
  and not exists (
    select 1 from public.moderation_actions
    where report_id in (:'report_default'::uuid, :'report_context'::uuid)
      and action in ('warning', 'unban')
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'non_admin', true);
select pg_temp.task27_assert(
  'non-admin cannot read admin notifications',
  (
    select count(*) from public.notifications
    where report_id in (:'report_default'::uuid, :'report_context'::uuid, :'report_history'::uuid)
  ) = 0
);
select pg_temp.task27_assert(
  'non-admin cannot read report evidence',
  pg_temp.task27_capture_sqlstate(
    format('select public.admin_report_evidence(%L::uuid)', :'report_default')
  ) <> '00000'
);
reset role;

rollback;
