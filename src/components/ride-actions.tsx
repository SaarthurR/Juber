"use client";

import { useFormStatus } from "react-dom";
import { requestSeat, setPassengerStatus, cancelRide } from "@/app/rides/actions";

function PendingButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function ReserveSeatButton({ rideId }: { rideId: string }) {
  return (
    <form action={requestSeat.bind(null, rideId)}>
      <PendingButton
        pendingLabel="Reserving…"
        className="w-full rounded-full bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        Reserve a seat
      </PendingButton>
    </form>
  );
}

export function PassengerStatusButtons({
  passengerId,
  rideId,
}: {
  passengerId: string;
  rideId: string;
}) {
  return (
    <div className="flex gap-2">
      <form action={setPassengerStatus.bind(null, passengerId, rideId, "confirmed")}>
        <PendingButton
          pendingLabel="…"
          className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 active:scale-[0.97] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Confirm
        </PendingButton>
      </form>
      <form action={setPassengerStatus.bind(null, passengerId, rideId, "declined")}>
        <PendingButton
          pendingLabel="…"
          className="rounded-full border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50 active:scale-[0.97] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Decline
        </PendingButton>
      </form>
    </div>
  );
}

export function CancelRideButton({ rideId }: { rideId: string }) {
  return (
    <form action={cancelRide.bind(null, rideId)} className="mt-5 border-t border-stone-100 pt-4">
      <PendingButton
        pendingLabel="Cancelling…"
        className="text-xs font-medium text-red-500 hover:text-red-600 transition hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
      >
        Cancel this ride
      </PendingButton>
    </form>
  );
}
