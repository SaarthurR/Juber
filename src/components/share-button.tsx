"use client";

import { useState } from "react";
import { Share, Check } from "lucide-react";

// Shares the current trip via the native share sheet, falling back to copying
// the URL to the clipboard.
export function ShareButton({ title }: { title?: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: title ?? "Trip", url });
        return;
      } catch {
        // user cancelled — fall through to copy
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={share}
      aria-label="Share trip"
      className="text-stone-700 transition hover:text-brand-600"
    >
      {copied ? <Check size={22} /> : <Share size={22} />}
    </button>
  );
}
