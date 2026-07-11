"use client";

import { useRef } from "react";
import {
  activateRidesTabFromKey,
  getRidesTabPresentation,
  type RidesTab,
} from "@/lib/rides-tab-state";

const TAB_LABELS: Record<RidesTab, string> = {
  carpools: "Carpools",
  requests: "Ride requests",
};

export function RidesTabList({
  activeTab,
  requestCount,
  onSelect,
}: {
  activeTab: RidesTab;
  requestCount: number;
  onSelect: (tab: RidesTab) => void;
}) {
  const carpoolsRef = useRef<HTMLButtonElement>(null);
  const requestsRef = useRef<HTMLButtonElement>(null);
  const refs = {
    carpools: carpoolsRef,
    requests: requestsRef,
  };

  return (
    <div
      className="inline-flex gap-1 rounded-xl bg-[#f1e6d6] p-1.5"
      role="tablist"
      aria-label="Ride listings"
    >
      {getRidesTabPresentation(activeTab).map((tab) => (
        <button
          key={tab.key}
          ref={refs[tab.key]}
          id={tab.tabId}
          type="button"
          role="tab"
          aria-selected={tab.selected}
          aria-controls={tab.panelId}
          tabIndex={tab.tabIndex}
          onClick={() => onSelect(tab.key)}
          onKeyDown={(event) => {
            const handled = activateRidesTabFromKey(tab.key, event.key, {
              activate: onSelect,
              focus: (target) => refs[target].current?.focus(),
            });
            if (handled) event.preventDefault();
          }}
          className={`flex items-center justify-center gap-2 rounded-lg px-[18px] py-2 text-sm font-bold transition ${
            tab.selected
              ? "bg-brand-600 text-white"
              : "text-[#a8927a] hover:text-brand-700"
          }`}
        >
          {TAB_LABELS[tab.key]}
          {tab.key === "requests" && requestCount > 0 && (
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                tab.selected ? "bg-white/25 text-white" : "bg-brand-600 text-white"
              }`}
            >
              {requestCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function RidesTabPanels({
  activeTab,
  carpools,
  requests,
}: {
  activeTab: RidesTab;
  carpools: React.ReactNode;
  requests: React.ReactNode;
}) {
  const presentations = getRidesTabPresentation(activeTab);
  const content: Record<RidesTab, React.ReactNode> = { carpools, requests };

  return (
    <>
      {presentations.map((tab) => (
        <div
          key={tab.key}
          id={tab.panelId}
          role="tabpanel"
          aria-labelledby={tab.tabId}
          hidden={tab.hidden}
          className="mt-5 grid gap-4"
        >
          {content[tab.key]}
        </div>
      ))}
    </>
  );
}
