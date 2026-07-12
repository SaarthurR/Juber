"use client";

import { useDeferredValue, useState } from "react";
import { ArrowLeftRight, CalendarDays, Car, MessagesSquare, X } from "lucide-react";
import { CityCombobox } from "@/components/city-combobox";
import { Segmented } from "@/components/mobile/segmented";
import { MRideCard, MRequestCard } from "@/components/mobile/mobile-cards";
import { GoogleSignInButton } from "@/components/auth-button";
import type { RideWithDriver, RideRequestWithRider } from "@/lib/types";

export function HomeBoard({
  rides,
  requests,
  signedIn,
  initialFrom,
  initialTo,
  initialDate,
  initialTripFilter,
}: {
  rides: RideWithDriver[];
  requests: RideRequestWithRider[];
  signedIn: boolean;
  initialFrom: string;
  initialTo: string;
  initialDate: string;
  initialTripFilter: "one" | "round" | null;
}) {
  const [tab, setTab] = useState<"carpools" | "requests">("carpools");
  const [filters, setFilters] = useState({
    from: initialFrom,
    to: initialTo || "JCNC",
    date: initialDate,
    trip: initialTripFilter,
  });
  const deferredFilters = useDeferredValue(filters);
  const fromQuery = deferredFilters.from.trim().toLocaleLowerCase();
  const toQuery = deferredFilters.to.trim().toLocaleLowerCase();
  const filteredRides = rides.filter((ride) => {
    if (fromQuery && !ride.origin_label.toLocaleLowerCase().includes(fromQuery)) return false;
    if (toQuery && toQuery !== "jcnc" && !ride.destination_label.toLocaleLowerCase().includes(toQuery)) {
      return false;
    }
    if (deferredFilters.date && ride.depart_at.slice(0, 10) !== deferredFilters.date) return false;
    if (deferredFilters.trip && ride.round_trip !== (deferredFilters.trip === "round")) return false;
    return true;
  });
  const filteredRequests = requests.filter((request) => {
    if (fromQuery && !request.origin_label.toLocaleLowerCase().includes(fromQuery)) return false;
    if (toQuery && toQuery !== "jcnc" && !request.destination_label.toLocaleLowerCase().includes(toQuery)) {
      return false;
    }
    if (!deferredFilters.date) return true;
    const earliest = request.earliest_date ?? request.depart_at.slice(0, 10);
    const latest = request.latest_date ?? request.depart_at.slice(0, 10);
    return earliest <= deferredFilters.date && latest >= deferredFilters.date;
  });

  function updateFilters(next: Partial<typeof filters>) {
    setFilters((current) => ({ ...current, ...next }));
  }

  return (
    <div className="space-y-4">
      <Segmented
        ariaLabel="Ride listings"
        value={tab}
        onChange={setTab}
        options={[
          { value: "carpools", label: "Carpools" },
          { value: "requests", label: "Ride requests" },
        ]}
      />

      <SearchCard
        from={filters.from}
        to={filters.to}
        date={filters.date}
        tripFilter={filters.trip}
        onChange={updateFilters}
      />

      <div hidden={tab !== "carpools"}>
        <List
          kind="rides"
          label={`${filteredRides.length} matching ride${filteredRides.length === 1 ? "" : "s"}`}
        >
          {filteredRides.map((ride) => (
            <MRideCard key={ride.id} ride={ride} />
          ))}
        </List>
      </div>
      <div hidden={tab !== "requests"}>
        {signedIn ? (
          <List
            kind="requests"
            label={`${filteredRequests.length} matching request${filteredRequests.length === 1 ? "" : "s"}`}
          >
            {filteredRequests.map((request) => (
              <MRequestCard key={request.id} request={request} />
            ))}
          </List>
        ) : (
          <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
            <MessagesSquare size={40} className="mx-auto text-brand-bright" strokeWidth={1.8} />
            <h2 className="mt-5 text-[17px] font-extrabold text-ink">Sign in to view ride requests</h2>
            <p className="mt-2 text-[13px] text-muted-warm">Ride requests are available to signed-in community members.</p>
            <GoogleSignInButton className="mt-5" />
          </div>
        )}
      </div>
    </div>
  );
}

function List({
  kind,
  label,
  children,
}: {
  kind: "rides" | "requests";
  label: string;
  children: React.ReactNode[];
}) {
  const Icon = kind === "rides" ? Car : MessagesSquare;
  const title = kind === "rides" ? "No carpools yet" : "No requests yet";
  const description =
    kind === "rides"
      ? "Be the first to offer a ride to JCNC."
      : "When someone needs a ride, it will show up here.";

  return (
    <div>
      <div className="mb-3 mt-1 flex items-center justify-between">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted-warm">
          {label}
        </p>
      </div>
      {children.length ? (
        <div className="space-y-3">{children}</div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <div className="mx-auto flex h-[88px] w-[88px] items-center justify-center rounded-full bg-tint">
            <Icon size={40} className="text-brand-bright" strokeWidth={1.8} />
          </div>
          <h2 className="mt-5 text-[17px] font-extrabold text-ink">{title}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-warm">{description}</p>
        </div>
      )}
    </div>
  );
}

function SearchCard({
  from,
  to,
  date,
  tripFilter,
  onChange,
}: {
  from: string;
  to: string;
  date: string;
  tripFilter: "one" | "round" | null;
  onChange: (
    next: Partial<{
      from: string;
      to: string;
      date: string;
      trip: "one" | "round" | null;
    }>,
  ) => void;
}) {
  return (
    <div className="rounded-[18px] border border-border bg-white p-4">
      <div className="space-y-2">
        <div>
          <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-warm">
            From
          </span>
          <CityCombobox
            ariaLabel="From city or neighborhood"
            value={from}
            onValueChange={(value) => onChange({ from: value })}
            placeholder="City or neighborhood"
            inputClassName={mobileFieldClassName}
          />
        </div>
        <button
          type="button"
          data-auth-allowed="true"
          aria-label="Swap from and to"
          onClick={() => {
            onChange({ from: to, to: from });
          }}
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-tint text-brand-600 transition active:scale-95"
        >
          <ArrowLeftRight size={16} strokeWidth={2.2} />
        </button>
        <div>
          <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-warm">
            To
          </span>
          <CityCombobox
            ariaLabel="To city or neighborhood"
            value={to}
            onValueChange={(value) => onChange({ to: value })}
            placeholder="City or neighborhood"
            inputClassName={mobileFieldClassName}
          />
        </div>
      </div>

      <div className="my-4 h-px bg-border-soft" />

      <div>
        <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-warm">
          Date
        </span>
        <div className="relative">
          <CalendarDays
            size={18}
            className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-warm ${date ? "opacity-0" : ""}`}
          />
          <input
            type="date"
            aria-label="Ride date"
            value={date}
            onChange={(event) => onChange({ date: event.target.value })}
            className={`${mobileFieldClassName} pr-12 [color-scheme:light] [&::-webkit-calendar-picker-indicator]:opacity-0`}
          />
          {date && (
            <button
              type="button"
              data-auth-allowed="true"
              onClick={() => onChange({ date: "" })}
              aria-label="Clear date and show rides on all dates"
              className="absolute right-2.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-brand-500 transition active:bg-tint active:scale-95"
            >
              <X size={19} strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border-soft pt-4">
        <TripToggle
          label="One way only"
          active={tripFilter === "one"}
          onClick={() => onChange({ trip: tripFilter === "one" ? null : "one" })}
        />
        <TripToggle
          label="Round trips only"
          active={tripFilter === "round"}
          onClick={() => onChange({ trip: tripFilter === "round" ? null : "round" })}
        />
        {tripFilter && (
          <button
            type="button"
            data-auth-allowed="true"
            onClick={() => onChange({ trip: null })}
            aria-label="Clear trip type"
            className="col-span-2 flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-[12px] font-bold text-muted-warm transition active:bg-tint active:scale-[0.98]"
          >
            <X size={15} strokeWidth={2.4} />
            Clear trip type
          </button>
        )}
      </div>

    </div>
  );
}

const mobileFieldClassName =
  "h-[52px] w-full rounded-xl border border-[#dfcdb5] bg-white pl-4 pr-11 text-[15px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-muted-warm focus:border-brand-600 focus:ring-2 focus:ring-brand-100";

function TripToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-auth-allowed="true"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 rounded-[13px] px-3 py-2.5 text-[12px] font-bold active:scale-[0.98] ${
        active ? "bg-brand-600 text-white" : "bg-tint text-brand-700"
      }`}
    >
      {label}
    </button>
  );
}
