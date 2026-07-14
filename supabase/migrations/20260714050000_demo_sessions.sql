create table public.demo_sessions (
  id uuid primary key,
  owner_kind text not null check (owner_kind = 'admin'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  active_actor_id uuid not null,
  seed_day date not null,
  revision bigint not null default 0 check (revision >= 0),
  snapshot jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demo_sessions_owner_unique unique (owner_id)
);

create index demo_sessions_expires_at_idx on public.demo_sessions (expires_at);

alter table public.demo_sessions enable row level security;

create policy demo_sessions_select_owner
on public.demo_sessions for select to authenticated
using (owner_id = (select auth.uid()));

create or replace function public.demo_session_enable(
  p_id uuid,
  p_active_actor_id uuid,
  p_seed_day date,
  p_snapshot jsonb,
  p_expires_at timestamptz
)
returns table (
  id uuid,
  owner_kind text,
  owner_id uuid,
  active_actor_id uuid,
  seed_day date,
  revision bigint,
  snapshot jsonb,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.is_admin
  ) then
    raise exception 'demo_admin_required' using errcode = '42501';
  end if;

  return query
  insert into public.demo_sessions as sessions (
    id, owner_kind, owner_id, active_actor_id, seed_day, revision, snapshot, expires_at
  ) values (
    p_id, 'admin', auth.uid(), p_active_actor_id, p_seed_day, 0, p_snapshot, p_expires_at
  )
  on conflict on constraint demo_sessions_owner_unique do update
  set active_actor_id = excluded.active_actor_id,
      seed_day = excluded.seed_day,
      revision = sessions.revision + 1,
      snapshot = excluded.snapshot,
      expires_at = excluded.expires_at,
      updated_at = now()
  returning sessions.id,
            sessions.owner_kind,
            sessions.owner_id,
            sessions.active_actor_id,
            sessions.seed_day,
            sessions.revision,
            sessions.snapshot,
            sessions.expires_at;
end;
$$;

create or replace function public.demo_session_compare_and_swap(
  p_id uuid,
  p_expected_revision bigint,
  p_active_actor_id uuid,
  p_snapshot jsonb
)
returns table (
  id uuid,
  owner_kind text,
  owner_id uuid,
  active_actor_id uuid,
  seed_day date,
  revision bigint,
  snapshot jsonb,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.is_admin
  ) then
    raise exception 'demo_admin_required' using errcode = '42501';
  end if;

  return query
  update public.demo_sessions as sessions
  set active_actor_id = p_active_actor_id,
      revision = sessions.revision + 1,
      snapshot = p_snapshot,
      updated_at = now()
  where sessions.id = p_id
    and sessions.owner_id = auth.uid()
    and sessions.revision = p_expected_revision
    and sessions.expires_at > now()
  returning sessions.id,
            sessions.owner_kind,
            sessions.owner_id,
            sessions.active_actor_id,
            sessions.seed_day,
            sessions.revision,
            sessions.snapshot,
            sessions.expires_at;
end;
$$;

create or replace function public.demo_session_disable(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  delete from public.demo_sessions
  where demo_sessions.id = p_id and demo_sessions.owner_id = auth.uid();
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.demo_session_prune()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  delete from public.demo_sessions
  where demo_sessions.owner_id = auth.uid() and demo_sessions.expires_at <= now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on public.demo_sessions from anon, authenticated;
grant select on public.demo_sessions to authenticated;
revoke all on function public.demo_session_enable(uuid, uuid, date, jsonb, timestamptz) from public;
revoke all on function public.demo_session_compare_and_swap(uuid, bigint, uuid, jsonb) from public;
revoke all on function public.demo_session_disable(uuid) from public;
revoke all on function public.demo_session_prune() from public;
grant execute on function public.demo_session_enable(uuid, uuid, date, jsonb, timestamptz) to authenticated;
grant execute on function public.demo_session_compare_and_swap(uuid, bigint, uuid, jsonb) to authenticated;
grant execute on function public.demo_session_disable(uuid) to authenticated;
grant execute on function public.demo_session_prune() to authenticated;
