\set ON_ERROR_STOP on

\set admin_one 00000000-0000-4000-8000-000000029001
\set admin_two 00000000-0000-4000-8000-000000029002
\set session_one 00000000-0000-4000-8000-000000029101
\set session_two 00000000-0000-4000-8000-000000029102
\set actor 10000000-0000-4000-8000-000000000001

create or replace function pg_temp.task29_assert(label text, condition boolean)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'assertion failed: %', label;
  end if;
end;
$$;

create or replace function pg_temp.task29_capture_sqlstate(statement text)
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

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  (:'admin_one', 'task29-admin-one@example.com', '{"full_name":"Task 29 Admin One"}'),
  (:'admin_two', 'task29-admin-two@example.com', '{"full_name":"Task 29 Admin Two"}')
on conflict (id) do update set email = excluded.email;

insert into public.profiles (id, full_name, is_admin) values
  (:'admin_one', 'Task 29 Admin One', true),
  (:'admin_two', 'Task 29 Admin Two', true)
on conflict (id) do update set is_admin = excluded.is_admin;

select pg_temp.task29_assert(
  'authenticated cannot bypass RPC revision checks',
  not has_table_privilege('authenticated', 'public.demo_sessions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.demo_sessions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.demo_sessions', 'DELETE')
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_one', true);

select id as first_id, revision as first_revision
from public.demo_session_enable(:'session_one', :'actor', current_date, '{"state":"first"}', now() + interval '1 hour')
\gset

select id as second_id, revision as second_revision
from public.demo_session_enable(:'session_two', :'actor', current_date, '{"state":"second"}', now() + interval '1 hour')
\gset

select pg_temp.task29_assert(
  'atomic reseed preserves the owner session and advances revision',
  :'first_id'::uuid = :'second_id'::uuid and :'first_revision'::bigint = 0 and :'second_revision'::bigint = 1
);

select pg_temp.task29_assert(
  'stale compare and swap returns no row',
  (select count(*) from public.demo_session_compare_and_swap(:'first_id', 0, :'actor', '{"state":"stale"}')) = 0
);

select set_config('request.jwt.claim.sub', :'admin_two', true);

select pg_temp.task29_assert(
  'cross owner reads and writes are denied',
  (select count(*) from public.demo_sessions where id = :'first_id') = 0
  and (select count(*) from public.demo_session_compare_and_swap(:'first_id', 1, :'actor', '{"state":"other"}')) = 0
);

select set_config('request.jwt.claim.sub', :'admin_one', true);

select id as expired_id, revision as expired_revision
from public.demo_session_enable(:'session_two', :'actor', current_date, '{"state":"expired"}', now() - interval '1 second')
\gset

select pg_temp.task29_assert(
  'expired sessions reject compare and swap',
  (select count(*) from public.demo_session_compare_and_swap(:'expired_id', :'expired_revision', :'actor', '{"state":"late"}')) = 0
);

reset role;
update public.profiles set is_admin = false where id = :'admin_one';
set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_one', true);

select pg_temp.task29_assert(
  'admin revocation blocks mutation',
  pg_temp.task29_capture_sqlstate(format(
    'select * from public.demo_session_compare_and_swap(%L::uuid,%L::bigint,%L::uuid,%L::jsonb)',
    :'expired_id', :'expired_revision', :'actor', '{"state":"revoked"}'
  )) = '42501'
);

rollback;
