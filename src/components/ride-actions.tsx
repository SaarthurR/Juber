"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { MoreHorizontal } from "lucide-react";
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
  variant = "link",
}: {
  rideId: string;
  variant?: "link" | "menu";
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await cancelRide(rideId, reason);
      } catch (e) {
        // redirect() throws a special error Next.js handles — only surface real failures.
        if (e instanceof Error && e.message && !e.message.includes("NEXT_REDIRECT")) {
          setError(e.message);
        }
      }
    });
  }

  return (
    <div className={variant === "menu" ? "" : "mt-3 text-center"}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "menu"
            ? "block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
            : "text-xs font-medium text-red-500 hover:text-red-600 transition hover:underline"
        }
      >
        Cancel this ride
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
            <h2 className="text-lg font-bold text-stone-900">Cancel this ride?</h2>
            <p className="mt-1 text-sm text-stone-500">
              Your confirmed riders will be notified with the reason below.
            </p>

            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-stone-500">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
              rows={3}
              placeholder="e.g. Car trouble — so sorry!"
              className="mt-1.5 w-full resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-full px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 transition disabled:opacity-60"
              >
                Keep ride
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || !reason.trim()}
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
  variant = "primary",
}: {
  rideId: string;
  variant?: "primary" | "menu";
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
        onClick={() => setOpen(true)}
        className={
          variant === "menu"
            ? "block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
            : "w-full rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700 active:scale-[0.98]"
        }
      >
        Close ride
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
            <h2 className="text-lg font-bold text-stone-900">Close this ride?</h2>
            <p className="mt-1 text-sm text-stone-500">
              This marks the ride completed, removes it from active listings, and clears its chat history.
            </p>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
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

export function DriverRideOptions({ rideId }: { rideId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Ride options"
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 text-xs font-bold text-stone-500 transition hover:bg-stone-50 hover:text-stone-700"
      >
        <MoreHorizontal size={16} />
        Options
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-xl border border-stone-200 bg-white p-1.5 shadow-[0_18px_45px_-24px_rgba(68,64,60,0.55)]">
          <CloseRideButton rideId={rideId} variant="menu" />
          <CancelRideButton rideId={rideId} variant="menu" />
        </div>
      )}
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

  function submit() {
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
              onChange={(e) => setMessage(e.target.value)}
              autoFocus
              rows={3}
              placeholder="e.g. I cannot make it anymore. Sorry for the change."
              className="mt-1.5 w-full resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
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
                disabled={pending || !message.trim()}
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
