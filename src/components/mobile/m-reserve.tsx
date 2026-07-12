"use client";

import { ReserveSeatForm } from "@/components/reserve-seat-form";

export function MReserveButton({
  rideId,
  seatsAvailable,
  savedHome,
  label = "Reserve a seat",
}: {
  rideId: string;
  seatsAvailable: number;
  savedHome: string | null;
  label?: string;
}) {
  return (
    <ReserveSeatForm
      rideId={rideId}
      seatsAvailable={seatsAvailable}
      savedHome={savedHome}
      label={label}
      variant="mobile"
    />
  );
}
