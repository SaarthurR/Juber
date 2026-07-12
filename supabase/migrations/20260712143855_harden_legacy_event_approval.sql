-- Preserve the legacy UUID-returning approval RPC while routing all behavior
-- through the canonical row-locked v2 implementation.

create or replace function public.approve_event_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  v_result := public.approve_event_request_v2(p_request_id);
  return nullif(v_result ->> 'event_id', '')::uuid;
end;
$$;

revoke all on function public.approve_event_request(uuid) from public;
revoke all on function public.approve_event_request(uuid) from anon;
grant execute on function public.approve_event_request(uuid) to authenticated;
