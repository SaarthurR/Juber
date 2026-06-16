"use client";

import { useMemo, useState } from "react";
import { Segmented } from "@/components/mobile/segmented";
import { MProfileRideCard } from "@/components/mobile/mobile-cards";
import type { RideWithDriver } from "@/lib/types";

export function ProfileTabs({
  posted,
  joined,
  now,
}: {
  posted: RideWithDriver[];
  joined: RideWithDriver[];
  now: number;
}) {
  const [tab, setTab] = useState<"all" | "posted" | "joined">("all");

  const { upcoming, past } = useMemo(() => {
    const source =
      tab === "posted" ? posted : tab === "joined" ? joined : dedupe([...posted, ...joined]);
    const upcoming = source
      .filter((r) => new Date(r.depart_at).getTime() >= now)
      .sort((a, b) => new Date(a.depart_at).getTime() - new Date(b.depart_at).getTime());
    const past = source
      .filter((r) => new Date(r.depart_at).getTime() < now)
      .sort((a, b) => new Date(b.depart_at).getTime() - new Date(a.depart_at).getTime());
    return { upcoming, past };
  }, [tab, posted, joined, now]);

  return (
    <div className="space-y-5">
      <Segmented
        ariaLabel="Profile rides"
        value={tab}
        onChange={setTab}
        options={[
          { value: "all", label: "All" },
          { value: "posted", label: "Posted" },
          { value: "joined", label: "Joined" },
        ]}
      />

      {upcoming.length === 0 && past.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-[13px] text-muted-warm">
          No rides here yet.
        </p>
      )}

      {upcoming.length > 0 && (
        <Section label="Upcoming">
          {upcoming.map((r) => (
            <MProfileRideCard key={r.id} ride={r} />
          ))}
        </Section>
      )}

      {past.length > 0 && (
        <Section label="Past rides">
          {past.map((r) => (
            <MProfileRideCard key={r.id} ride={r} past />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted-warm">
        {label}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function dedupe(rides: RideWithDriver[]) {
  const seen = new Set<string>();
  const out: RideWithDriver[] = [];
  for (const r of rides) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}
