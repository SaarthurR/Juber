"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Flag } from "lucide-react";
import { DesktopDialog } from "@/components/ui/desktop-dialog";
import { BottomSheet } from "@/components/mobile/bottom-sheet";
import { FormField } from "@/components/form-bits";
import { InlineActionError } from "@/components/inline-action-error";
import { PendingActionButton, PendingActionGroup } from "@/components/pending-action-button";
import { submitReportAction } from "@/app/moderation/actions";
import { REPORT_REASONS, type ReportTargetType } from "@/lib/moderation";
import { MODERATION_ACTION_INITIAL } from "@/lib/moderation-action-state";

export function ReportTargetButton({
  targetType,
  targetId,
  label = "Report",
  variant = "desktop",
  compact = false,
  tone = "default",
  disabled = false,
}: {
  targetType: ReportTargetType;
  targetId: string;
  label?: string;
  variant?: "desktop" | "mobile";
  compact?: boolean;
  tone?: "default" | "subtle";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const mobile = variant === "mobile";
  const subtle = tone === "subtle";

  const buttonClass = compact
    ? mobile
      ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-500 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60"
      : "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-500 transition hover:bg-stone-50 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60"
    : subtle
      ? mobile
        ? "flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-stone-100 bg-transparent px-2.5 text-xs font-semibold text-stone-400 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60"
        : "inline-flex h-11 items-center gap-1.5 rounded-xl border border-stone-100 bg-transparent px-2.5 text-xs font-semibold text-stone-400 transition hover:border-stone-200 hover:bg-stone-50 hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60"
      : mobile
        ? "flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-stone-700 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60"
        : "inline-flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 text-sm font-bold text-stone-700 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
        className={buttonClass}
      >
        <Flag size={compact ? 18 : 16} aria-hidden />
        {!compact && label}
      </button>

      {mobile ? (
        <ReportTargetSheet
          open={open}
          onClose={() => setOpen(false)}
          targetType={targetType}
          targetId={targetId}
        />
      ) : (
        <ReportTargetDialog
          open={open}
          onClose={() => setOpen(false)}
          targetType={targetType}
          targetId={targetId}
        />
      )}
    </>
  );
}

function ReportTargetForm({
  targetType,
  targetId,
  onSuccess,
  onPendingChange,
}: {
  targetType: ReportTargetType;
  targetId: string;
  onSuccess: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(
    submitReportAction,
    MODERATION_ACTION_INITIAL,
  );
  const errorId = useId();

  useEffect(() => {
    if (state.status === "success") onSuccess();
  }, [onSuccess, state.status]);
  useEffect(() => onPendingChange(pending), [onPendingChange, pending]);

  return (
    <PendingActionGroup>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="target_type" value={targetType} />
        <input type="hidden" name="target_id" value={targetId} />

        <label className="block">
          <span className="mb-1 block text-[15px] font-bold text-ink">Reason</span>
          <select
            name="reason"
            required
            defaultValue=""
            aria-describedby={state.message ? errorId : undefined}
            className="h-11 w-full rounded-xl border border-[#e2ddd5] px-3.5 text-[15px] outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          >
            <option value="" disabled>
              Choose a reason
            </option>
            {REPORT_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </label>

        <FormField
          label="Details"
          name="details"
          textarea
          maxLength={2000}
          placeholder="What happened? Include dates or context if helpful."
          hint="Optional. Do not include contact info you do not want admins to see."
        />

        {targetType === "message" && (
          <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3">
            <input
              type="checkbox"
              name="include_message_context"
              className="mt-0.5 h-4 w-4 rounded border-stone-300 text-brand-600"
            />
            <span>
              <span className="block text-sm font-bold text-ink">
                Include nearby messages for context
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-stone-500">
                The reported message is always included. Checking this may also share up to 10
                nearby messages, including your own, with admins.
              </span>
            </span>
          </label>
        )}

        <InlineActionError
          id={errorId}
          error={state.status === "error" ? state.message : null}
          className="text-sm font-semibold text-red-600"
        />

        {state.status === "success" ? (
          <p className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm font-semibold text-emerald-800" role="status">
            {state.message}
          </p>
        ) : (
          <PendingActionButton
            actionKey={`report-${targetType}-${targetId}`}
            pendingLabel="Submitting..."
            className="flex h-11 w-full items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Submit report
          </PendingActionButton>
        )}
      </form>
    </PendingActionGroup>
  );
}

function ReportTargetDialog({
  open,
  onClose,
  targetType,
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
}) {
  const titleId = useId();
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  function close() {
    setSubmitted(false);
    onClose();
  }

  if (!open) return null;

  return createPortal(
    <DesktopDialog
      open={open}
      onDismiss={close}
      dismissDisabled={pending}
      labelledBy={titleId}
      closeLabel="Close report dialog"
    >
      <h2 id={titleId} className="pr-8 text-lg font-extrabold text-ink">
        Report content
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-stone-500">
        Reports go to admins only. The other person will not see your name.
      </p>
      <div className="mt-5">
        <ReportTargetForm
          targetType={targetType}
          targetId={targetId}
          onSuccess={() => setSubmitted(true)}
          onPendingChange={setPending}
        />
        {submitted && (
          <button
            type="button"
            onClick={close}
            className="mt-3 flex h-11 w-full items-center justify-center rounded-xl border border-stone-200 text-sm font-bold text-stone-700"
          >
            Close
          </button>
        )}
      </div>
    </DesktopDialog>,
    document.body,
  );
}

function ReportTargetSheet({
  open,
  onClose,
  targetType,
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
}) {
  const titleId = useId();
  const [pending, setPending] = useState(false);

  if (!open) return null;

  return createPortal(
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissDisabled={pending}
      labelledBy={titleId}
      closeLabel="Close report sheet"
    >
      <h2 id={titleId} className="text-lg font-extrabold text-ink">
        Report content
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-stone-500">
        Reports go to admins only. The other person will not see your name.
      </p>
      <div className="mt-5 pb-2">
        <ReportTargetForm
          targetType={targetType}
          targetId={targetId}
          onSuccess={() => {}}
          onPendingChange={setPending}
        />
      </div>
    </BottomSheet>,
    document.body,
  );
}
