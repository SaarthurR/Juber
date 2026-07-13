"use client";

import {
  useActionState,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import { format } from "date-fns";
import { AdminActionFeedback } from "@/components/admin-action-feedback";
import { PendingActionButton, PendingActionGroup } from "@/components/pending-action-button";
import {
  adminBanUserAction,
  adminResolveAppealAction,
  adminSetReportStatusAction,
  adminUnbanUserAction,
  adminWarnUserAction,
  loadReportEvidenceAction,
} from "@/app/moderation/actions";
import type { AdminActionState } from "@/lib/admin-action-state";
import {
  bindModerationActionTarget,
  createModerationEvidenceState,
  moderationEvidenceReducer,
  visibleModerationEvidence,
  type AppealRow,
  type BoundModerationActionTarget,
  type ModerationEvidence,
  type ReportRow,
} from "@/lib/moderation";
import {
  MODERATION_ACTION_INITIAL,
  type ModerationActionState,
} from "@/lib/moderation-action-state";
import {
  MODERATION_ACTION_GROUPS,
  MODERATION_CONFIRM_REQUIRED_ACTIONS,
  MODERATION_DESTRUCTIVE_CONFIRM_ACTIONS,
  moderationActionButtonClass,
  moderationConfirmLabel,
} from "@/lib/moderation-admin-ui";
import {
  getFocusableElements,
  getInitialFocusTarget,
  nextFocusableIndex,
  restoreFocus,
  shouldDismissLayer,
} from "@/lib/dialog-a11y";

function mergeFeedback(states: ModerationActionState[]): AdminActionState {
  const active = [...states].reverse().find((state) => state.status !== "idle");
  if (!active) return { status: "idle", message: null, resetKey: 0 };
  return {
    status: active.status === "pending" ? "info" : active.status,
    message: active.message,
    resetKey: active.resetKey,
  };
}

export function AdminModerationPanel({
  reports,
  appeals,
  error,
  initialReport,
}: {
  reports: ReportRow[];
  appeals: AppealRow[];
  error: string | null;
  initialReport: ReportRow | null;
}) {
  const [evidenceState, dispatchEvidence] = useReducer(
    moderationEvidenceReducer,
    initialReport?.id ?? reports[0]?.id ?? null,
    createModerationEvidenceState,
  );
  const confirmId = useId();
  const { requestToken, selectedReportId } = evidenceState;

  useEffect(() => {
    if (!selectedReportId) return;
    void (async () => {
      const result = await loadReportEvidenceAction(selectedReportId);
      if (result.error) {
        dispatchEvidence({
          type: "reject",
          reportId: selectedReportId,
          requestToken,
          error: result.error,
        });
        return;
      }
      dispatchEvidence({
        type: "resolve",
        reportId: selectedReportId,
        requestToken,
        evidence: (result.data ?? {}) as ModerationEvidence,
      });
    })();
  }, [requestToken, selectedReportId]);

  const selectedReport =
    reports.find((report) => report.id === selectedReportId)
    ?? (initialReport?.id === selectedReportId ? initialReport : null);
  const evidenceLoading = evidenceState.loading;
  const evidence = visibleModerationEvidence(evidenceState);
  const actionTarget = bindModerationActionTarget(evidenceState, selectedReport);
  const isTerminal =
    selectedReport?.status === "actioned" || selectedReport?.status === "dismissed";

  return (
    <section className="space-y-8">
      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-6">
          <QueueList
            title="Open reports"
            empty="No open reports."
            items={reports.map((report) => ({
              id: report.id,
              primary: `${report.target_type.replace("_", " ")} · ${report.reason}`,
              secondary: format(new Date(report.created_at), "MMM d, yyyy h:mm a"),
              selected: report.id === selectedReportId,
              onSelect: () => dispatchEvidence({ type: "select", reportId: report.id }),
            }))}
          />

          <AppealsQueue appeals={appeals} />
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          {!selectedReport ? (
            <p className="text-sm text-stone-500">Select a report to review evidence.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-extrabold text-ink">Report evidence</h3>
                  <p className="mt-1 text-sm text-stone-500">
                    {selectedReport.target_type} · {selectedReport.status}
                  </p>
                </div>
                {evidenceLoading && (
                  <span className="text-xs font-semibold text-stone-400">Loading evidence...</span>
                )}
              </div>

              {selectedReport.status === "actioned" && selectedReport.resolution && (
                <p
                  className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800"
                  role="status"
                >
                  Resolved · {selectedReport.resolution}
                </p>
              )}

              {evidenceState.error && (
                <p className="mt-4 text-sm font-semibold text-red-600" role="alert">
                  {evidenceState.error}
                </p>
              )}

              {evidence && (
                <div className="mt-5 space-y-5">
                  <IdentityBlock title="Reporter" person={evidence.reporter} />
                  <IdentityBlock title="Reported member" person={evidence.reported} />

                  {evidence.report?.details && (
                    <div>
                      <p className="text-sm font-bold text-ink">Reporter details</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600">
                        {evidence.report.details}
                      </p>
                    </div>
                  )}

                  <EvidenceSnapshot evidence={evidence.evidence} />
                </div>
              )}

              {isTerminal ? (
                <p className="mt-5 border-t border-stone-100 pt-5 text-sm font-semibold text-stone-500">
                  This resolved report is read-only.
                </p>
              ) : (
                <ReportReviewActions
                  key={selectedReport.id}
                  actionTarget={actionTarget}
                  confirmId={confirmId}
                />
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function QueueList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{
    id: string;
    primary: string;
    secondary: string;
    selected: boolean;
    onSelect: () => void;
  }>;
}) {
  return (
    <div>
      <h3 className="text-base font-extrabold text-ink">{title}</h3>
      {items.length ? (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={item.onSelect}
                aria-pressed={item.selected}
                className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                  item.selected
                    ? "border-brand-200 bg-brand-50"
                    : "border-stone-200 bg-white hover:bg-stone-50"
                }`}
              >
                <p className="text-sm font-bold text-ink">{item.primary}</p>
                <p className="mt-1 text-xs text-stone-500">{item.secondary}</p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-stone-300 px-4 py-6 text-sm text-stone-500">
          {empty}
        </p>
      )}
    </div>
  );
}

function AppealsQueue({ appeals }: { appeals: AppealRow[] }) {
  return (
    <div>
      <h3 className="text-base font-extrabold text-ink">Pending appeals</h3>
      {appeals.length ? (
        <ul className="mt-3 space-y-3">
          {appeals.map((appeal) => (
            <AppealCard key={appeal.id} appeal={appeal} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-stone-300 px-4 py-6 text-sm text-stone-500">
          No pending appeals.
        </p>
      )}
    </div>
  );
}

function AppealCard({ appeal }: { appeal: AppealRow }) {
  const [state, grantAction] = useActionState(
    adminResolveAppealAction.bind(null, appeal.id, "granted", null),
    MODERATION_ACTION_INITIAL,
  );
  const [denyState, denyAction] = useActionState(
    adminResolveAppealAction.bind(null, appeal.id, "denied", null),
    MODERATION_ACTION_INITIAL,
  );
  const feedback = mergeFeedback([state, denyState]);

  return (
    <li className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-xs font-semibold text-stone-400">
        {format(new Date(appeal.created_at), "MMM d, yyyy h:mm a")}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{appeal.text}</p>
      <AdminActionFeedback state={feedback} className="mt-3" />
      <PendingActionGroup>
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={grantAction}>
            <PendingActionButton
              actionKey={`grant-appeal-${appeal.id}`}
              pendingLabel="Granting..."
              className="h-11 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              Grant appeal
            </PendingActionButton>
          </form>
          <form action={denyAction}>
            <PendingActionButton
              actionKey={`deny-appeal-${appeal.id}`}
              pendingLabel="Denying..."
              className="h-11 rounded-xl border border-stone-200 px-4 text-sm font-bold text-stone-700 disabled:opacity-60"
            >
              Deny appeal
            </PendingActionButton>
          </form>
        </div>
      </PendingActionGroup>
    </li>
  );
}

function IdentityBlock({
  title,
  person,
}: {
  title: string;
  person?: { full_name?: string | null };
}) {
  if (!person) return null;
  return (
    <div className="rounded-xl bg-stone-50 px-4 py-3">
      <p className="text-sm font-bold text-ink">{title}</p>
      <p className="mt-1 text-sm text-stone-700">{person.full_name ?? "Unknown member"}</p>
    </div>
  );
}

function EvidenceSnapshot({ evidence }: { evidence?: Record<string, unknown> }) {
  const body = typeof evidence?.body === "string" ? evidence.body : null;
  const messageId = typeof evidence?.message_id === "string" ? evidence.message_id : null;
  const reportedSenderId =
    typeof evidence?.sender_id === "string" ? evidence.sender_id : null;
  const context = Array.isArray(evidence?.context)
    ? evidence.context.flatMap((entry) => {
        const message = entry as Record<string, unknown>;
        if (typeof message.body !== "string") return [];
        return [{
          id: typeof message.id === "string" ? message.id : null,
          senderId: typeof message.sender_id === "string" ? message.sender_id : null,
          body: message.body,
          createdAt: typeof message.created_at === "string" ? message.created_at : null,
        }];
      }).filter((message) => !messageId || message.id !== messageId)
    : [];

  if (body) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-bold text-ink">Reported message</p>
          <p className="mt-2 whitespace-pre-wrap rounded-xl border-2 border-brand-200 bg-brand-50 px-4 py-3 text-sm text-stone-800">
            {body}
          </p>
        </div>
        {context.length > 0 && (
          <div>
            <p className="text-sm font-bold text-ink">Reporter-shared context</p>
            <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-stone-200 p-3">
              {context.map((message, index) => (
                <li key={message.id ?? index} className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
                  <p className="text-xs font-semibold text-stone-400">
                    {message.senderId === reportedSenderId ? "Reported member" : "Reporter"}
                    {message.createdAt
                      ? ` · ${format(new Date(message.createdAt), "MMM d h:mm a")}`
                      : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-stone-700">{message.body}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (!evidence || !Object.keys(evidence).length) return null;

  return (
    <div>
      <p className="text-sm font-bold text-ink">Captured evidence</p>
      <pre className="mt-2 overflow-x-auto rounded-xl bg-stone-50 p-3 text-xs text-stone-700">
        {JSON.stringify(evidence, null, 2)}
      </pre>
    </div>
  );
}

function ReportReviewActions({
  actionTarget,
  confirmId,
}: {
  actionTarget: BoundModerationActionTarget | null;
  confirmId: string;
}) {
  const [feedbackState, setFeedbackState] = useState<ModerationActionState>(
    MODERATION_ACTION_INITIAL,
  );
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [banDays, setBanDays] = useState("7");
  const [pending, startTransition] = useTransition();
  const confirmTriggerRef = useRef<HTMLButtonElement | null>(null);

  async function runAction(action: string) {
    if (!actionTarget) {
      setFeedbackState(moderationActionError("Wait for this report's evidence to load."));
      return;
    }

    if (
      !actionTarget.reportedUserId
      && ["warn-reported", "ban-temp", "ban-perm", "unban", "actioned"].includes(action)
    ) {
      setFeedbackState(moderationActionError("This report has no linked member."));
      return;
    }

    startTransition(async () => {
      let next = MODERATION_ACTION_INITIAL;
      switch (action) {
        case "reviewing":
          next = await adminSetReportStatusAction(
            actionTarget.reportId,
            "reviewing",
            "Under review",
            feedbackState,
          );
          break;
        case "dismiss":
          next = await adminSetReportStatusAction(
            actionTarget.reportId,
            "dismissed",
            note || "Dismissed",
            feedbackState,
          );
          break;
        case "warn-reporter":
          next = await adminWarnUserAction(
            actionTarget.reporterUserId,
            actionTarget.reportId,
            note || "Misuse of reporting",
            feedbackState,
          );
          break;
        case "warn-reported":
          next = await adminWarnUserAction(
            actionTarget.reportedUserId!,
            actionTarget.reportId,
            note || "Community guidelines warning",
            feedbackState,
          );
          break;
        case "ban-temp":
          next = await adminBanUserAction(
            actionTarget.reportedUserId!,
            note || actionTarget.reason,
            Number(banDays) as 1 | 7 | 30,
            actionTarget.reportId,
            feedbackState,
          );
          break;
        case "ban-perm":
          next = await adminBanUserAction(
            actionTarget.reportedUserId!,
            note || actionTarget.reason,
            null,
            actionTarget.reportId,
            feedbackState,
          );
          break;
        case "unban":
          next = await adminUnbanUserAction(
            actionTarget.reportedUserId!,
            note || "Manual unban",
            actionTarget.reportId,
            feedbackState,
          );
          break;
        case "actioned":
          next = await adminSetReportStatusAction(
            actionTarget.reportId,
            "actioned",
            note || "Action taken",
            feedbackState,
          );
          break;
        default:
          break;
      }
      setFeedbackState(next);
      setConfirmAction(null);
    });
  }

  const feedback = mergeFeedback([feedbackState]);

  return (
    <div className="border-t border-stone-100 pt-5">
      <h4 className="text-sm font-extrabold text-ink">Review actions</h4>
      <p id={confirmId} className="mt-1 text-xs text-stone-500">
        Destructive actions require confirmation. Session revocation by user ID is not supported;
        database lockout applies immediately.
      </p>
      {!actionTarget && (
        <p className="mt-2 text-xs font-semibold text-stone-500" role="status">
          Actions unlock after matching evidence loads.
        </p>
      )}

      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-bold text-ink">Admin note</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Optional note for warnings, bans, or dismissal."
          className="w-full rounded-xl border border-stone-200 px-3.5 py-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-bold text-ink">Temporary ban length</span>
        <select
          value={banDays}
          onChange={(event) => setBanDays(event.target.value)}
          className="h-11 w-full rounded-xl border border-stone-200 px-3.5 text-sm"
        >
          <option value="1">1 day</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
        </select>
      </label>

      <AdminActionFeedback state={feedback} className="mt-3" />

      <PendingActionGroup>
        <div className="mt-4 space-y-4">
          {MODERATION_ACTION_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-xs font-extrabold uppercase tracking-wide text-stone-400">
                {group.title}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {group.actions.map(({ id, label, tier }) => (
                  <button
                    key={id}
                    type="button"
                    disabled={!actionTarget || pending}
                    onClick={(event) => {
                      if (MODERATION_CONFIRM_REQUIRED_ACTIONS.has(id)) {
                        confirmTriggerRef.current = event.currentTarget;
                        setConfirmAction(id);
                        return;
                      }
                      void runAction(id);
                    }}
                    className={moderationActionButtonClass(tier)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PendingActionGroup>

      {confirmAction && (
        <ModerationConfirmDialog
          action={confirmAction}
          actionReady={Boolean(actionTarget)}
          banDays={Number(banDays) as 1 | 7 | 30}
          confirmId={confirmId}
          pending={pending}
          returnFocusRef={confirmTriggerRef}
          onConfirm={() => void runAction(confirmAction)}
          onDismiss={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

function ModerationConfirmDialog({
  action,
  actionReady,
  banDays,
  confirmId,
  pending,
  returnFocusRef,
  onConfirm,
  onDismiss,
}: {
  action: string;
  actionReady: boolean;
  banDays: 1 | 7 | 30;
  confirmId: string;
  pending: boolean;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const returnFocus = returnFocusRef.current;
    if (panel) {
      window.requestAnimationFrame(() => getInitialFocusTarget(panel).focus());
    }
    return () => {
      restoreFocus(returnFocus);
    };
  }, [returnFocusRef]);

  function dismiss() {
    if (shouldDismissLayer({ pending, reason: "escape" })) {
      onDismiss();
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = getFocusableElements(panelRef.current);
    event.preventDefault();
    if (focusable.length === 0) {
      panelRef.current.focus();
      return;
    }
    const current = document.activeElement as HTMLElement | null;
    const currentIndex = current ? focusable.indexOf(current) : -1;
    const nextIndex = nextFocusableIndex(
      currentIndex,
      focusable.length,
      event.shiftKey ? "backward" : "forward",
    );
    focusable[nextIndex]?.focus();
  }

  return (
    <div
      ref={panelRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`${confirmId}-title`}
      aria-describedby={confirmId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={`mt-4 rounded-xl border p-4 ${
        action === "ban-perm"
          ? "border-red-200 bg-red-50"
          : "border-amber-200 bg-amber-50"
      }`}
    >
      <p id={`${confirmId}-title`} className="text-sm font-bold text-ink">
        {action === "ban-perm"
          ? "Permanently ban this member?"
          : action === "ban-temp"
            ? `Ban this member for ${banDays} ${banDays === 1 ? "day" : "days"}?`
            : `Confirm ${action.replace("-", " ")}?`}
      </p>
      {action === "ban-temp" && (
        <p className="mt-1 text-xs font-semibold text-amber-900">
          The database will compute the exact expiry and action this report atomically.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          data-autofocus="true"
          disabled={!actionReady || pending}
          onClick={onConfirm}
          className={`h-11 rounded-xl px-4 text-sm font-bold text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 ${
            MODERATION_DESTRUCTIVE_CONFIRM_ACTIONS.has(action)
              ? "bg-red-600 hover:bg-red-700"
              : "bg-brand-600 hover:bg-brand-700"
          }`}
        >
          {moderationConfirmLabel(action, banDays)}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onDismiss}
          className="h-11 rounded-xl border border-stone-200 px-4 text-sm font-bold text-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function moderationActionError(message: string): ModerationActionState {
  return { status: "error", message, resetKey: 0 };
}
