"use client";

import { useEffect, useReducer } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth-button";
import { RideCard, RequestCard } from "@/components/ride-card";
import { RideFilters } from "@/components/ride-filters";
import { RidesTabList, RidesTabPanels } from "@/components/rides-tabs";
import {
  commitRidesTabSelection,
  getRidesTabFromSearch,
  ridesTabReducer,
  syncRidesTabFromHistory,
  type RidesTab,
} from "@/lib/rides-tab-state";
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
  const paramsString = params.toString();
  const pathname = usePathname();
  const [tabState, dispatchTab] = useReducer(ridesTabReducer, {
    visibleTab: getRidesTabFromSearch(paramsString),
  });
  const hasFilters = Boolean(
    params.get("from") || params.get("to") || params.get("date") || params.get("trip"),
  );

  useEffect(() => {
    syncRidesTabFromHistory(paramsString, (tab) => {
      dispatchTab({ type: "select", tab });
    });
  }, [paramsString]);

  useEffect(() => {
    function syncFromHistory() {
      syncRidesTabFromHistory(window.location.search, (tab) => {
        dispatchTab({ type: "select", tab });
      });
    }

    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  function setTab(tab: RidesTab) {
    commitRidesTabSelection({
      currentTab: tabState.visibleTab,
      nextTab: tab,
      pathname: pathname || "/rides",
      search: window.location.search,
      commit: (nextTab) => dispatchTab({ type: "select", tab: nextTab }),
      pushState: (state, href) => window.history.pushState(state, "", href),
    });
  }

  const carpoolsPanel = rides.length ? (
    rides.map((ride) => <RideCard key={ride.id} ride={ride} />)
  ) : (
    <Empty kind="rides" signedIn={signedIn} hasFilters={hasFilters} />
  );
  const requestsPanel = requests.length ? (
    requests.map((request) => <RequestCard key={request.id} request={request} />)
  ) : (
    <Empty kind="requests" signedIn={signedIn} hasFilters={hasFilters} />
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <RidesTabList
          activeTab={tabState.visibleTab}
          requestCount={requestCount}
          onSelect={setTab}
        />

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

      <RidesTabPanels
        activeTab={tabState.visibleTab}
        carpools={carpoolsPanel}
        requests={requestsPanel}
      />
    </>
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
