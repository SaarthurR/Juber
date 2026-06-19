"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth-button";
import { RideCard, RequestCard } from "@/components/ride-card";
import { RideFilters } from "@/components/ride-filters";
import type { RideRequestWithRider, RideWithDriver } from "@/lib/types";

export function RidesView({
  rides,
  requests,
  requestCount,
  signedIn,
}: {
  rides: RideWithDriver[];
  requests: RideRequestWithRider[];
  requestCount: number;
  signedIn: boolean;
}) {
  const params = useSearchParams();
  const showRequests = params.get("tab") === "requests";
  const hasFilters = Boolean(
    params.get("from") || params.get("to") || params.get("date") || params.get("trip"),
  );

  function setTab(tab: "carpools" | "requests") {
    const next = new URLSearchParams(params.toString());
    if (tab === "requests") next.set("tab", "requests");
    else next.delete("tab");

    const query = next.toString();
    window.history.pushState(null, "", query ? `/rides?${query}` : "/rides");
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div
          className="inline-flex gap-1 rounded-xl bg-[#f1e6d6] p-1.5"
          role="tablist"
          aria-label="Ride listings"
        >
          <TabButton
            active={!showRequests}
            label="Carpools"
            onClick={() => setTab("carpools")}
          />
          <TabButton
            active={showRequests}
            label="Ride requests"
            badge={requestCount}
            onClick={() => setTab("requests")}
          />
        </div>

        {signedIn ? (
          <Link
            href="/rides/new"
            className="shrink-0 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_6px_16px_-6px_rgba(92,59,46,0.6)] transition hover:bg-brand-700 active:scale-95"
          >
            Post a ride
          </Link>
        ) : (
          <GoogleSignInButton />
        )}
      </div>

      <RideFilters />

      {signedIn && (
        <div className="mb-5 mt-3 flex justify-end">
          <Link
            href="/requests/new"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-tint text-brand-600">
              <Plus size={12} strokeWidth={2.5} />
            </span>
            Request a ride
          </Link>
        </div>
      )}

      <div className="mt-5 grid gap-4">
        {showRequests
          ? requests.length
            ? requests.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))
            : <Empty kind="requests" signedIn={signedIn} hasFilters={hasFilters} />
          : rides.length
            ? rides.map((ride) => <RideCard key={ride.id} ride={ride} />)
            : <Empty kind="rides" signedIn={signedIn} hasFilters={hasFilters} />}
      </div>
    </>
  );
}

function TabButton({
  active,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-lg px-[18px] py-2 text-sm font-bold transition ${
        active
          ? "bg-brand-600 text-white"
          : "text-[#a8927a] hover:text-brand-700"
      }`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
            active ? "bg-white/25 text-white" : "bg-brand-600 text-white"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function Empty({
  kind,
  signedIn,
  hasFilters,
}: {
  kind: "rides" | "requests";
  signedIn: boolean;
  hasFilters: boolean;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#e0d3bf] px-8 py-14 text-center">
      <p className="font-semibold text-stone-700">
        No {kind} match your search.
      </p>
      <p className="mt-1 text-sm text-stone-400">
        {hasFilters
          ? "Try clearing your filters, or check back later."
          : kind === "rides"
            ? "Be the first to offer a carpool."
            : "No one is asking for a ride right now."}
      </p>
      {signedIn && (
        <Link
          href={kind === "rides" ? "/rides/new" : "/requests/new"}
          className="mt-5 inline-flex rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 active:scale-95"
        >
          {kind === "rides" ? "Post a ride" : "Request a ride"}
        </Link>
      )}
    </div>
  );
}
