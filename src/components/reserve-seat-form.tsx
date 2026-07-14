"use client";

import { useActionState, useId, useState } from "react";
import { requestSeat } from "@/app/rides/actions";
import { InlineActionError } from "@/components/inline-action-error";
import { BottomSheet } from "@/components/mobile/bottom-sheet";
import { PendingActionButton } from "@/components/pending-action-button";
import { DesktopDialog } from "@/components/ui/desktop-dialog";
import { GooglePlaceInput } from "@/components/google-place-input";
import { maxGuestCount, partyTotal } from "@/lib/booking";

type Variant = "desktop" | "mobile";

export function ReserveSeatForm({
  rideId,
  seatsAvailable,
  savedHome,
  endpointLabel,
  label = "Reserve a seat",
  variant = "desktop",
}: {
  rideId: string;
  seatsAvailable: number;
  savedHome: string | null;
  endpointLabel: "Pickup" | "Drop-off" | null;
  label?: string;
  variant?: Variant;
}) {
  const [state, formAction, pending] = useActionState(
    requestSeat.bind(null, rideId),
    null,
  );
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const maxParty = partyTotal(maxGuestCount(seatsAvailable));
  const [pickupSource, setPickupSource] = useState<"home" | "custom" | null>(
    savedHome ? "home" : null,
  );
  const locationLabel = endpointLabel ?? "Ride location";

  if (state && "success" in state) {
    return (
      <BookingSummary
        guestCount={state.guestCount}
        pickupNote={state.pickupNote}
        endpointLabel={endpointLabel}
        variant={variant}
      />
    );
  }

  const radioCls =
    variant === "mobile"
      ? "flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3.5 py-3 text-[13px] font-semibold transition has-[:checked]:border-brand-600 has-[:checked]:bg-tint has-[:checked]:text-brand-700 text-muted"
      : "flex cursor-pointer items-center gap-2 rounded-xl border border-[#e2ddd5] px-4 py-2.5 text-sm font-semibold transition has-[:checked]:border-brand-600 has-[:checked]:bg-tint has-[:checked]:text-brand-700 text-stone-600 hover:bg-stone-50";

  const inputCls =
    variant === "mobile"
      ? "w-full rounded-xl border border-border bg-white px-3.5 py-3 text-[14px] text-ink outline-none placeholder:text-muted-warm focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
      : "w-full rounded-xl border border-[#e2ddd5] px-3.5 py-3 text-[15px] outline-none placeholder:text-[#a8a29e] focus:border-brand-600 focus:ring-2 focus:ring-brand-100";

  const labelCls =
    variant === "mobile"
      ? "mb-1.5 block text-[12px] font-semibold text-muted"
      : "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500";

  const sectionCls = variant === "mobile" ? "space-y-3" : "space-y-4";

  const buttonCls =
    variant === "mobile"
      ? "h-[54px] w-full rounded-[14px] bg-brand-600 text-[15px] font-bold text-white shadow-[0_14px_24px_-12px_rgba(166,83,41,0.7)] transition hover:bg-brand-700 active:scale-[0.98] disabled:opacity-60"
      : "w-full rounded-full bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed";

  const form = (
    <form action={formAction} className={sectionCls}>
      <input
        type="hidden"
        name="return_to"
        value={variant === "mobile" ? `/m/rides/${rideId}` : `/rides/${rideId}`}
      />
      <div>
        <span className={labelCls}>Party size</span>
        <PartyStepper maxParty={maxParty} />
        <p className={variant === "mobile" ? "mt-1.5 text-[12px] text-muted-warm" : "mt-1.5 text-xs text-stone-500"}>
          Includes you. {seatsAvailable} seat{seatsAvailable === 1 ? "" : "s"} left on this ride.
        </p>
      </div>

      <fieldset>
        <legend className={labelCls}>{locationLabel}</legend>
        <div className="flex flex-col gap-2">
          {savedHome ? (
            <label className={radioCls}>
              <input
                type="radio"
                name="pickup_source"
                value="home"
                required
                checked={pickupSource === "home"}
                onChange={() => setPickupSource("home")}
                className="sr-only"
              />
              Saved home
            </label>
          ) : null}
          <label className={radioCls}>
            <input
              type="radio"
              name="pickup_source"
              value="custom"
              required
              checked={pickupSource === "custom"}
              onChange={() => setPickupSource("custom")}
              className="sr-only"
            />
            Custom {endpointLabel?.toLowerCase() ?? "ride"} address
          </label>
        </div>
        {pickupSource === "custom" && (
          <GooglePlaceInput
            name="pickup_note"
            label={`${locationLabel} address`}
            required
            maxLength={500}
            placeholder={`Search for the ${endpointLabel?.toLowerCase() ?? "ride"} address`}
            className={`${inputCls} mt-2`}
          />
        )}
        {!savedHome && pickupSource !== "custom" && (
          <p className={variant === "mobile" ? "mt-1.5 text-[12px] text-muted-warm" : "mt-1.5 text-xs text-stone-500"}>
            Choose custom address, or add a saved home in your profile.
          </p>
        )}
      </fieldset>

      <PendingActionButton
        actionKey={`reserve-${rideId}`}
        pendingLabel="Submitting..."
        className={buttonCls}
      >
        Send seat request
      </PendingActionButton>
      <InlineActionError
        id={`reserve-${rideId}-error`}
        error={state && "error" in state ? state.error : undefined}
        className={
          variant === "mobile"
            ? "text-center text-[13px] font-bold text-red-600"
            : "text-center text-sm font-semibold text-red-600"
        }
      />
      {state && "setupPath" in state && state.setupPath && (
        <a
          href={state.setupPath}
          className={
            variant === "mobile"
              ? "inline-flex min-h-11 w-full items-center justify-center text-[13px] font-bold text-brand-600 underline-offset-2 hover:underline"
              : "inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold text-brand-600 underline-offset-2 hover:underline"
          }
        >
          Finish contact info in profile
        </a>
      )}
    </form>
  );

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={buttonCls}
      >
        {label}
      </button>
      {variant === "mobile" ? (
        <BottomSheet
          open={open}
          onClose={() => setOpen(false)}
          labelledBy={titleId}
          dismissDisabled={pending}
          closeLabel="Close seat request"
        >
          <h2 id={titleId} className="pr-10 text-[18px] font-extrabold text-ink">
            Request a seat
          </h2>
          <div className="pb-2 pt-4">{form}</div>
        </BottomSheet>
      ) : (
        <DesktopDialog
          open={open}
          onDismiss={() => setOpen(false)}
          labelledBy={titleId}
          dismissDisabled={pending}
          closeLabel="Close seat request"
        >
          <h2 id={titleId} className="pr-10 text-lg font-bold text-stone-900">
            Request a seat
          </h2>
          <div className="mt-4">{form}</div>
        </DesktopDialog>
      )}
    </>
  );
}

function PartyStepper({ maxParty }: { maxParty: number }) {
  const [partySize, setPartySize] = useState(1);
  const guestCount = Math.max(0, partySize - 1);

  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-white px-2 py-2">
      <input type="hidden" name="guest_count" value={guestCount} />
      <StepBtn
        label="Decrease party size"
        disabled={partySize <= 1}
        onClick={() => setPartySize((v) => Math.max(1, v - 1))}
      >
        −
      </StepBtn>
      <span className="text-[17px] font-extrabold text-ink tabular-nums">{partySize}</span>
      <StepBtn
        label="Increase party size"
        disabled={partySize >= maxParty}
        onClick={() => setPartySize((v) => Math.min(maxParty, v + 1))}
      >
        +
      </StepBtn>
    </div>
  );
}

function StepBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-11 items-center justify-center rounded-lg bg-tint text-brand-600 transition active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function BookingSummary({
  guestCount,
  pickupNote,
  endpointLabel,
  variant,
}: {
  guestCount: number;
  pickupNote: string | null;
  endpointLabel: "Pickup" | "Drop-off" | null;
  variant: Variant;
}) {
  const boxCls =
    variant === "mobile"
      ? "rounded-[14px] bg-tint px-4 py-3 text-[13px] font-semibold text-brand-700"
      : "rounded-lg bg-stone-100 px-6 py-4 text-center text-base font-bold text-stone-500";

  return (
    <div className={boxCls}>
      <p>Seat requested</p>
      <p className={variant === "mobile" ? "mt-1 font-medium text-muted" : "mt-1 text-sm font-medium text-stone-600"}>
        Party of {partyTotal(guestCount)}
        {pickupNote ? ` · ${endpointLabel ?? "Location"}: ${pickupNote}` : ""}
      </p>
    </div>
  );
}
