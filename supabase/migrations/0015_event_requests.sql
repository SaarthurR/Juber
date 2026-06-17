-- User-submitted and imported event suggestions awaiting admin review.

create table public.event_requests (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  description       text,
  venue_label       text,
  start_date        date,
  end_date          date,
  source            text not null default 'user' check (source in ('user','jcnc')),
  source_url        text,
  expected_traffic  text not null default 'unsure' check (expected_traffic in ('unsure','high')),
  status            text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by      uuid references public.profiles(id) on delete set null,
  reviewed_by       uuid references public.profiles(id) on delete set null,
  approved_event_id uuid references public.events(id) on delete set null,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index event_requests_status_created_idx on public.event_requests(status, created_at desc);
create unique index event_requests_source_url_unique_idx
  on public.event_requests(source, source_url)
  where source_url is not null;

alter table public.event_requests enable row level security;

create policy "event_requests_select_own_or_admin" on public.event_requests
  for select to authenticated
  using (requested_by = auth.uid() or public.is_admin());

create policy "event_requests_insert_own" on public.event_requests
  for insert to authenticated
  with check (requested_by = auth.uid());

create policy "event_requests_admin_update" on public.event_requests
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "event_requests_admin_delete" on public.event_requests
  for delete to authenticated
  using (public.is_admin());
