"use client";

import { useState } from "react";
import { ArrowUpRight, ArrowDownLeft } from "lucide-react";

/**
 * The two big direction cards on Request a ride. Writes the chosen origin and
 * destination into hidden inputs the `postRequest` action reads.
 */
export function DirectionToggle({
  defaultDir = "toJCNC",
  outboundLabel = "San Jose",
}: {
  defaultDir?: "outbound" | "toJCNC";
  outboundLabel?: string;
}) {
  const [dir, setDir] = useState<"outbound" | "toJCNC">(defaultDir);

  // toJCNC: neighborhood → JCNC. outbound: JCNC → neighborhood.
  // The mobile postRequest action combines `direction` with the neighborhood
  // select to set origin/destination.
  return (
    <div>
      <input type="hidden" name="direction" value={dir} />

      <div className="grid grid-cols-2 gap-3">
        <Card
          active={dir === "outbound"}
          icon={<ArrowUpRight size={22} strokeWidth={2.2} />}
          label={`Out of ${outboundLabel}`}
          onClick={() => setDir("outbound")}
        />
        <Card
          active={dir === "toJCNC"}
          icon={<ArrowDownLeft size={22} strokeWidth={2.2} />}
          label="To JCNC"
          onClick={() => setDir("toJCNC")}
        />
      </div>
    </div>
  );
}

function Card({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-3 rounded-[14px] border-[1.5px] px-4 py-4 text-left transition active:scale-[0.99] ${
        active
          ? "border-brand-600 bg-tint text-brand-700"
          : "border-border bg-white text-muted"
      }`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-[11px] ${
          active ? "bg-white text-brand-600" : "bg-tint text-muted-warm"
        }`}
      >
        {icon}
      </span>
      <span className="text-[14px] font-bold">{label}</span>
    </button>
  );
}
