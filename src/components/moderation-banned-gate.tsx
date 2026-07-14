"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BannedStatusView } from "@/components/banned-status-page";
import { useModerationState } from "@/components/moderation-state-provider";
import { bannedPagePath } from "@/lib/moderation";

export function ModerationBannedGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { snapshot, error, reconcile, acknowledge, pendingOutcomeId } = useModerationState();
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = pathname?.startsWith("/m") ?? false;
  const bannedPath = bannedPagePath(isMobile);
  const authPath = pathname?.startsWith("/auth/") ?? false;
  const onBannedPath = pathname === "/banned" || pathname === "/m/banned";
  const unacknowledgedOutcome = snapshot.outcomes.find(
    (outcome) => outcome.acknowledgedAt === null
      && (outcome.type === "appeal_denied" || outcome.type === "ban"),
  ) ?? null;

  useEffect(() => {
    if (authPath) return;
    if (snapshot.banned && pathname !== bannedPath) {
      router.replace(bannedPath);
      return;
    }
    if (!snapshot.banned && onBannedPath) {
      router.replace(isMobile ? "/m" : "/");
      router.refresh();
    }
  }, [authPath, bannedPath, isMobile, onBannedPath, pathname, router, snapshot.banned]);

  if (authPath) return children;

  if (snapshot.banned && !snapshot.ban) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-cream px-4 py-8">
        <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 text-center">
          <h1 className="text-2xl font-extrabold text-ink">Account suspended</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            We could not load the suspension details. Your account remains restricted.
          </p>
          <button
            type="button"
            onClick={() => void reconcile()}
            className="mt-5 flex h-11 w-full items-center justify-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-bold text-ink transition hover:bg-stone-50 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          >
            Retry account status
          </button>
        </div>
      </main>
    );
  }

  if (snapshot.banned && snapshot.ban) {
    return (
      <BannedStatusView
        ban={snapshot.ban}
        hasPendingAppeal={snapshot.hasPendingAppeal}
        appeal={snapshot.appeal}
        variant={isMobile ? "mobile" : "desktop"}
        focusHeading
        refreshError={error}
        onRetry={() => void reconcile()}
        unacknowledgedOutcome={unacknowledgedOutcome}
        outcomePending={pendingOutcomeId === unacknowledgedOutcome?.id}
        onAcknowledgeOutcome={unacknowledgedOutcome
          ? () => void acknowledge(unacknowledgedOutcome.id)
          : undefined}
      />
    );
  }

  if (onBannedPath) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-cream px-6 text-center">
        <div role="status">
          <h1 className="text-xl font-extrabold text-ink">Account access restored</h1>
          <p className="mt-2 text-sm text-stone-600">Taking you back to Juber...</p>
        </div>
      </main>
    );
  }

  return children;
}
