-- The owner-only indexes are strict left-prefix duplicates of the anti-spam
-- owner+created_at indexes. Removing them makes bounded window scans use the
-- exact composites while reducing insert write amplification.

drop index if exists public.messages_sender_id_idx;
drop index if exists public.rides_driver_id_idx;
drop index if exists public.ride_requests_rider_id_idx;

do $$
declare
  v_index text;
begin
  foreach v_index in array array[
    'messages_sender_created_idx',
    'rides_driver_created_idx',
    'ride_requests_rider_created_idx'
  ]
  loop
    if not exists (
      select 1
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_index
        and i.indisvalid
        and i.indisready
    ) then
      raise exception 'required anti-spam index missing or invalid: %', v_index;
    end if;
  end loop;
end
$$;
