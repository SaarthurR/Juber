"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, CalendarDays, Search } from "lucide-react";
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

  function search() {
    const params = new URLSearchParams();
    if (from.trim()) params.set("from", from.trim());
    if (to.trim() && to.trim() !== "JCNC") params.set("to", to.trim());
    if (date) params.set("date", date);
    if (tripFilter) params.set("trip", tripFilter);
    const qs = params.toString();
    router.push(qs ? `/m?${qs}` : "/m");
  }

  return (
    <div className="rounded-[18px] border border-border bg-white p-4">
      <div className="flex items-center gap-3">
        <label className="min-w-0 flex-1">
          <span className="block text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-warm">
            From
          </span>
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="San Jose"
            className="w-full bg-transparent text-[14px] font-semibold text-ink outline-none placeholder:text-muted-warm placeholder:font-medium"
          />
        </label>
        <button
          type="button"
          aria-label="Swap from and to"
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-tint text-brand-600 transition active:scale-95"
        >
          <ArrowLeftRight size={16} strokeWidth={2.2} />
        </button>
        <label className="min-w-0 flex-1 text-right">
          <span className="block text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-warm">
            To
          </span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="JCNC, Milpitas"
            className="w-full bg-transparent text-right text-[14px] font-semibold text-ink outline-none placeholder:text-muted-warm placeholder:font-medium"
          />
        </label>
      </div>

      <div className="my-3 h-px bg-border-soft" />

      <div className="flex items-center gap-3">
        <CalendarDays size={16} className="shrink-0 text-muted-warm" />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-muted outline-none"
        />
        <button
          type="button"
          onClick={search}
          className="flex shrink-0 items-center gap-1.5 rounded-[11px] bg-brand-600 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-brand-700 active:scale-95"
        >
          <Search size={14} strokeWidth={2.5} />
          Search
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
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
      </div>
    </div>
  );
}

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
