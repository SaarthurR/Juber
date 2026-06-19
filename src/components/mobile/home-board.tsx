"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, CalendarDays, Search, X } from "lucide-react";
import { CityCombobox } from "@/components/city-combobox";
import { Segmented } from "@/components/mobile/segmented";
import { MRideCard, MRequestCard } from "@/components/mobile/mobile-cards";
import type { RideWithDriver, RideRequestWithRider } from "@/lib/types";

export function HomeBoard({
  rides,
  requests,
  initialFrom,
  initialTo,
  initialDate,
  initialTripFilter,
}: {
  rides: RideWithDriver[];
  requests: RideRequestWithRider[];
  initialFrom: string;
  initialTo: string;
  initialDate: string;
  initialTripFilter: "one" | "round" | null;
}) {
  const [tab, setTab] = useState<"carpools" | "requests">("carpools");

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
        initialFrom={initialFrom}
        initialTo={initialTo}
        initialDate={initialDate}
        initialTripFilter={initialTripFilter}
      />

      {tab === "carpools" ? (
        <List
          label={`${rides.length} ride${rides.length === 1 ? "" : "s"} this week`}
          empty="No carpools match yet. Be the first to offer one."
        >
          {rides.map((ride) => (
            <MRideCard key={ride.id} ride={ride} />
          ))}
        </List>
      ) : (
        <List
          label={`${requests.length} open request${requests.length === 1 ? "" : "s"}`}
          empty="No one is asking for a ride right now."
        >
          {requests.map((request) => (
            <MRequestCard key={request.id} request={request} />
          ))}
        </List>
      )}
    </div>
  );
}

function List({
  label,
  empty,
  children,
}: {
  label: string;
  empty: string;
  children: React.ReactNode[];
}) {
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
        <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-[13px] text-muted-warm">
          {empty}
        </div>
      )}
    </div>
  );
}

function SearchCard({
  initialFrom,
  initialTo,
  initialDate,
  initialTripFilter,
}: {
  initialFrom: string;
  initialTo: string;
  initialDate: string;
  initialTripFilter: "one" | "round" | null;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo || "JCNC");
  const [date, setDate] = useState(initialDate);
  const [tripFilter, setTripFilter] = useState<"one" | "round" | null>(initialTripFilter);

  function navigate(nextDate = date) {
    const params = new URLSearchParams();
    if (from.trim()) params.set("from", from.trim());
    if (to.trim() && to.trim() !== "JCNC") params.set("to", to.trim());
    if (nextDate) params.set("date", nextDate);
    if (tripFilter) params.set("trip", tripFilter);
    const query = params.toString();
    router.push(query ? `/m?${query}` : "/m");
  }

  function clearDate() {
    setDate("");
    navigate("");
  }

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
            onValueChange={setFrom}
            placeholder="City or neighborhood"
            inputClassName={mobileFieldClassName}
          />
        </div>
        <button
          type="button"
          data-auth-allowed="true"
          aria-label="Swap from and to"
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
          className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-tint text-brand-600 transition active:scale-95"
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
            onValueChange={setTo}
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
            onChange={(event) => setDate(event.target.value)}
            className={`${mobileFieldClassName} pr-12 [color-scheme:light] [&::-webkit-calendar-picker-indicator]:opacity-0`}
          />
          {date && (
            <button
              type="button"
              data-auth-allowed="true"
              onClick={clearDate}
              aria-label="Clear date and show rides on all dates"
              className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white text-brand-500 transition active:bg-tint active:scale-95"
            >
              <X size={19} strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        data-auth-allowed="true"
        onClick={() => navigate()}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-[14px] font-bold text-white transition hover:bg-brand-700 active:scale-[0.98]"
      >
        <Search size={16} strokeWidth={2.5} />
        Search rides
      </button>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border-soft pt-4">
        <TripToggle
          label="One way only"
          active={tripFilter === "one"}
          onClick={() => setTripFilter((value) => (value === "one" ? null : "one"))}
        />
        <TripToggle
          label="Round trips only"
          active={tripFilter === "round"}
          onClick={() => setTripFilter((value) => (value === "round" ? null : "round"))}
        />
        {tripFilter && (
          <button
            type="button"
            data-auth-allowed="true"
            onClick={() => setTripFilter(null)}
            aria-label="Clear trip type"
            className="col-span-2 flex h-9 items-center justify-center gap-1.5 rounded-xl text-[12px] font-bold text-muted-warm transition active:bg-tint active:scale-[0.98]"
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
      className={`rounded-[13px] px-3 py-2.5 text-[12px] font-bold transition active:scale-[0.98] ${
        active ? "bg-brand-600 text-white" : "bg-tint text-brand-700"
      }`}
    >
      {label}
    </button>
  );
}
