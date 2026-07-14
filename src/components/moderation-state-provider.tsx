"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { acknowledgeModerationOutcomeAction } from "@/app/moderation/outcome-actions";
import {
  ModerationRefreshError,
  ModerationWarningArrival,
  ModerationWarningOutcome,
} from "@/components/moderation-warning-outcome";
import {
  EMPTY_MODERATION_SNAPSHOT,
  parseModerationNotices,
  type ModerationSnapshot,
} from "@/lib/moderation";
import {
  subscribeToModerationOutcomes,
  unacknowledgedModerationWarnings,
} from "@/lib/moderation-outcomes";
import { createClient } from "@/lib/supabase/client";
import { useDemoRuntime } from "@/components/demo-runtime-provider";

type ModerationStateContextValue = {
  snapshot: ModerationSnapshot;
  error: string | null;
  reconcile: () => Promise<ModerationSnapshot | null>;
  acknowledge: (outcomeId: string) => Promise<boolean>;
  pendingOutcomeId: string | null;
};

const ModerationStateContext = createContext<ModerationStateContextValue | null>(null);
const BROADCAST_CHANNEL = "juber:moderation-outcomes";

export function ModerationStateProvider({
  userId,
  initial,
  children,
}: {
  userId: string | null;
  initial: ModerationSnapshot | null;
  children: React.ReactNode;
}) {
  const initialSnapshot = initial ?? EMPTY_MODERATION_SNAPSHOT;
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const snapshotRef = useRef(initialSnapshot);
  const operationRef = useRef(0);
  const [reviewOutcomeId, setReviewOutcomeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    initialSnapshot.loadError ? "We could not refresh your account status." : null,
  );
  const [pendingOutcomeId, setPendingOutcomeId] = useState<string | null>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { enabled: demoEnabled } = useDemoRuntime();

  const reconcileFrom = useCallback(async (): Promise<ModerationSnapshot | null> => {
    if (!userId) return null;
    if (demoEnabled) {
      router.refresh();
      return snapshotRef.current;
    }
    const operation = ++operationRef.current;
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("get_moderation_notices");
    if (operation !== operationRef.current) return null;
    if (rpcError) {
      setError("We could not refresh your account status.");
      return null;
    }

    const next = parseModerationNotices(data);
    const nextWarnings = unacknowledgedModerationWarnings(next);
    snapshotRef.current = next;
    setSnapshot(next);
    setError(null);
    setReviewOutcomeId((current) => {
      if (current && nextWarnings.some((warning) => warning.outcomeId === current)) {
        return current;
      }
      return null;
    });
    return next;
  }, [demoEnabled, router, userId]);

  const reconcile = useCallback(
    () => reconcileFrom(),
    [reconcileFrom],
  );

  useEffect(() => {
    if (!userId) return undefined;
    if (demoEnabled) {
      return undefined;
    }
    const supabase = createClient();
    const unsubscribe = subscribeToModerationOutcomes(
      supabase,
      userId,
      () => void reconcileFrom(),
      () => void reconcileFrom(),
    );
    return unsubscribe;
  }, [demoEnabled, reconcileFrom, router, userId]);

  useEffect(() => {
    if (demoEnabled) return;
    if (userId) queueMicrotask(() => void reconcileFrom());
  }, [demoEnabled, initial, pathname, reconcileFrom, userId]);

  useEffect(() => {
    if (!userId) return undefined;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void reconcileFrom();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reconcileFrom, userId]);

  useEffect(() => {
    if (!userId || typeof BroadcastChannel === "undefined") return undefined;
    const channel = new BroadcastChannel(BROADCAST_CHANNEL);
    broadcastRef.current = channel;
    channel.onmessage = (event) => {
      if (event.data === "reconcile") void reconcileFrom();
    };
    return () => {
      broadcastRef.current = null;
      channel.close();
    };
  }, [reconcileFrom, userId]);

  const acknowledge = useCallback(async (outcomeId: string) => {
    setPendingOutcomeId(outcomeId);
    setError(null);
    const result = await acknowledgeModerationOutcomeAction(outcomeId);
    if (!result.ok) {
      setError(result.error);
      setPendingOutcomeId(null);
      return false;
    }
    if (demoEnabled) {
      setPendingOutcomeId(null);
      router.refresh();
      return true;
    }
    broadcastRef.current?.postMessage("reconcile");
    const refreshed = await reconcileFrom();
    if (refreshed?.outcomes.some(
      (outcome) => outcome.id === outcomeId && outcome.acknowledgedAt === null,
    )) {
      setError("Your acknowledgement was saved, but the page did not refresh. Please retry.");
      setPendingOutcomeId(null);
      return false;
    }
    setPendingOutcomeId(null);
    return refreshed !== null;
  }, [demoEnabled, reconcileFrom, router]);

  const warnings = snapshot.banned ? [] : unacknowledgedModerationWarnings(snapshot);
  const activeWarning = warnings.find(
    (warning) => warning.outcomeId === reviewOutcomeId,
  ) ?? null;
  const recoveryOutcome = !snapshot.banned
    ? snapshot.outcomes.find(
        (outcome) => outcome.acknowledgedAt === null
          && (outcome.type === "unban" || outcome.type === "appeal_granted"),
      ) ?? null
    : null;
  const hasPendingWarning = !activeWarning && warnings.length > 0;
  const blockingOutcome = Boolean(snapshot.loadError || activeWarning || recoveryOutcome);

  const value = useMemo(
    () => ({ snapshot, error, reconcile, acknowledge, pendingOutcomeId }),
    [acknowledge, error, pendingOutcomeId, reconcile, snapshot],
  );

  return (
    <ModerationStateContext.Provider value={value}>
      <div
        className="contents"
        inert={blockingOutcome ? true : undefined}
        aria-hidden={blockingOutcome ? true : undefined}
      >
        {children}
      </div>
      {snapshot.loadError ? (
        <ModerationRefreshError fullScreen onRetry={() => void reconcile()} />
      ) : activeWarning ? (
        <ModerationWarningOutcome
          warning={activeWarning}
          pending={pendingOutcomeId === activeWarning.outcomeId}
          error={error}
          focusHeading
          onAcknowledge={() => void acknowledge(activeWarning.outcomeId)}
        />
      ) : recoveryOutcome ? (
        <AccessRestoredOutcome
          memberReason={recoveryOutcome.type === "unban" ? recoveryOutcome.memberReason : null}
          pending={pendingOutcomeId === recoveryOutcome.id}
          error={error}
          onContinue={async () => {
            if (!await acknowledge(recoveryOutcome.id)) return;
            if (pathname === "/banned" || pathname === "/m/banned") {
              router.replace(pathname.startsWith("/m") ? "/m" : "/");
              return;
            }
            router.refresh();
          }}
        />
      ) : hasPendingWarning ? (
        <ModerationWarningArrival
          onReview={() => setReviewOutcomeId(warnings[0]?.outcomeId ?? null)}
        />
      ) : error && !snapshot.banned ? (
        <ModerationRefreshError onRetry={() => void reconcile()} />
      ) : null}
    </ModerationStateContext.Provider>
  );
}

export function useModerationState() {
  const value = useContext(ModerationStateContext);
  if (!value) {
    throw new Error("useModerationState must be used within ModerationStateProvider");
  }
  return value;
}

function AccessRestoredOutcome({
  memberReason,
  pending,
  error,
  onContinue,
}: {
  memberReason: string | null;
  pending: boolean;
  error: string | null;
  onContinue: () => Promise<void>;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="fixed inset-0 z-[60] flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-cream px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-[0_18px_44px_-36px_rgba(28,25,23,0.35)]">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <CheckCircle2 size={22} aria-hidden />
        </div>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-5 text-2xl font-extrabold text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-4"
        >
          Account access restored
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          Your suspension is no longer active. You can use Juber again.
        </p>
        {memberReason && (
          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            <p className="font-extrabold">Reason</p>
            <p className="mt-1 leading-relaxed">{memberReason}</p>
          </div>
        )}
        {error ? <p className="mt-4 text-sm font-semibold text-red-700" role="alert">{error}</p> : null}
        <button
          type="button"
          onClick={() => void onContinue()}
          disabled={pending}
          className="mt-6 flex h-11 w-full items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-bold text-white transition hover:bg-brand-700 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving..." : "Continue"}
        </button>
      </div>
    </main>
  );
}
