\set ON_ERROR_STOP on

\set linked_event 00000000-0000-4000-8000-000000021201
\set null_event 00000000-0000-4000-8000-000000021202

begin;

create or replace function pg_temp.task21_assert(
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

grant execute on function pg_temp.task21_assert(text, boolean) to anon;

delete from public.events
where id in (:'linked_event'::uuid, :'null_event'::uuid);

do $$
declare
  v_url text;
begin
  foreach v_url in array array[
    'javascript:alert(1)',
    'data:text/html,hi',
    '//evil.example/phish'
  ]
  loop
    begin
      insert into public.events (name, slug, start_date, source_url)
      values (
        'Task 21 unsafe URL',
        'task-21-unsafe-' || replace(gen_random_uuid()::text, '-', ''),
        current_date + 30,
        v_url
      );
      raise exception 'unsafe source URL unexpectedly accepted: %', v_url;
    exception
      when check_violation then
        null;
    end;
  end loop;
end;
$$;

insert into public.events (
  id, name, slug, start_date, is_active, source_url
)
values
  (
    :'linked_event'::uuid,
    'Task 21 Linked Event',
    'task-21-linked-event',
    current_date + 30,
    true,
    'https://example.com/task-21'
  ),
  (
    :'null_event'::uuid,
    'Task 21 Null Event',
    'task-21-null-event',
    current_date + 31,
    true,
    null
  );

select pg_temp.task21_assert(
  'public board appends source_url after the old columns',
  pg_get_function_result(
    'public.public_event_board(text)'::regprocedure
  ) like '%seats_available bigint, source_url text)'
);

select pg_temp.task21_assert(
  'public list appends source_url after the old columns',
  pg_get_function_result(
    'public.public_upcoming_events()'::regprocedure
  ) like '%seats_available bigint, source_url text)'
);

select pg_temp.task21_assert(
  'public RPC grants remain compatible',
  has_function_privilege(
    'anon',
    'public.public_event_board(text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.public_event_board(text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.public_event_board(text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'anon',
    'public.public_upcoming_events()',
    'EXECUTE'
  )
);

set local role anon;

select pg_temp.task21_assert(
  'anon board receives a valid source URL',
  (
    select source_url = 'https://example.com/task-21'
    from public.public_event_board('task-21-linked-event')
  )
);

select pg_temp.task21_assert(
  'anon list receives a valid source URL',
  exists (
    select 1
    from public.public_upcoming_events()
    where id = :'linked_event'::uuid
      and source_url = 'https://example.com/task-21'
  )
);

select pg_temp.task21_assert(
  'null public source URL remains null',
  (
    select source_url is null
    from public.public_event_board('task-21-null-event')
  )
);

select pg_temp.task21_assert(
  'old named-column callers still work',
  exists (
    select 1
    from (
      select
        id,
        name,
        slug,
        description,
        venue_label,
        start_date,
        end_date,
        is_active,
        created_at,
        ride_count,
        seats_available
      from public.public_event_board('task-21-linked-event')
    ) old_contract
    where id = :'linked_event'::uuid
      and name = 'Task 21 Linked Event'
  )
);

reset role;

drop function pg_temp.task21_assert(text, boolean);

rollback;

select 'task_21_public_event_source_url: PASS' as result;
