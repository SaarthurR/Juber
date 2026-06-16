"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export function BackButton({ fallback }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else if (fallback) router.push(fallback);
      }}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tint text-brand-700 transition active:scale-95"
    >
      <ChevronLeft size={20} strokeWidth={2.5} />
    </button>
  );
}
