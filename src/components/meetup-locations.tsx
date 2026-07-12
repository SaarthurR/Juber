import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { googleMapsUrl } from "@/lib/booking";
import type { MeetupRow } from "@/lib/meetup";

type Variant = "desktop" | "mobile";

export function MeetupLocations({
  pickupLabel,
  dropoffLabel,
  pickupMapsUrl,
  dropoffMapsUrl,
  variant = "desktop",
}: {
  pickupLabel: string;
  dropoffLabel: string;
  pickupMapsUrl?: string | null;
  dropoffMapsUrl?: string | null;
  variant?: Variant;
}) {
  const dark = variant === "desktop";

  return (
    <div className={dark ? "mt-4 flex gap-5" : "flex gap-4"}>
      <div className="flex flex-col items-center py-1">
        <span
          className={
            dark
              ? "h-3 w-3 rounded-full border-2 border-white bg-transparent"
              : "h-3 w-3 rounded-full border-2 border-white"
          }
        />
        <span className={dark ? "my-1 w-px flex-1 bg-white/30" : "my-1 w-0.5 flex-1 bg-[#4B4540]"} />
        <span className={dark ? "h-3 w-3 rounded-full bg-white" : "h-3 w-3 rounded-full bg-white"} />
      </div>
      <div className={dark ? "flex flex-1 flex-col gap-3.5 text-[15px]" : "flex flex-1 flex-col gap-4"}>
        <MeetupLine
          title="Pick up"
          darkTitle="Pick Up:"
          label={pickupLabel}
          mapsUrl={pickupMapsUrl}
          dark={dark}
        />
        <MeetupLine
          title="Drop off"
          darkTitle="Drop off:"
          label={dropoffLabel}
          mapsUrl={dropoffMapsUrl}
          dark={dark}
        />
      </div>
    </div>
  );
}

function MeetupLine({
  title,
  darkTitle,
  label,
  mapsUrl,
  dark,
}: {
  title: string;
  darkTitle: string;
  label: string;
  mapsUrl?: string | null;
  dark: boolean;
}) {
  return (
    <div>
      {dark ? (
        <p>
          <span className="font-bold">{darkTitle}</span>{" "}
          <span className="text-white/80">{label}</span>
        </p>
      ) : (
        <>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/45">
            {title}
          </p>
          <p className="text-[15px] font-bold">{label}</p>
        </>
      )}
      {mapsUrl && (
        <Link
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={
            dark
              ? "mt-1 inline-flex items-center gap-1 text-sm font-semibold text-gold-light hover:text-white"
              : "mt-1 inline-flex items-center gap-1 text-[12px] font-bold text-gold-light"
          }
        >
          Open in Google Maps
          <ExternalLink size={14} />
        </Link>
      )}
    </div>
  );
}

export function resolveMeetupLabels({
  coarsePickup,
  coarseDropoff,
  meetupRows,
  userId,
  isDriver,
}: {
  coarsePickup: string;
  coarseDropoff: string;
  meetupRows: MeetupRow[];
  userId?: string | null;
  isDriver: boolean;
}) {
  const driverRow = meetupRows[0];
  const selfRow =
    userId && !isDriver
      ? meetupRows.find((row) => row.passenger_id === userId)
      : null;

  const exactPickup = driverRow?.pickup_location;
  const exactDropoff = driverRow?.dropoff_location;
  const entitled = Boolean(isDriver || selfRow);

  const pickupLabel = entitled && exactPickup ? exactPickup : coarsePickup;
  const dropoffLabel = entitled && exactDropoff ? exactDropoff : coarseDropoff;

  return {
    pickupLabel,
    dropoffLabel,
    pickupMapsUrl:
      entitled && exactPickup ? googleMapsUrl(exactPickup) : null,
    dropoffMapsUrl:
      entitled && exactDropoff ? googleMapsUrl(exactDropoff) : null,
    selfPickupNote: selfRow?.pickup_note ?? null,
    selfPickupMapsUrl: selfRow?.pickup_note
      ? googleMapsUrl(selfRow.pickup_note)
      : null,
  };
}

export function PassengerPickupNote({
  note,
  mapsUrl,
  variant = "desktop",
}: {
  note: string;
  mapsUrl: string;
  variant?: Variant;
}) {
  if (variant === "mobile") {
    return (
      <p className="text-[12px] text-muted-warm">
        Pickup: {note}{" "}
        <Link href={mapsUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-brand-600">
          Maps
        </Link>
      </p>
    );
  }

  return (
    <p className="text-xs text-stone-500">
      Pickup: {note}{" "}
      <Link
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-brand-600 hover:text-brand-700"
      >
        Open in Google Maps
      </Link>
    </p>
  );
}
