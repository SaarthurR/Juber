"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { ModerationWarning } from "@/lib/moderation";

export function ModerationNoticeBanner({
  warnings,
  variant = "desktop",
}: {
  warnings: ModerationWarning[];
  variant?: "desktop" | "mobile";
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const visible = warnings.filter((warning) => !dismissed.has(warning.id));
  if (!visible.length) return null;

  const mobile = variant === "mobile";

  return (
    <div
      className={
        mobile
          ? "border-b border-amber-200 bg-amber-50 px-4 py-3"
          : "border-b border-amber-200 bg-amber-50"
      }
      role="region"
      aria-label="Community guidelines notice"
    >
      <div className={mobile ? "space-y-3" : "mx-auto max-w-5xl space-y-3 px-4 py-3 sm:px-6"}>
        {visible.map((warning) => (
          <div
            key={warning.id}
            className="flex items-start gap-3 rounded-xl border border-amber-200 bg-white/80 px-3.5 py-3"
          >
            <AlertTriangle
              size={20}
              className="mt-0.5 shrink-0 text-amber-700"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">Community warning</p>
              <p className="mt-1 text-sm leading-relaxed text-stone-600">
                {warning.note?.trim() || "An admin sent you a warning about recent activity."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDismissed((current) => new Set(current).add(warning.id))}
              className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl px-3 text-sm font-bold text-stone-600 transition hover:bg-stone-100"
            >
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
