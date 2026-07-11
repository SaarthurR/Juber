"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export function BackButtonView({
  onBack,
  allowAnonymousBrowse = false,
}: {
  onBack: () => void;
  allowAnonymousBrowse?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label="Back"
      data-auth-allowed={allowAnonymousBrowse ? "true" : undefined}
      onClick={onBack}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tint text-brand-700 transition active:scale-95"
    >
      <ChevronLeft size={20} strokeWidth={2.5} />
    </button>
  );
}

export function BackButton({
  fallback,
  allowAnonymousBrowse = false,
}: {
  fallback?: string;
  allowAnonymousBrowse?: boolean;
}) {
  const router = useRouter();
  return (
    <BackButtonView
      allowAnonymousBrowse={allowAnonymousBrowse}
      onBack={() => {
        if (window.history.length > 1) router.back();
        else if (fallback) router.push(fallback);
      }}
    />
  );
}
