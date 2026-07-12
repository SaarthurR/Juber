import type { RideWithDriver } from "@/lib/types";

export const RIDE_COLUMNS =
  "id,driver_id,origin_label,destination_label,depart_at,round_trip,return_depart_at,return_notes,seats_total,seats_available,gas_contribution,notes,event_id,status,cancellation_reason,created_at";

export const RIDE_WITH_JOIN = `${RIDE_COLUMNS},driver:profiles!rides_driver_id_fkey(*),event:events(id,name,slug)`;

export const RIDE_NESTED_JOIN = RIDE_WITH_JOIN;

export function asRideWithDriverRows(data: unknown): RideWithDriver[] {
  return (data as RideWithDriver[]) ?? [];
}
