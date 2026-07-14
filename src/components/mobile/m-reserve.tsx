"use client";

import { ReserveSeatForm } from "@/components/reserve-seat-form";

export function MReserveButton({
  rideId,
  seatsAvailable,
  savedHome,
  endpointLabel,
  label = "Reserve a seat",
}: {
  rideId: string;
  seatsAvailable: number;
  savedHome: string | null;
  endpointLabel: "Pickup" | "Drop-off" | null;
  label?: string;
}) {
  return (
    <ReserveSeatForm
      rideId={rideId}
      seatsAvailable={seatsAvailable}
      savedHome={savedHome}
      endpointLabel={endpointLabel}
      label={label}
      variant="mobile"
    />
  );
}
