export const NOTIFICATION_SELECT =
  "*, actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url), ride:rides!notifications_ride_id_fkey(id,origin_label,destination_label,depart_at,status), request:ride_requests!notifications_request_id_fkey(id,origin_label,destination_label,depart_at,status), event:events!notifications_event_id_fkey(id,name,slug)";

export const FALLBACK_NOTIFICATION_SELECT =
  "*, actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url), ride:rides!notifications_ride_id_fkey(id,origin_label,destination_label,depart_at,status), event:events!notifications_event_id_fkey(id,name,slug)";
