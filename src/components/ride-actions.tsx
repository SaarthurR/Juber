"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { actionErrorMessage } from "@/lib/action-lifecycle";
import { InlineActionError } from "@/components/inline-action-error";
import { PendingActionButton, PendingActionGroup } from "@/components/pending-action-button";
import { DesktopDialog } from "@/components/ui/desktop-dialog";
import {
  setPassengerStatus,
  cancelRide,
  closeRide,
  cancelSeat,
  cancelRideRequest,
  acceptRideRequest,
} from "@/app/rides/actions";
import { openConversation } from "@/app/messages/actions";

import { ReserveSeatForm } from "@/components/reserve-seat-form";

export function ReserveSeatButton({
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
      variant="desktop"
    />
  );
}

export function PassengerStatusButtons({
  passengerId,
  rideId,
}: {
  passengerId: string;
  rideId: string;
}) {
  const [confirmState, confirmAction] = useActionState(
    setPassengerStatus.bind(null, passengerId, rideId, "confirmed"),
    null,
  );
  const [declineState, declineAction] = useActionState(
    setPassengerStatus.bind(null, passengerId, rideId, "declined"),
    null,
  );
  const error =
    (confirmState && "error" in confirmState ? confirmState.error : undefined) ??
    (declineState && "error" in declineState ? declineState.error : undefined);

  return (
    <PendingActionGroup>
      <div className="flex gap-2">
        <form action={confirmAction}>
          <PendingActionButton
            actionKey={`confirm-${passengerId}`}
            pendingLabel="Confirming..."
            className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 active:scale-[0.97] transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Confirm
          </PendingActionButton>
        </form>
        <form action={declineAction}>
          <PendingActionButton
            actionKey={`decline-${passengerId}`}
            pendingLabel="Declining..."
            className="rounded-full border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50 active:scale-[0.97] transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Decline
          </PendingActionButton>
        </form>
      </div>
      <InlineActionError
        id={`passenger-${passengerId}-error`}
        error={error}
        className="mt-2 text-right text-xs font-semibold text-red-600"
      />
    </PendingActionGroup>
  );
}

export function AcceptRequestButton({
  requestId,
  base,
  actionKeyPrefix = "accept-request",
}: {
  requestId: string;
  base?: "/messages" | "/m/messages";
  actionKeyPrefix?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [setupPath, setSetupPath] = useState<string | null>(null);

  function submit() {
    setError(null);
    setSetupPath(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("request_id", requestId);
        if (base) formData.set("base", base);
        const result = await acceptRideRequest(requestId, formData);
        if ("error" in result) {
          setError(result.error);
          setSetupPath(result.setupPath ?? null);
          return;
        }
        setSetupPath(null);
        router.push(result.redirectTo);
        router.refresh();
      } catch (actionError) {
        setError(
          actionErrorMessage(
            actionError,
            "We couldn't accept this request. Please try again.",
          ),
        );
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <CheckCircle2 size={17} />
        {pending ? "Accepting..." : "Accept request"}
      </button>
      <InlineActionError
        id={`${actionKeyPrefix}-${requestId}-error`}
        error={error}
        className="mt-2 text-center text-sm font-semibold text-red-600"
      />
      {setupPath && (
        <a
          href={setupPath}
          className="mt-1 inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold text-brand-600 underline-offset-2 hover:underline"
        >
          Finish contact info in profile
        </a>
      )}
    </div>
  );
}

export function CancelRequestButton({
  requestId,
  base,
}: {
  requestId: string;
  base?: "/rides" | "/m";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function setDialogOpen(value: boolean) {
    setOpen(value);
    if (!value) setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        if (base) formData.set("base", base);
        const result = await cancelRideRequest(requestId, formData);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        router.push(result.redirectTo);
        router.refresh();
      } catch (actionError) {
        setError(
          actionErrorMessage(
            actionError,
            "We couldn't cancel this request. Please try again.",
          ),
        );
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="w-full rounded-full border border-red-200 px-5 py-3 text-sm font-bold text-red-600 transition hover:bg-red-50 active:scale-[0.98]"
      >
        Cancel request
      </button>

      {open && (
        <DesktopDialog
          open
          onDismiss={() => setDialogOpen(false)}
          dismissDisabled={pending}
          labelledBy="cancel-request-title"
          closeLabel="Keep request"
        >
            <h2 id="cancel-request-title" className="pr-8 text-lg font-bold text-stone-900">Cancel this request?</h2>
            <p className="mt-1 text-sm text-stone-500">
              Drivers will no longer see it in ride requests. You can always post a new one.
            </p>
            <p className="mt-2 text-sm text-stone-500">
              To change trip details, cancel this post and create a new one.
            </p>
            <InlineActionError
              id="cancel-request-error"
              error={error}
              className="mt-3 text-sm font-semibold text-red-600"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                disabled={pending}
                className="rounded-full px-4 py-2 text-sm font-semibold text-stone-600 transition hover:bg-stone-100 disabled:opacity-60"
              >
                Keep request
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                aria-describedby={error ? "cancel-request-error" : undefined}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? "Cancelling..." : "Cancel request"}
              </button>
            </div>
        </DesktopDialog>
      )}
    </>
  );
}

export function CancelRideButton({
  rideId,
  confirmedRiderCount,
  base = "/rides",
}: {
  rideId: string;
  confirmedRiderCount: number;
  base?: "/rides" | "/m";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
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
        const result = await cancelRide(rideId, reason, base);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        router.push(result.redirectTo);
        router.refresh();
      } catch (actionError) {
        setError(
          actionErrorMessage(
            actionError,
            "We couldn't cancel this ride. Please try again.",
          ),
        );
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
        <DesktopDialog
          open
          onDismiss={() => setDialogOpen(false)}
          dismissDisabled={pending}
          labelledBy="cancel-ride-title"
          closeLabel="Keep ride"
        >
            <h2 id="cancel-ride-title" className="pr-8 text-lg font-bold text-stone-900">Cancel this ride?</h2>
            <p className="mt-1 text-sm text-stone-500">
              {confirmedRiderCount > 0
                ? "Your confirmed riders will be notified with the reason below."
                : "Are you sure? This ride will be removed from active listings."}
            </p>
            <p className="mt-2 text-sm text-stone-500">
              To change trip details, cancel this post and create a new one.
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
        </DesktopDialog>
      )}
    </div>
  );
}

export function CloseRideButton({
  rideId,
  base,
}: {
  rideId: string;
  base?: "/rides" | "/m";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function setDialogOpen(value: boolean) {
    setOpen(value);
    if (!value) setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        if (base) formData.set("base", base);
        const result = await closeRide(rideId, formData);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        router.push(result.redirectTo);
        router.refresh();
      } catch (actionError) {
        setError(
          actionErrorMessage(
            actionError,
            "We couldn't close this ride. Please try again.",
          ),
        );
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
        <DesktopDialog
          open
          onDismiss={() => setDialogOpen(false)}
          dismissDisabled={pending}
          labelledBy="close-ride-title"
          closeLabel="Keep open"
        >
            <h2 id="close-ride-title" className="pr-8 text-lg font-bold text-stone-900">Close this ride?</h2>
            <p className="mt-1 text-sm text-stone-500">
              This marks the ride completed and removes it from active listings. Chat history stays
              available for lost items and follow-up.
            </p>
            <InlineActionError
              id="close-ride-error"
              error={error}
              className="mt-3 text-sm font-semibold text-red-600"
            />
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
                aria-describedby={error ? "close-ride-error" : undefined}
                className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? "Closing..." : "Close ride"}
              </button>
            </div>
        </DesktopDialog>
      )}
    </>
  );
}

export function DriverRideActions({
  rideId,
  confirmedRiderCount,
  base,
}: {
  rideId: string;
  confirmedRiderCount: number;
  base?: "/rides" | "/m";
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <CloseRideButton rideId={rideId} base={base} />
      <CancelRideButton rideId={rideId} confirmedRiderCount={confirmedRiderCount} base={base} />
    </div>
  );
}

export function LostItemMessageButton({
  rideId,
  otherUserId,
  base,
  label = "Lost an item? Message about this ride",
}: {
  rideId: string;
  otherUserId: string;
  base?: "/messages" | "/m/messages";
  label?: string;
}) {
  return (
    <form action={openConversation.bind(null, otherUserId)}>
      <input type="hidden" name="ride_id" value={rideId} />
      {base && <input type="hidden" name="base" value={base} />}
      <PendingActionButton
        actionKey={`lost-item-${rideId}-${otherUserId}`}
        pendingLabel="Opening chat..."
        className="flex w-full items-center justify-center rounded-full border border-stone-200 bg-white px-5 py-3 text-sm font-bold text-stone-700 transition hover:bg-stone-50 active:scale-[0.98]"
      >
        {label}
      </PendingActionButton>
    </form>
  );
}

export function CancelSeatButton({
  rideId,
  base,
}: {
  rideId: string;
  base?: "/rides" | "/m";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function setDialogOpen(value: boolean) {
    setOpen(value);
    if (!value) setError(null);
  }
  function submit() {
    if (!message.trim()) {
      setError("Please write a reason so the driver knows why you are cancelling.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await cancelSeat(rideId, message, base);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setOpen(false);
        setMessage("");
        setError(null);
        router.push(result.redirectTo);
        router.refresh();
      } catch (actionError) {
        setError(
          actionErrorMessage(
            actionError,
            "We couldn't cancel your seat. Please try again.",
          ),
        );
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="mt-3 w-full rounded-full border border-red-200 px-5 py-3 text-sm font-bold text-red-600 transition hover:bg-red-50 active:scale-[0.98]"
      >
        Cancel my seat
      </button>

      {open && (
        <DesktopDialog
          open
          onDismiss={() => setDialogOpen(false)}
          dismissDisabled={pending}
          labelledBy="cancel-seat-title"
          closeLabel="Keep seat"
        >
            <h2 id="cancel-seat-title" className="pr-8 text-lg font-bold text-stone-900">Cancel your seat?</h2>
            <p className="mt-1 text-sm text-stone-500">
              The driver will get a notification with your reason.
            </p>
            <p className="mt-2 text-sm text-stone-500">
              To change trip details, cancel this post and create a new one.
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
            <InlineActionError
              id="cancel-seat-reason-error"
              error={error}
              className="mt-2 text-sm font-semibold text-red-600"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
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
        </DesktopDialog>
      )}
    </>
  );
}
