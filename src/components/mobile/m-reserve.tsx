"use client";

import { requestSeat } from "@/app/rides/actions";
import { PendingActionButton } from "@/components/pending-action-button";

export function MReserveButton({ rideId }: { rideId: string }) {
  return (
    <form action={requestSeat.bind(null, rideId)}>
      <PendingActionButton
        actionKey={`mobile-reserve-${rideId}`}
        pendingLabel="Reserving…"
        className="h-[54px] w-full rounded-[14px] bg-brand-600 text-[15px] font-bold text-white shadow-[0_14px_24px_-12px_rgba(166,83,41,0.7)] transition hover:bg-brand-700 active:scale-[0.98] disabled:opacity-60"
      >
        Reserve a seat
      </PendingActionButton>
    </form>
  );
}
