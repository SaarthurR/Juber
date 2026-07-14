"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { MAvatar } from "@/components/mobile/m-avatar";
import { BottomSheet } from "@/components/mobile/bottom-sheet";
import { PassengerStatusButtons } from "@/components/ride-actions";
import {
  PendingActionGroup,
  usePendingActionOpen,
} from "@/components/pending-action-button";
import { DesktopDialog } from "@/components/ui/desktop-dialog";
import type { RiderEndpointLabel } from "@/lib/driver-route";
import { partyTotal } from "@/lib/booking";

type Variant = "desktop" | "mobile";

export function RiderDecisionDialog(props: {
  variant: Variant;
  passengerId: string;
  rideId: string;
  riderId: string;
  riderName: string;
  riderAvatar: string | null;
  guestCount: number;
  endpointLabel: RiderEndpointLabel | null;
  endpointAddress: string | null;
  embedUrl: string | null;
  missingHome: boolean;
  mapsConfigured: boolean;
}) {
  return (
    <PendingActionGroup>
      <RiderDecisionContent {...props} />
    </PendingActionGroup>
  );
}

function RiderDecisionContent({
  variant,
  passengerId,
  rideId,
  riderId,
  riderName,
  riderAvatar,
  guestCount,
  endpointLabel,
  endpointAddress,
  embedUrl,
  missingHome,
  mapsConfigured,
}: Parameters<typeof RiderDecisionDialog>[0]) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const pending = usePendingActionOpen();
  const profileHref = variant === "mobile" ? `/m/profile/${riderId}` : `/profile/${riderId}`;
  const setupHref = variant === "mobile" ? "/m/profile/edit" : "/profile";

  const content = (
    <>
      <h2 id={titleId} className={variant === "mobile" ? "pr-10 text-[18px] font-extrabold text-ink" : "pr-10 text-lg font-bold text-stone-900"}>
        New rider request
      </h2>
      <Link href={profileHref} className="mt-4 flex items-center gap-3">
        {variant === "mobile" ? (
          <MAvatar src={riderAvatar} name={riderName} seed={riderId} size={42} />
        ) : (
          <Avatar src={riderAvatar} name={riderName} size={42} />
        )}
        <div>
          <p className="font-bold text-ink">{riderName}</p>
          <p className="text-sm text-stone-500">Party of {partyTotal(guestCount)}</p>
        </div>
      </Link>
      <div className="mt-4 rounded-xl bg-stone-50 p-3 text-sm text-stone-700">
        <p className="font-semibold">{endpointLabel ?? "Ride location"}</p>
        <p className="mt-0.5 break-words text-stone-500">{endpointAddress ?? "Not provided"}</p>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title={`${endpointLabel ?? "Rider"} route for ${riderName}`}
            loading="lazy"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-[240px] min-h-[200px] w-full min-w-[200px] border-0"
          />
        ) : (
          <div className="flex min-h-[200px] flex-col items-center justify-center px-5 text-center">
            <p className="font-semibold text-stone-700">Route preview unavailable</p>
            {missingHome ? (
              <Link href={setupHref} className="mt-2 text-sm font-semibold text-brand-600 hover:text-brand-700">
                Add your home address in profile
              </Link>
            ) : !endpointAddress ? (
              <p className="mt-2 text-sm text-stone-500">The rider did not provide their {endpointLabel?.toLowerCase() ?? "ride"} address.</p>
            ) : !endpointLabel ? (
              <p className="mt-2 text-sm text-stone-500">Route previews are available for rides to or from JCNC.</p>
            ) : !mapsConfigured ? (
              <p className="mt-2 text-sm text-stone-500">Google Maps route previews are not configured.</p>
            ) : (
              <>
                <p className="mt-2 text-sm text-stone-500">Check your saved home and the rider&apos;s address.</p>
                <Link href={setupHref} className="mt-2 text-sm font-semibold text-brand-600 hover:text-brand-700">
                  Review your home address
                </Link>
              </>
            )}
          </div>
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-stone-500">
        Opening this preview shares your home and the rider&apos;s {endpointLabel?.toLowerCase() ?? "ride"} location with Google Maps.
      </p>
      <div className="mt-5">
        <PassengerStatusButtons passengerId={passengerId} rideId={rideId} />
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Review request from ${riderName}`}
        onClick={() => setOpen(true)}
        className={variant === "mobile" ? "shrink-0 rounded-full bg-brand-600 px-3 py-2 text-[12px] font-bold text-white" : "shrink-0 rounded-full bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700"}
      >
        New rider
      </button>
      {variant === "mobile" ? (
        <BottomSheet
          open={open}
          onClose={() => setOpen(false)}
          labelledBy={titleId}
          dismissDisabled={pending}
          closeLabel="Close rider request"
        >
          <div className="pb-2">{content}</div>
        </BottomSheet>
      ) : (
        <DesktopDialog
          open={open}
          onDismiss={() => setOpen(false)}
          labelledBy={titleId}
          dismissDisabled={pending}
          closeLabel="Close rider request"
          className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto"
        >
          {content}
        </DesktopDialog>
      )}
    </>
  );
}
