alter table public.reports
  add column verdict text,
  add column verdict_version integer not null default 0,
  add column enforcement text,
  add column ban_days integer;

alter table public.reports
  add constraint reports_verdict_check check (
    verdict is null or verdict in ('violation', 'no_violation', 'inconclusive')
  ),
  add constraint reports_enforcement_check check (
    enforcement is null or enforcement in (
      'none', 'warn_reported', 'warn_reporter', 'temporary_ban', 'permanent_ban'
    )
  ),
  add constraint reports_decision_projection_check check (
    (
      status in ('pending', 'reviewing')
      and verdict is null
      and verdict_version = 0
      and enforcement is null
      and ban_days is null
    )
    or (
      status in ('actioned', 'dismissed')
      and verdict is null
      and verdict_version = 0
      and enforcement is null
      and ban_days is null
    )
    or (
      status = 'actioned'
      and verdict = 'violation'
      and verdict_version >= 1
      and enforcement in ('none', 'warn_reported', 'temporary_ban', 'permanent_ban')
      and (
        (enforcement = 'temporary_ban' and ban_days in (1, 7, 30))
        or (enforcement <> 'temporary_ban' and ban_days is null)
      )
    )
    or (
      status = 'dismissed'
      and verdict = 'no_violation'
      and verdict_version >= 1
      and enforcement in ('none', 'warn_reporter')
      and ban_days is null
    )
    or (
      status = 'dismissed'
      and verdict = 'inconclusive'
      and verdict_version >= 1
      and enforcement = 'none'
      and ban_days is null
    )
  );

create or replace function public.guard_report_decision_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.verdict_version > new.verdict_version then
    raise exception 'Report decision version cannot decrease';
  end if;

  if old.verdict_version > 0 and (
    old.status,
    old.verdict,
    old.enforcement,
    old.ban_days
  ) is distinct from (
    new.status,
    new.verdict,
    new.enforcement,
    new.ban_days
  ) and new.verdict_version <> old.verdict_version + 1 then
    raise exception 'Report decision changes require the next version';
  end if;

  if old.verdict_version > 0 and (
    old.status,
    old.verdict,
    old.enforcement,
    old.ban_days
  ) is not distinct from (
    new.status,
    new.verdict,
    new.enforcement,
    new.ban_days
  ) and new.verdict_version <> old.verdict_version then
    raise exception 'Report decision version requires a decision change';
  end if;

  return new;
end;
$$;

create trigger reports_decision_transition_guard
  before update on public.reports
  for each row execute function public.guard_report_decision_transition();

revoke execute on function public.guard_report_decision_transition()
  from public, anon, authenticated, service_role;

alter table public.moderation_actions
  drop constraint moderation_actions_action_check,
  add constraint moderation_actions_action_check check (action in (
    'report_submitted', 'report_status', 'verdict_revised', 'warning', 'ban',
    'unban', 'evidence_view', 'appeal_resolved'
  ));

create table public.moderation_outcomes (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  source_action_id uuid not null references public.moderation_actions(id) on delete restrict,
  type text not null check (type in (
    'warning', 'ban', 'unban', 'appeal_granted', 'appeal_denied'
  )),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, type, source_action_id)
);

insert into public.moderation_outcomes (
  recipient_id, source_action_id, type, created_at
)
select ma.target_user_id, ma.id, 'warning', ma.created_at
from public.moderation_actions ma
where ma.action = 'warning'
  and ma.target_user_id is not null
on conflict (recipient_id, type, source_action_id) do nothing;

alter table public.moderation_outcomes enable row level security;

create policy "moderation_outcomes_select_own"
  on public.moderation_outcomes
  for select to authenticated
  using (recipient_id = (select auth.uid()));

revoke all on table public.moderation_outcomes
  from public, anon, authenticated, service_role;
grant select on table public.moderation_outcomes to authenticated;
grant select, insert, update, delete on table public.moderation_outcomes to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables pt
    where pt.pubname = 'supabase_realtime'
      and pt.schemaname = 'public'
      and pt.tablename = 'moderation_outcomes'
  ) then
    alter publication supabase_realtime add table public.moderation_outcomes;
  end if;
end;
$$;

drop index if exists public.reports_status_created_idx;
drop index if exists public.reports_reporter_created_idx;

create index reports_status_created_id_idx
  on public.reports (status, created_at desc, id desc);
create index reports_reporter_created_id_idx
  on public.reports (reporter_id, created_at desc, id desc);
create index reports_target_user_created_id_idx
  on public.reports (target_user_id, created_at desc, id desc)
  where target_user_id is not null;
create index moderation_actions_report_created_id_idx
  on public.moderation_actions (report_id, created_at desc, id desc)
  where report_id is not null;
create index moderation_outcomes_recipient_created_id_idx
  on public.moderation_outcomes (recipient_id, created_at desc, id desc);

revoke all on table public.reports from authenticated;
grant select (
  id, reporter_id, target_type, target_id, reason, details, status, resolution,
  created_at, reviewed_at
) on table public.reports to authenticated;

create or replace function public.acknowledge_moderation_outcome(p_outcome_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.moderation_outcomes mo
  set acknowledged_at = coalesce(mo.acknowledged_at, now())
  where mo.id = p_outcome_id
    and mo.recipient_id = v_user_id;

  return found;
end;
$$;

revoke all on function public.acknowledge_moderation_outcome(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.acknowledge_moderation_outcome(uuid)
  to authenticated, service_role;

create or replace function public.get_moderation_notices()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_ban jsonb;
  v_appeal jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_outcomes jsonb := '[]'::jsonb;
  v_outcome_cursor jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'banned', false,
      'ban', null,
      'has_pending_appeal', false,
      'appeal', null,
      'warnings', v_warnings,
      'outcomes', v_outcomes,
      'outcome_cursor', null
    );
  end if;

  select jsonb_build_object(
    'reason', ub.reason,
    'expires_at', ub.expires_at,
    'created_at', ub.created_at,
    'ban_id', ub.ban_id
  )
  into v_ban
  from public.user_bans ub
  where ub.user_id = v_user_id
    and (ub.expires_at is null or ub.expires_at > now());

  select jsonb_build_object(
    'id', a.id,
    'status', a.status,
    'created_at', a.created_at,
    'resolved_at', a.resolved_at
  )
  into v_appeal
  from public.appeals a
  where a.user_id = v_user_id
  order by a.created_at desc, a.id desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id,
    'note', w.detail ->> 'note',
    'created_at', w.created_at,
    'outcome_id', w.outcome_id,
    'acknowledged_at', w.acknowledged_at
  ) order by w.created_at desc, w.id desc), '[]'::jsonb)
  into v_warnings
  from (
    select ma.id, ma.detail, ma.created_at, mo.id as outcome_id, mo.acknowledged_at
    from public.moderation_actions ma
    left join public.moderation_outcomes mo
      on mo.source_action_id = ma.id
     and mo.recipient_id = v_user_id
     and mo.type = 'warning'
    where ma.target_user_id = v_user_id
      and ma.action = 'warning'
      and ma.created_at > now() - interval '90 days'
    order by ma.created_at desc, ma.id desc
  ) w;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'type', o.type,
    'source_action_id', o.source_action_id,
    'member_reason', o.member_reason,
    'acknowledged_at', o.acknowledged_at,
    'created_at', o.created_at
  ) order by o.created_at desc, o.id desc), '[]'::jsonb)
  into v_outcomes
  from (
    select
      mo.*,
      case when mo.type = 'unban' then ma.detail ->> 'member_reason' end
        as member_reason
    from public.moderation_outcomes mo
    join public.moderation_actions ma on ma.id = mo.source_action_id
    where mo.recipient_id = v_user_id
    order by mo.created_at desc, mo.id desc
    limit 50
  ) o;

  select jsonb_build_object('created_at', mo.created_at, 'id', mo.id)
  into v_outcome_cursor
  from public.moderation_outcomes mo
  where mo.recipient_id = v_user_id
  order by mo.created_at desc, mo.id desc
  limit 1;

  return jsonb_build_object(
    'banned', v_ban is not null,
    'ban', v_ban,
    'has_pending_appeal', coalesce(v_appeal ->> 'status' = 'pending', false),
    'appeal', v_appeal,
    'warnings', v_warnings,
    'outcomes', v_outcomes,
    'outcome_cursor', v_outcome_cursor
  );
end;
$$;

revoke all on function public.get_moderation_notices()
  from public, anon, authenticated, service_role;
grant execute on function public.get_moderation_notices()
  to authenticated, service_role;

create or replace function public.admin_list_report_cases(
  p_scope text default 'open',
  p_reason text default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_items jsonb;
  v_total bigint;
  v_has_more boolean;
  v_cursor jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can list report cases';
  end if;
  if p_scope not in ('open', 'closed', 'all') then
    raise exception 'Invalid report scope';
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception 'Incomplete report cursor';
  end if;

  select count(*) into v_total
  from public.reports r
  where (p_scope = 'all'
    or (p_scope = 'open' and r.status in ('pending', 'reviewing'))
    or (p_scope = 'closed' and r.status in ('actioned', 'dismissed')))
    and (p_reason is null or r.reason = p_reason);

  select coalesce(jsonb_agg(q.item order by q.created_at desc, q.id desc), '[]'::jsonb)
  into v_items
  from (
    select r.created_at, r.id, jsonb_build_object(
      'id', r.id,
      'target_type', r.target_type,
      'reason', r.reason,
      'status', r.status,
      'verdict', r.verdict,
      'verdict_version', r.verdict_version,
      'enforcement', r.enforcement,
      'ban_days', r.ban_days,
      'created_at', r.created_at,
      'reviewed_at', r.reviewed_at,
      'reporter', jsonb_build_object('id', reporter.id, 'full_name', reporter.full_name),
      'reported', case when reported.id is null then null else
        jsonb_build_object('id', reported.id, 'full_name', reported.full_name) end
    ) as item
    from public.reports r
    join public.profiles reporter on reporter.id = r.reporter_id
    left join public.profiles reported on reported.id = r.target_user_id
    where (p_scope = 'all'
      or (p_scope = 'open' and r.status in ('pending', 'reviewing'))
      or (p_scope = 'closed' and r.status in ('actioned', 'dismissed')))
      and (p_reason is null or r.reason = p_reason)
      and (p_cursor_created_at is null
        or (r.created_at, r.id) < (p_cursor_created_at, p_cursor_id))
    order by r.created_at desc, r.id desc
    limit v_limit + 1
  ) q;

  v_has_more := jsonb_array_length(v_items) > v_limit;
  if v_has_more then
    v_items := v_items - v_limit;
    v_cursor := jsonb_build_object(
      'created_at', v_items -> (v_limit - 1) -> 'created_at',
      'id', v_items -> (v_limit - 1) -> 'id'
    );
  end if;

  return jsonb_build_object(
    'items', v_items,
    'next_cursor', v_cursor,
    'total', v_total
  );
end;
$$;

create or replace function public.admin_report_case_context(p_report_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_report record;
  v_has_enforcement boolean;
begin
  if not public.is_admin() then
    raise exception 'Only admins can view report context';
  end if;

  select
    r.id,
    r.reporter_id,
    r.target_type,
    r.target_id,
    r.target_user_id,
    r.reason,
    r.details,
    r.status,
    r.resolution,
    r.verdict,
    r.verdict_version,
    r.enforcement,
    r.ban_days,
    r.created_at,
    r.reviewed_by,
    r.reviewed_at
  into v_report
  from public.reports r
  where r.id = p_report_id;

  if not found then
    raise exception 'Report not found';
  end if;

  select exists (
    select 1
    from public.moderation_actions ma
    where ma.report_id = v_report.id
      and ma.action in ('warning', 'ban')
  ) into v_has_enforcement;

  return jsonb_build_object(
    'report', jsonb_build_object(
      'id', v_report.id,
      'reporter_id', v_report.reporter_id,
      'target_type', v_report.target_type,
      'target_id', v_report.target_id,
      'target_user_id', v_report.target_user_id,
      'reason', v_report.reason,
      'details', v_report.details,
      'status', v_report.status,
      'resolution', v_report.resolution,
      'verdict', v_report.verdict,
      'verdict_version', v_report.verdict_version,
      'enforcement', v_report.enforcement,
      'ban_days', v_report.ban_days,
      'created_at', v_report.created_at,
      'reviewed_at', v_report.reviewed_at,
      'reviewer', (
        select jsonb_build_object('id', p.id, 'full_name', p.full_name)
        from public.profiles p
        where p.id = v_report.reviewed_by
      )
    ),
    'reporter', (
      select jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'neighborhood', p.neighborhood,
        'bio', p.bio,
        'car_make_model', p.car_make_model,
        'car_color', p.car_color,
        'created_at', p.created_at
      )
      from public.profiles p
      where p.id = v_report.reporter_id
    ),
    'reported', (
      select jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'neighborhood', p.neighborhood,
        'bio', p.bio,
        'car_make_model', p.car_make_model,
        'car_color', p.car_color,
        'created_at', p.created_at
      )
      from public.profiles p
      where p.id = v_report.target_user_id
    ),
    'active_ban', (
      select jsonb_build_object(
        'ban_id', ub.ban_id,
        'reason', ub.reason,
        'created_at', ub.created_at,
        'expires_at', ub.expires_at,
        'report_id', ub.report_id
      )
      from public.user_bans ub
      where ub.user_id = v_report.target_user_id
        and (ub.expires_at is null or ub.expires_at > now())
    ),
    'retained_counts', jsonb_build_object(
      'reporter', jsonb_build_object(
        'made', jsonb_build_object(
          'open', (select count(*) from public.reports r where r.reporter_id = v_report.reporter_id and r.status in ('pending', 'reviewing')),
          'closed', (select count(*) from public.reports r where r.reporter_id = v_report.reporter_id and r.status in ('actioned', 'dismissed'))
        ),
        'received', jsonb_build_object(
          'open', (select count(*) from public.reports r where r.target_user_id = v_report.reporter_id and r.status in ('pending', 'reviewing')),
          'closed', (select count(*) from public.reports r where r.target_user_id = v_report.reporter_id and r.status in ('actioned', 'dismissed'))
        )
      ),
      'reported', case when v_report.target_user_id is null then null else jsonb_build_object(
        'made', jsonb_build_object(
          'open', (select count(*) from public.reports r where r.reporter_id = v_report.target_user_id and r.status in ('pending', 'reviewing')),
          'closed', (select count(*) from public.reports r where r.reporter_id = v_report.target_user_id and r.status in ('actioned', 'dismissed'))
        ),
        'received', jsonb_build_object(
          'open', (select count(*) from public.reports r where r.target_user_id = v_report.target_user_id and r.status in ('pending', 'reviewing')),
          'closed', (select count(*) from public.reports r where r.target_user_id = v_report.target_user_id and r.status in ('actioned', 'dismissed'))
        )
      ) end
    ),
    'decision_history', (
      select coalesce(jsonb_agg(h.item order by h.created_at desc, h.id desc), '[]'::jsonb)
      from (
        select ma.created_at, ma.id, jsonb_build_object(
          'id', ma.id,
          'action', ma.action,
          'target_user_id', ma.target_user_id,
          'detail', ma.detail,
          'created_at', ma.created_at,
          'actor', jsonb_build_object('id', actor.id, 'full_name', actor.full_name)
        ) as item
        from public.moderation_actions ma
        join public.profiles actor on actor.id = ma.actor_id
        where ma.report_id = v_report.id
          and ma.action in (
            'report_status', 'verdict_revised', 'warning', 'ban', 'unban',
            'appeal_resolved'
          )
        order by ma.created_at desc, ma.id desc
        limit 5
      ) h
    ),
    'can_revise', v_report.status in ('actioned', 'dismissed')
      and coalesce(v_report.enforcement, 'none') = 'none'
      and not v_has_enforcement,
    'revision_block_reason', case
      when v_report.status not in ('actioned', 'dismissed') then 'Report is not closed'
      when coalesce(v_report.enforcement, 'none') <> 'none' or v_has_enforcement
        then 'Delivered enforcement cannot be rewritten'
      else null
    end
  );
end;
$$;

create or replace function public.admin_list_user_reports(
  p_user_id uuid,
  p_direction text,
  p_scope text default 'all',
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_items jsonb;
  v_total bigint;
  v_has_more boolean;
  v_cursor jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can list user reports';
  end if;
  if p_direction not in ('made', 'received') then
    raise exception 'Invalid report direction';
  end if;
  if p_scope not in ('open', 'closed', 'all') then
    raise exception 'Invalid report scope';
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception 'Incomplete report cursor';
  end if;

  select count(*) into v_total
  from public.reports r
  where ((p_direction = 'made' and r.reporter_id = p_user_id)
      or (p_direction = 'received' and r.target_user_id = p_user_id))
    and (p_scope = 'all'
      or (p_scope = 'open' and r.status in ('pending', 'reviewing'))
      or (p_scope = 'closed' and r.status in ('actioned', 'dismissed')));

  select coalesce(jsonb_agg(q.item order by q.created_at desc, q.id desc), '[]'::jsonb)
  into v_items
  from (
    select r.created_at, r.id, jsonb_build_object(
      'id', r.id,
      'target_type', r.target_type,
      'reason', r.reason,
      'status', r.status,
      'verdict', r.verdict,
      'verdict_version', r.verdict_version,
      'enforcement', r.enforcement,
      'ban_days', r.ban_days,
      'created_at', r.created_at,
      'reviewed_at', r.reviewed_at,
      'reporter', jsonb_build_object('id', reporter.id, 'full_name', reporter.full_name),
      'reported', case when reported.id is null then null else
        jsonb_build_object('id', reported.id, 'full_name', reported.full_name) end
    ) as item
    from public.reports r
    join public.profiles reporter on reporter.id = r.reporter_id
    left join public.profiles reported on reported.id = r.target_user_id
    where ((p_direction = 'made' and r.reporter_id = p_user_id)
        or (p_direction = 'received' and r.target_user_id = p_user_id))
      and (p_scope = 'all'
        or (p_scope = 'open' and r.status in ('pending', 'reviewing'))
        or (p_scope = 'closed' and r.status in ('actioned', 'dismissed')))
      and (p_cursor_created_at is null
        or (r.created_at, r.id) < (p_cursor_created_at, p_cursor_id))
    order by r.created_at desc, r.id desc
    limit v_limit + 1
  ) q;

  v_has_more := jsonb_array_length(v_items) > v_limit;
  if v_has_more then
    v_items := v_items - v_limit;
    v_cursor := jsonb_build_object(
      'created_at', v_items -> (v_limit - 1) -> 'created_at',
      'id', v_items -> (v_limit - 1) -> 'id'
    );
  end if;

  return jsonb_build_object('items', v_items, 'next_cursor', v_cursor, 'total', v_total);
end;
$$;

create or replace function public.admin_list_report_actions(
  p_report_id uuid,
  p_category text default 'decision',
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_items jsonb;
  v_total bigint;
  v_has_more boolean;
  v_cursor jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can list report actions';
  end if;
  if p_category not in ('decision', 'system') then
    raise exception 'Invalid action category';
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception 'Incomplete action cursor';
  end if;

  select count(*) into v_total
  from public.moderation_actions ma
  where ma.report_id = p_report_id
    and ((p_category = 'decision' and ma.action in (
      'report_status', 'verdict_revised', 'warning', 'ban', 'unban',
      'appeal_resolved'
    ))
      or (p_category = 'system' and ma.action in ('report_submitted', 'evidence_view')));

  select coalesce(jsonb_agg(q.item order by q.created_at desc, q.id desc), '[]'::jsonb)
  into v_items
  from (
    select ma.created_at, ma.id, jsonb_build_object(
      'id', ma.id,
      'action', ma.action,
      'target_user_id', ma.target_user_id,
      'detail', ma.detail,
      'created_at', ma.created_at,
      'actor', jsonb_build_object('id', actor.id, 'full_name', actor.full_name)
    ) as item
    from public.moderation_actions ma
    join public.profiles actor on actor.id = ma.actor_id
    where ma.report_id = p_report_id
      and ((p_category = 'decision' and ma.action in (
        'report_status', 'verdict_revised', 'warning', 'ban', 'unban',
        'appeal_resolved'
      ))
        or (p_category = 'system' and ma.action in ('report_submitted', 'evidence_view')))
      and (p_cursor_created_at is null
        or (ma.created_at, ma.id) < (p_cursor_created_at, p_cursor_id))
    order by ma.created_at desc, ma.id desc
    limit v_limit + 1
  ) q;

  v_has_more := jsonb_array_length(v_items) > v_limit;
  if v_has_more then
    v_items := v_items - v_limit;
    v_cursor := jsonb_build_object(
      'created_at', v_items -> (v_limit - 1) -> 'created_at',
      'id', v_items -> (v_limit - 1) -> 'id'
    );
  end if;

  return jsonb_build_object('items', v_items, 'next_cursor', v_cursor, 'total', v_total);
end;
$$;

create or replace function public.admin_report_evidence(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_receipt_id uuid;
  v_evidence jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can view report evidence';
  end if;

  select * into v_report
  from public.reports r
  where r.id = p_report_id;

  if not found then
    raise exception 'Report not found';
  end if;

  v_evidence := case v_report.target_type
    when 'message' then jsonb_build_object(
      'body', v_report.evidence -> 'body',
      'created_at', v_report.evidence -> 'created_at',
      'context_included', coalesce((v_report.evidence ->> 'context_included')::boolean, false),
      'context', coalesce((
        select jsonb_agg(jsonb_build_object(
          'role', case
            when entry.value ->> 'sender_id' = v_report.reporter_id::text then 'reporter'
            else 'reported'
          end,
          'body', entry.value -> 'body',
          'created_at', entry.value -> 'created_at'
        ) order by entry.ordinality)
        from jsonb_array_elements(coalesce(v_report.evidence -> 'context', '[]'::jsonb))
          with ordinality as entry(value, ordinality)
      ), '[]'::jsonb)
    )
    when 'user' then jsonb_build_object('note', v_report.evidence -> 'note')
    else jsonb_build_object(
      'origin_label', v_report.evidence -> 'origin_label',
      'destination_label', v_report.evidence -> 'destination_label',
      'depart_at', v_report.evidence -> 'depart_at',
      'notes', v_report.evidence -> 'notes',
      'status', v_report.evidence -> 'status'
    )
  end;

  insert into public.moderation_actions (
    actor_id, action, target_user_id, report_id, detail
  ) values (
    auth.uid(), 'evidence_view', v_report.target_user_id, v_report.id,
    jsonb_build_object('scope', 'snapshot')
  ) returning id into v_receipt_id;

  return jsonb_build_object(
    'receipt_id', v_receipt_id,
    'report', jsonb_build_object(
      'id', v_report.id,
      'target_type', v_report.target_type,
      'target_id', case when v_report.target_type = 'message' then null else v_report.target_id end,
      'target_user_id', v_report.target_user_id,
      'reason', v_report.reason,
      'details', v_report.details,
      'status', v_report.status,
      'resolution', v_report.resolution,
      'verdict', v_report.verdict,
      'verdict_version', v_report.verdict_version,
      'enforcement', v_report.enforcement,
      'ban_days', v_report.ban_days,
      'created_at', v_report.created_at,
      'reviewed_by', v_report.reviewed_by,
      'reviewed_at', v_report.reviewed_at
    ),
    'evidence', v_evidence,
    'reporter', (
      select jsonb_build_object('id', p.id, 'full_name', p.full_name)
      from public.profiles p
      where p.id = v_report.reporter_id
    ),
    'reported', (
      select jsonb_build_object('id', p.id, 'full_name', p.full_name)
      from public.profiles p
      where p.id = v_report.target_user_id
    )
  );
end;
$$;

create or replace function public.admin_set_report_status(
  p_report_id uuid,
  p_status text,
  p_resolution text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_report record;
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Only admins can review reports';
  end if;
  if p_status <> 'reviewing' then
    raise exception 'Use admin_close_report_case for terminal decisions';
  end if;

  select r.status, r.target_user_id
  into v_report
  from public.reports r
  where r.id = p_report_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;
  if v_report.status = 'reviewing' then
    return jsonb_build_object('outcome', 'already_reviewing', 'status', 'reviewing');
  end if;
  if v_report.status <> 'pending' then
    raise exception 'Closed reports cannot return to review';
  end if;

  update public.reports
  set status = 'reviewing',
      resolution = 'Under review',
      reviewed_by = v_admin_id,
      reviewed_at = now()
  where id = p_report_id;

  insert into public.moderation_actions (
    actor_id, action, target_user_id, report_id, detail
  ) values (
    v_admin_id, 'report_status', v_report.target_user_id, p_report_id,
    jsonb_build_object(
      'status', 'reviewing',
      'resolution', 'Under review',
      'verdict', null,
      'verdict_version', 0,
      'enforcement', null,
      'ban_days', null,
      'internal_note', null
    )
  );

  return jsonb_build_object('outcome', 'updated', 'status', 'reviewing');
end;
$$;

create or replace function public.admin_close_report_case(
  p_report_id uuid,
  p_expected_version integer,
  p_evidence_receipt_id uuid,
  p_verdict text,
  p_enforcement text,
  p_member_reason text,
  p_internal_note text,
  p_ban_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_report record;
  v_target_user_id uuid;
  v_member_reason text := nullif(trim(coalesce(p_member_reason, '')), '');
  v_internal_note text := nullif(trim(coalesce(p_internal_note, '')), '');
  v_status text;
  v_resolution text;
  v_expires_at timestamptz;
  v_enforcement_action_id uuid;
  v_decision_action_id uuid;
  v_outcome_id uuid;
  v_ban_id uuid;
  v_existing_ban public.user_bans%rowtype;
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Only admins can close report cases';
  end if;

  select
    r.id,
    r.reporter_id,
    r.target_user_id,
    r.status,
    r.verdict_version,
    r.created_at,
    r.reviewed_at
  into v_report
  from public.reports r
  where r.id = p_report_id
  for update;

  if not found then
    raise exception 'Report not found';
  end if;
  if v_report.status not in ('pending', 'reviewing') then
    raise exception 'Report is already closed';
  end if;
  if p_expected_version is distinct from v_report.verdict_version then
    raise exception 'stale_report_version';
  end if;
  if v_report.verdict_version <> 0 then
    raise exception 'Open report has an invalid decision version';
  end if;
  if not exists (
    select 1
    from public.moderation_actions ma
    where ma.id = p_evidence_receipt_id
      and ma.action = 'evidence_view'
      and ma.report_id = v_report.id
      and ma.actor_id = v_admin_id
      and ma.created_at >= coalesce(v_report.reviewed_at, v_report.created_at)
  ) then
    raise exception 'Invalid evidence receipt';
  end if;
  if p_verdict not in ('violation', 'no_violation', 'inconclusive') then
    raise exception 'Invalid verdict';
  end if;
  if (p_verdict = 'violation' and p_enforcement not in ('none', 'warn_reported', 'temporary_ban', 'permanent_ban'))
    or (p_verdict = 'no_violation' and p_enforcement not in ('none', 'warn_reporter'))
    or (p_verdict = 'inconclusive' and p_enforcement <> 'none') then
    raise exception 'Invalid verdict enforcement combination';
  end if;
  if p_enforcement in ('warn_reported', 'warn_reporter', 'temporary_ban', 'permanent_ban')
    and (v_member_reason is null or char_length(v_member_reason) > 500) then
    raise exception 'Member reason must be 1-500 characters';
  end if;
  if p_enforcement = 'none' and v_member_reason is not null then
    raise exception 'Member reason is not allowed without enforcement';
  end if;
  if v_internal_note is not null and char_length(v_internal_note) > 4000 then
    raise exception 'Internal note must be 4000 characters or fewer';
  end if;
  if (p_enforcement = 'temporary_ban' and p_ban_days not in (1, 7, 30))
    or (p_enforcement <> 'temporary_ban' and p_ban_days is not null) then
    raise exception 'Invalid ban duration';
  end if;

  v_target_user_id := case
    when p_enforcement = 'warn_reporter' then v_report.reporter_id
    when p_enforcement in ('warn_reported', 'temporary_ban', 'permanent_ban')
      then v_report.target_user_id
    else null
  end;

  if p_enforcement in ('warn_reported', 'temporary_ban', 'permanent_ban')
    and v_target_user_id is null then
    raise exception 'Reported member is no longer available for enforcement';
  end if;

  if v_target_user_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('moderation_enforcement'),
      pg_catalog.hashtext(v_target_user_id::text)
    );
    perform 1
    from public.profiles p
    where p.id = v_target_user_id
      and not p.is_admin
    for update;
    if not found then
      raise exception 'Enforcement target is missing or protected';
    end if;
  end if;

  if p_enforcement in ('warn_reported', 'warn_reporter') then
    insert into public.moderation_actions (
      actor_id, action, target_user_id, report_id, detail
    ) values (
      v_admin_id, 'warning', v_target_user_id, v_report.id,
      jsonb_build_object('note', v_member_reason)
    ) returning id into v_enforcement_action_id;
  elsif p_enforcement in ('temporary_ban', 'permanent_ban') then
    select * into v_existing_ban
    from public.user_bans ub
    where ub.user_id = v_target_user_id
    for update;

    if found and (v_existing_ban.expires_at is null or v_existing_ban.expires_at > now()) then
      raise exception 'Target already has an active ban from another case';
    end if;
    if found then
      delete from public.user_bans ub
      where ub.user_id = v_target_user_id
        and ub.ban_id = v_existing_ban.ban_id;
    end if;

    v_expires_at := case when p_enforcement = 'temporary_ban'
      then now() + pg_catalog.make_interval(days => p_ban_days)
      else null end;

    insert into public.user_bans (
      user_id, banned_by, reason, report_id, expires_at
    ) values (
      v_target_user_id, v_admin_id, v_member_reason, v_report.id, v_expires_at
    ) returning ban_id into v_ban_id;

    insert into public.moderation_actions (
      actor_id, action, target_user_id, report_id, detail
    ) values (
      v_admin_id, 'ban', v_target_user_id, v_report.id,
      jsonb_build_object(
        'reason', v_member_reason,
        'duration_days', p_ban_days,
        'expires_at', v_expires_at,
        'ban_id', v_ban_id
      )
    ) returning id into v_enforcement_action_id;
  end if;

  v_status := case when p_verdict = 'violation' then 'actioned' else 'dismissed' end;
  v_resolution := case
    when p_verdict = 'violation' and p_enforcement = 'none' then 'Violation — no member action'
    when p_enforcement = 'warn_reported' then 'Violation — reported member warned'
    when p_enforcement = 'temporary_ban' then format('Violation — %s-day ban', p_ban_days)
    when p_enforcement = 'permanent_ban' then 'Violation — permanent ban'
    when p_verdict = 'no_violation' and p_enforcement = 'warn_reporter' then 'No violation — reporter warned'
    when p_verdict = 'no_violation' then 'No violation'
    else 'Not enough information'
  end;

  update public.reports
  set status = v_status,
      resolution = v_resolution,
      verdict = p_verdict,
      verdict_version = 1,
      enforcement = p_enforcement,
      ban_days = p_ban_days,
      reviewed_by = v_admin_id,
      reviewed_at = now()
  where id = v_report.id;

  insert into public.moderation_actions (
    actor_id, action, target_user_id, report_id, detail
  ) values (
    v_admin_id, 'report_status', v_report.target_user_id, v_report.id,
    jsonb_build_object(
      'status', v_status,
      'resolution', v_resolution,
      'verdict', p_verdict,
      'verdict_version', 1,
      'enforcement', p_enforcement,
      'ban_days', p_ban_days,
      'member_reason', v_member_reason,
      'internal_note', v_internal_note,
      'reviewer_id', v_admin_id,
      'enforcement_action_id', v_enforcement_action_id,
      'ban_id', v_ban_id
    )
  ) returning id into v_decision_action_id;

  if v_enforcement_action_id is not null then
    insert into public.moderation_outcomes (
      recipient_id, source_action_id, type
    ) values (
      v_target_user_id,
      v_enforcement_action_id,
      case when p_enforcement in ('warn_reported', 'warn_reporter') then 'warning' else 'ban' end
    ) returning id into v_outcome_id;
  end if;

  return jsonb_build_object(
    'outcome', 'closed',
    'report_id', v_report.id,
    'verdict', p_verdict,
    'verdict_version', 1,
    'enforcement', p_enforcement,
    'ban_days', p_ban_days,
    'status', v_status,
    'action_id', v_decision_action_id,
    'enforcement_action_id', v_enforcement_action_id,
    'outcome_id', v_outcome_id,
    'ban_id', v_ban_id
  );
end;
$$;

create or replace function public.admin_revise_report_decision(
  p_report_id uuid,
  p_expected_version integer,
  p_evidence_receipt_id uuid,
  p_verdict text,
  p_revision_reason text,
  p_internal_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_report record;
  v_revision_reason text := nullif(trim(coalesce(p_revision_reason, '')), '');
  v_internal_note text := nullif(trim(coalesce(p_internal_note, '')), '');
  v_status text;
  v_resolution text;
  v_version integer;
  v_reviewed_at timestamptz := now();
  v_action_id uuid;
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Only admins can revise report decisions';
  end if;

  select
    r.id,
    r.target_user_id,
    r.status,
    r.resolution,
    r.verdict,
    r.verdict_version,
    r.enforcement,
    r.ban_days,
    r.created_at,
    r.reviewed_by,
    r.reviewed_at
  into v_report
  from public.reports r
  where r.id = p_report_id
  for update;

  if not found then
    raise exception 'Report not found';
  end if;
  if v_report.status not in ('actioned', 'dismissed') then
    raise exception 'Only closed reports can be revised';
  end if;
  if p_expected_version is distinct from v_report.verdict_version then
    raise exception 'stale_report_version';
  end if;
  if not exists (
    select 1
    from public.moderation_actions ma
    where ma.id = p_evidence_receipt_id
      and ma.action = 'evidence_view'
      and ma.report_id = v_report.id
      and ma.actor_id = v_admin_id
      and ma.created_at >= coalesce(v_report.reviewed_at, v_report.created_at)
  ) then
    raise exception 'Invalid evidence receipt';
  end if;
  if p_verdict not in ('violation', 'no_violation', 'inconclusive') then
    raise exception 'Invalid verdict';
  end if;
  if v_revision_reason is null or char_length(v_revision_reason) > 1000 then
    raise exception 'Revision reason must be 1-1000 characters';
  end if;
  if v_internal_note is not null and char_length(v_internal_note) > 4000 then
    raise exception 'Internal note must be 4000 characters or fewer';
  end if;
  if coalesce(v_report.enforcement, 'none') <> 'none'
    or exists (
      select 1
      from public.moderation_actions ma
      where ma.report_id = v_report.id
        and ma.action in ('warning', 'ban')
    ) then
    raise exception 'Delivered enforcement decisions cannot be revised';
  end if;

  v_status := case when p_verdict = 'violation' then 'actioned' else 'dismissed' end;
  v_resolution := case p_verdict
    when 'violation' then 'Violation — no member action'
    when 'no_violation' then 'No violation'
    else 'Not enough information'
  end;
  v_version := v_report.verdict_version + 1;

  update public.reports
  set status = v_status,
      resolution = v_resolution,
      verdict = p_verdict,
      verdict_version = v_version,
      enforcement = 'none',
      ban_days = null,
      reviewed_by = v_admin_id,
      reviewed_at = v_reviewed_at
  where id = v_report.id;

  insert into public.moderation_actions (
    actor_id, action, target_user_id, report_id, detail
  ) values (
    v_admin_id, 'verdict_revised', v_report.target_user_id, v_report.id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'status', v_report.status,
        'resolution', v_report.resolution,
        'verdict', v_report.verdict,
        'verdict_version', v_report.verdict_version,
        'enforcement', v_report.enforcement,
        'ban_days', v_report.ban_days,
        'reviewer_id', v_report.reviewed_by,
        'reviewed_at', v_report.reviewed_at,
        'legacy', v_report.verdict_version = 0
      ),
      'after', jsonb_build_object(
        'status', v_status,
        'resolution', v_resolution,
        'verdict', p_verdict,
        'verdict_version', v_version,
        'enforcement', 'none',
        'ban_days', null,
        'reviewer_id', v_admin_id,
        'reviewed_at', v_reviewed_at
      ),
      'revision_reason', v_revision_reason,
      'internal_note', v_internal_note
    )
  ) returning id into v_action_id;

  return jsonb_build_object(
    'outcome', 'revised',
    'report_id', v_report.id,
    'verdict', p_verdict,
    'verdict_version', v_version,
    'enforcement', 'none',
    'status', v_status,
    'action_id', v_action_id
  );
end;
$$;

create or replace function public.admin_compensate_ban(
  p_user_id uuid,
  p_expected_ban_id uuid,
  p_expected_report_id uuid,
  p_member_reason text,
  p_internal_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_member_reason text := nullif(trim(coalesce(p_member_reason, '')), '');
  v_internal_note text := nullif(trim(coalesce(p_internal_note, '')), '');
  v_ban public.user_bans%rowtype;
  v_action_id uuid;
  v_outcome_id uuid;
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Only admins can compensate bans';
  end if;
  if p_user_id is null or p_expected_ban_id is null or p_expected_report_id is null then
    raise exception 'Exact user, ban, and report are required';
  end if;
  if v_member_reason is null or char_length(v_member_reason) > 500 then
    raise exception 'Member reason must be 1-500 characters';
  end if;
  if v_internal_note is not null and char_length(v_internal_note) > 4000 then
    raise exception 'Internal note must be 4000 characters or fewer';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('moderation_enforcement'),
    pg_catalog.hashtext(p_user_id::text)
  );
  perform 1 from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'User not found';
  end if;

  select * into v_ban
  from public.user_bans ub
  where ub.user_id = p_user_id
  for update;

  if not found
    or v_ban.ban_id is distinct from p_expected_ban_id
    or v_ban.report_id is distinct from p_expected_report_id then
    raise exception 'stale_ban_identity';
  end if;

  delete from public.user_bans ub
  where ub.user_id = p_user_id
    and ub.ban_id = p_expected_ban_id
    and ub.report_id = p_expected_report_id;

  if not found then
    raise exception 'stale_ban_identity';
  end if;

  insert into public.moderation_actions (
    actor_id, action, target_user_id, report_id, detail
  ) values (
    v_admin_id, 'unban', p_user_id, p_expected_report_id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'ban_id', v_ban.ban_id,
        'banned_by', v_ban.banned_by,
        'reason', v_ban.reason,
        'report_id', v_ban.report_id,
        'created_at', v_ban.created_at,
        'expires_at', v_ban.expires_at
      ),
      'member_reason', v_member_reason,
      'internal_note', v_internal_note
    )
  ) returning id into v_action_id;

  insert into public.moderation_outcomes (
    recipient_id, source_action_id, type
  ) values (
    p_user_id, v_action_id, 'unban'
  ) returning id into v_outcome_id;

  return jsonb_build_object(
    'outcome', 'compensated',
    'user_id', p_user_id,
    'ban_id', p_expected_ban_id,
    'report_id', p_expected_report_id,
    'action_id', v_action_id,
    'outcome_id', v_outcome_id
  );
end;
$$;

create or replace function public.admin_resolve_appeal(
  p_appeal_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_appeal public.appeals%rowtype;
  v_current_ban public.user_bans%rowtype;
  v_ban_matches boolean := false;
  v_unbanned boolean := false;
  v_action_id uuid;
  v_outcome_id uuid;
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Only admins can resolve appeals';
  end if;
  if p_decision not in ('granted', 'denied') then
    raise exception 'Invalid appeal decision';
  end if;
  if p_note is not null and char_length(trim(p_note)) > 4000 then
    raise exception 'Internal note must be 4000 characters or fewer';
  end if;

  select * into v_appeal
  from public.appeals a
  where a.id = p_appeal_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;
  if v_appeal.status <> 'pending' then
    return jsonb_build_object('outcome', 'already_terminal', 'status', v_appeal.status);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('moderation_enforcement'),
    pg_catalog.hashtext(v_appeal.user_id::text)
  );
  perform 1 from public.profiles p where p.id = v_appeal.user_id for update;

  select * into v_current_ban
  from public.user_bans ub
  where ub.user_id = v_appeal.user_id
  for update;

  v_ban_matches := found and v_current_ban.ban_id = v_appeal.ban_id;

  if p_decision = 'granted' and v_ban_matches then
    delete from public.user_bans ub
    where ub.user_id = v_appeal.user_id
      and ub.ban_id = v_appeal.ban_id;
    v_unbanned := found;
  end if;

  update public.appeals
  set status = p_decision,
      resolved_by = v_admin_id,
      resolved_at = now()
  where id = v_appeal.id;

  insert into public.moderation_actions (
    actor_id, action, target_user_id, report_id, detail
  ) values (
    v_admin_id,
    'appeal_resolved',
    v_appeal.user_id,
    case when v_ban_matches then v_current_ban.report_id else null end,
    jsonb_build_object(
      'appeal_id', v_appeal.id,
      'appeal_ban_id', v_appeal.ban_id,
      'current_ban_id', v_current_ban.ban_id,
      'decision', p_decision,
      'unbanned', v_unbanned,
      'internal_note', nullif(trim(coalesce(p_note, '')), '')
    )
  ) returning id into v_action_id;

  insert into public.moderation_outcomes (
    recipient_id, source_action_id, type
  ) values (
    v_appeal.user_id,
    v_action_id,
    case when p_decision = 'granted' then 'appeal_granted' else 'appeal_denied' end
  ) returning id into v_outcome_id;

  return jsonb_build_object(
    'outcome', 'resolved',
    'decision', p_decision,
    'ban_matches', v_ban_matches,
    'unbanned', v_unbanned,
    'action_id', v_action_id,
    'outcome_id', v_outcome_id
  );
end;
$$;

create or replace function public.admin_warn_user(
  p_target_user_id uuid,
  p_report_id uuid default null,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Use admin_close_report_case for warnings';
end;
$$;

create or replace function public.admin_ban_user(
  p_target_user_id uuid,
  p_reason text,
  p_duration_days integer,
  p_report_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Use admin_close_report_case for bans';
end;
$$;

create or replace function public.admin_ban_user(
  p_target_user_id uuid,
  p_reason text,
  p_expires_at timestamptz default null,
  p_report_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Use admin_close_report_case for bans';
end;
$$;

create or replace function public.admin_unban_user(
  p_target_user_id uuid,
  p_note text,
  p_report_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Use admin_compensate_ban with the exact ban identity';
end;
$$;

create or replace function public.admin_unban_user(
  p_target_user_id uuid,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Use admin_compensate_ban with the exact ban identity';
end;
$$;

revoke all on function public.admin_list_report_cases(text, text, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_report_case_context(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_list_user_reports(uuid, text, text, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_list_report_actions(uuid, text, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_report_evidence(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_set_report_status(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_close_report_case(uuid, integer, uuid, text, text, text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_revise_report_decision(uuid, integer, uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_compensate_ban(uuid, uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_resolve_appeal(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_warn_user(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_ban_user(uuid, text, integer, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_ban_user(uuid, text, timestamptz, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_unban_user(uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_unban_user(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.admin_list_report_cases(text, text, timestamptz, uuid, integer)
  to authenticated, service_role;
grant execute on function public.admin_report_case_context(uuid)
  to authenticated, service_role;
grant execute on function public.admin_list_user_reports(uuid, text, text, timestamptz, uuid, integer)
  to authenticated, service_role;
grant execute on function public.admin_list_report_actions(uuid, text, timestamptz, uuid, integer)
  to authenticated, service_role;
grant execute on function public.admin_report_evidence(uuid)
  to authenticated, service_role;
grant execute on function public.admin_set_report_status(uuid, text, text)
  to authenticated, service_role;
grant execute on function public.admin_close_report_case(uuid, integer, uuid, text, text, text, text, integer)
  to authenticated, service_role;
grant execute on function public.admin_revise_report_decision(uuid, integer, uuid, text, text, text)
  to authenticated, service_role;
grant execute on function public.admin_compensate_ban(uuid, uuid, uuid, text, text)
  to authenticated, service_role;
grant execute on function public.admin_resolve_appeal(uuid, text, text)
  to authenticated, service_role;

grant execute on function public.admin_warn_user(uuid, uuid, text)
  to service_role;
grant execute on function public.admin_ban_user(uuid, text, integer, uuid)
  to service_role;
grant execute on function public.admin_ban_user(uuid, text, timestamptz, uuid)
  to service_role;
grant execute on function public.admin_unban_user(uuid, text, uuid)
  to service_role;
grant execute on function public.admin_unban_user(uuid, text)
  to service_role;

do $$
declare
  v_signature text;
  v_admin_signatures text[] := array[
    'public.admin_list_report_cases(text,text,timestamp with time zone,uuid,integer)',
    'public.admin_report_case_context(uuid)',
    'public.admin_list_user_reports(uuid,text,text,timestamp with time zone,uuid,integer)',
    'public.admin_list_report_actions(uuid,text,timestamp with time zone,uuid,integer)',
    'public.admin_report_evidence(uuid)',
    'public.admin_set_report_status(uuid,text,text)',
    'public.admin_close_report_case(uuid,integer,uuid,text,text,text,text,integer)',
    'public.admin_revise_report_decision(uuid,integer,uuid,text,text,text)',
    'public.admin_compensate_ban(uuid,uuid,uuid,text,text)',
    'public.admin_resolve_appeal(uuid,text,text)'
  ];
  v_retired_signatures text[] := array[
    'public.admin_warn_user(uuid,uuid,text)',
    'public.admin_ban_user(uuid,text,integer,uuid)',
    'public.admin_ban_user(uuid,text,timestamp with time zone,uuid)',
    'public.admin_unban_user(uuid,text,uuid)',
    'public.admin_unban_user(uuid,text)'
  ];
begin
  foreach v_signature in array v_admin_signatures loop
    if not pg_catalog.has_function_privilege('authenticated', v_signature, 'EXECUTE')
      or pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE') then
      raise exception 'Invalid admin RPC grant: %', v_signature;
    end if;
  end loop;

  foreach v_signature in array v_retired_signatures loop
    if pg_catalog.has_function_privilege('authenticated', v_signature, 'EXECUTE')
      or pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE') then
      raise exception 'Retired RPC remains callable: %', v_signature;
    end if;
  end loop;

  if not pg_catalog.has_function_privilege(
    'authenticated', 'public.acknowledge_moderation_outcome(uuid)', 'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon', 'public.acknowledge_moderation_outcome(uuid)', 'EXECUTE'
  ) then
    raise exception 'Invalid moderation outcome acknowledgement grant';
  end if;
end;
$$;
