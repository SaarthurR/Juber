"use client";

import { useState } from "react";
import { Segmented } from "@/components/mobile/segmented";

// Trunk-space preference is a viewing aid on the trip screen; it isn't persisted
// to the ride, so it lives in local state per the design spec.
export function TrunkControl() {
  const [trunk, setTrunk] = useState<"compact" | "standard" | "spacious">("standard");
  return (
    <Segmented
      ariaLabel="Trunk space"
      value={trunk}
      onChange={setTrunk}
      options={[
        { value: "compact", label: "Compact" },
        { value: "standard", label: "Standard" },
        { value: "spacious", label: "Spacious" },
      ]}
    />
  );
}
