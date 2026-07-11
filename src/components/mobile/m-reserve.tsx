"use client";

import { useActionState } from "react";
import { requestSeat } from "@/app/rides/actions";
import { InlineActionError } from "@/components/inline-action-error";
import { PendingActionButton } from "@/components/pending-action-button";

export function MReserveButton({
  rideId,
  label = "Reserve a seat",
}: {
  rideId: string;
  label?: string;
}) {
  const [state, formAction] = useActionState(requestSeat.bind(null, rideId), null);

  return (
    <form action={formAction}>
      <PendingActionButton
        actionKey={`mobile-reserve-${rideId}`}
        pendingLabel="Submitting..."
        className="h-[54px] w-full rounded-[14px] bg-brand-600 text-[15px] font-bold text-white shadow-[0_14px_24px_-12px_rgba(166,83,41,0.7)] transition hover:bg-brand-700 active:scale-[0.98] disabled:opacity-60"
      >
        {label}
      </PendingActionButton>
      <InlineActionError
        id={`mobile-reserve-${rideId}-error`}
        error={state?.error}
        className="mt-2 text-center text-[13px] font-bold text-red-600"
      />
    </form>
  );
}
