"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { adminCompensateBanAction } from "@/app/moderation/actions";
import { MODERATION_ACTION_INITIAL } from "@/lib/moderation-action-state";

export function BanCompensationForm({
  userId,
  banId,
  reportId,
}: {
  userId: string;
  banId: string;
  reportId: string;
}) {
  const [state, action, pending] = useActionState(adminCompensateBanAction, MODERATION_ACTION_INITIAL);
  const [memberReason, setMemberReason] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirming && dialog && !dialog.open) dialog.showModal();
    if (!confirming && dialog?.open) dialog.close();
  }, [confirming]);

  if (state.status === "success") {
    return <p role="status" className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-sm font-bold text-emerald-900">{state.message}</p>;
  }

  return (
    <details className="mt-3 border-t border-red-200 pt-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-red-900">Lift this exact ban</summary>
      <form action={action} className="space-y-3 pt-2">
        <input type="hidden" name="user_id" value={userId} />
        <input type="hidden" name="expected_ban_id" value={banId} />
        <input type="hidden" name="expected_report_id" value={reportId} />
        <label className="block">
          <span className="text-sm font-bold text-red-950">Member-facing reason</span>
          <textarea name="member_reason" value={memberReason} onChange={(event) => setMemberReason(event.target.value)} required maxLength={500} rows={2} className="mt-1 w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100" />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-red-950">Internal note</span>
          <textarea name="internal_note" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} maxLength={4000} rows={2} className="mt-1 w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100" />
        </label>
        {state.status === "error" && <p role="alert" className="text-sm font-semibold text-red-900">{state.message}</p>}
        <button type="button" disabled={!memberReason.trim()} onClick={() => setConfirming(true)} className="min-h-11 rounded-xl border border-red-400 bg-white px-4 text-sm font-bold text-red-900 active:scale-[0.98] disabled:opacity-50">Review ban lift</button>
        <dialog ref={dialogRef} aria-labelledby={`compensate-${banId}`} onCancel={(event) => pending ? event.preventDefault() : setConfirming(false)} className="m-auto w-[min(30rem,calc(100%-2rem))] rounded-2xl border border-stone-200 bg-white p-5 shadow-xl backdrop:bg-stone-950/40">
          <h4 id={`compensate-${banId}`} className="text-lg font-extrabold text-ink">Lift this ban?</h4>
          <p className="mt-2 text-sm text-stone-700">Only ban {banId.slice(0, 8).toUpperCase()} from this case will be removed. The verdict remains unchanged.</p>
          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-700">Visible to member: {memberReason}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-red-700 px-4 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-60">{pending ? "Lifting ban..." : "Confirm ban lift"}</button>
            <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-bold text-stone-700 active:scale-[0.98] disabled:opacity-60">Cancel</button>
          </div>
        </dialog>
      </form>
    </details>
  );
}
