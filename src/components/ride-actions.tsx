"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useScrollLock } from "@/lib/use-scroll-lock";
import {
  requestSeat,
  setPassengerStatus,
  cancelRide,
  closeRide,
  cancelSeat,
  cancelRideRequest,
} from "@/app/rides/actions";

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

export function CancelRequestButton({ requestId }: { requestId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await cancelRideRequest(requestId);
      } catch (e) {
        if (e instanceof Error && e.message && !e.message.includes("NEXT_REDIRECT")) {
          setError(e.message);
        }
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-full border border-red-200 px-5 py-3 text-sm font-bold text-red-600 transition hover:bg-red-50 active:scale-[0.98]"
      >
        Cancel request
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-stone-900">Cancel this request?</h2>
            <p className="mt-1 text-sm text-stone-500">
              Drivers will no longer see it in ride requests. You can always post a new one.
            </p>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-full px-4 py-2 text-sm font-semibold text-stone-600 transition hover:bg-stone-100 disabled:opacity-60"
              >
                Keep request
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? "Cancelling..." : "Cancel request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function CancelRideButton({
  rideId,
  confirmedRiderCount,
}: {
  rideId: string;
  confirmedRiderCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useScrollLock(open);

  function setDialogOpen(value: boolean) {
    setOpen(value);
    if (!value) setError(null);
  }

  async function submit() {
    if (confirmedRiderCount > 0 && !reason.trim()) {
      setError("Please write a reason so your passengers know why the ride is cancelled.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await cancelRide(rideId, reason);
        if (result?.error) {
          setError(result.error);
          return;
        }
        router.push("/rides");
        router.refresh();
      } catch (e) {
        console.error("Cancel ride failed", e);
        setError("We couldn't cancel this ride. Please try again.");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="w-full rounded-full border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50 active:scale-[0.98]"
      >
        Cancel ride
      </button>

      {open && (
        <div
          className="visible fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => !pending && setDialogOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />

          <div
            className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-stone-900">Cancel this ride?</h2>
            <p className="mt-1 text-sm text-stone-500">
              {confirmedRiderCount > 0
                ? "Your confirmed riders will be notified with the reason below."
                : "Are you sure? This ride will be removed from active listings."}
            </p>

            {confirmedRiderCount > 0 && (
              <>
                <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (error) setError(null);
                  }}
                  autoFocus
                  rows={3}
                  placeholder="e.g. Car trouble — so sorry!"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "cancel-ride-reason-error" : undefined}
                  className="mt-1.5 w-full resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </>
            )}

            {error && (
              <p id="cancel-ride-reason-error" role="alert" className="mt-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                disabled={pending}
                className="rounded-full px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 transition disabled:opacity-60"
              >
                Keep ride
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {pending ? "Cancelling…" : "Cancel ride"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CloseRideButton({
  rideId,
}: {
  rideId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useScrollLock(open);

  function setDialogOpen(value: boolean) {
    setOpen(value);
    if (!value) setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await closeRide(rideId);
      } catch (e) {
        if (e instanceof Error && e.message && !e.message.includes("NEXT_REDIRECT")) {
          setError(e.message);
        }
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="w-full rounded-full bg-brand-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 active:scale-[0.98]"
      >
        Close ride
      </button>

      {open && (
        <div
          className="visible fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => !pending && setDialogOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-stone-900">Close this ride?</h2>
            <p className="mt-1 text-sm text-stone-500">
              This marks the ride completed, removes it from active listings, and clears its chat history.
            </p>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                disabled={pending}
                className="rounded-full px-4 py-2 text-sm font-semibold text-stone-600 transition hover:bg-stone-100 disabled:opacity-60"
              >
                Keep open
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? "Closing..." : "Close ride"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function DriverRideActions({
  rideId,
  confirmedRiderCount,
}: {
  rideId: string;
  confirmedRiderCount: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <CloseRideButton rideId={rideId} />
      <CancelRideButton rideId={rideId} confirmedRiderCount={confirmedRiderCount} />
    </div>
  );
}

export function CancelSeatButton({
  rideId,
  redirectTo,
}: {
  rideId: string;
  redirectTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useScrollLock(open);

  function submit() {
    if (!message.trim()) {
      setError("Please write a reason so the driver knows why you are cancelling.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await cancelSeat(rideId, message, redirectTo);
        if (result?.error) setError(result.error);
      } catch (e) {
        if (e instanceof Error && e.message && !e.message.includes("NEXT_REDIRECT")) {
          setError("We couldn't cancel your seat. Please try again.");
        }
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-full border border-red-200 px-5 py-3 text-sm font-bold text-red-600 transition hover:bg-red-50 active:scale-[0.98]"
      >
        Cancel my seat
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-stone-900">Cancel your seat?</h2>
            <p className="mt-1 text-sm text-stone-500">
              The driver will get a notification with your reason.
            </p>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-stone-500">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                if (error) setError(null);
              }}
              autoFocus
              rows={3}
              placeholder="e.g. I cannot make it anymore. Sorry for the change."
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "cancel-seat-reason-error" : undefined}
              className="mt-1.5 w-full resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {error && (
              <p id="cancel-seat-reason-error" role="alert" className="mt-2 text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-full px-4 py-2 text-sm font-semibold text-stone-600 transition hover:bg-stone-100 disabled:opacity-60"
              >
                Keep seat
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? "Cancelling..." : "Cancel seat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
