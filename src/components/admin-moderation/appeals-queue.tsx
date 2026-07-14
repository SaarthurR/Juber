"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { adminResolveAppealAction } from "@/app/moderation/actions";
import { MODERATION_ACTION_INITIAL } from "@/lib/moderation-action-state";
import type { AdminAppealCase, AdminAppealList } from "@/lib/admin-moderation";

export function AdminAppealsQueue({ list, error }: { list: AdminAppealList; error: string | null }) {
  return (
    <section aria-labelledby="appeals-heading" className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
      <h2 id="appeals-heading" className="text-lg font-extrabold text-ink">Pending appeals</h2>
      <p className="mt-1 text-sm text-stone-500">{list.total} pending. Grant or deny each appeal against its recorded ban.</p>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</p>}
      {list.items.length ? (
        <ul className="mt-5 space-y-3">
          {list.items.map((appeal) => <AppealCard key={appeal.id} appeal={appeal} />)}
        </ul>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-stone-300 px-4 py-10 text-center">
          <p className="text-sm font-bold text-ink">No pending appeals</p>
          <p className="mt-1 text-sm text-stone-500">New appeals will appear here.</p>
        </div>
      )}
      {(list.continuation || list.nextCursor) && (
        <nav aria-label="Appeal pages" className="mt-5 flex items-center justify-between gap-3 border-t border-stone-100 pt-4">
          {list.continuation ? (
            <Link href="/admin/moderation?queue=appeals" className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 px-4 text-sm font-bold text-stone-700">Back to newest</Link>
          ) : <span />}
          {list.nextCursor ? (
            <Link href={`/admin/moderation?queue=appeals&appeal_cursor_created_at=${encodeURIComponent(list.nextCursor.createdAt)}&appeal_cursor_id=${list.nextCursor.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 px-4 text-sm font-bold text-stone-700">Load older appeals</Link>
          ) : <span />}
        </nav>
      )}
    </section>
  );
}

function AppealCard({ appeal }: { appeal: AdminAppealCase }) {
  const grant = adminResolveAppealAction.bind(null, appeal.id, "granted");
  const deny = adminResolveAppealAction.bind(null, appeal.id, "denied");
  const [grantState, grantAction, grantPending] = useActionState(grant, MODERATION_ACTION_INITIAL);
  const [denyState, denyAction, denyPending] = useActionState(deny, MODERATION_ACTION_INITIAL);
  const [confirming, setConfirming] = useState<"granted" | "denied" | null>(null);
  const [internalNote, setInternalNote] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const terminal = [grantState, denyState].find(
    (state) => state.status === "success" || state.status === "info",
  );
  const result = terminal ?? (denyState.status !== "idle" ? denyState : grantState);
  const resolved = result.status === "success" || result.status === "info";
  const pending = grantPending || denyPending;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirming && dialog && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!confirming && dialog?.open) {
      dialog.close();
    }
  }, [confirming]);

  return (
    <li className="rounded-xl border border-stone-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-extrabold text-ink">{appeal.member_name ?? "Unknown member"}</p>
          <time dateTime={appeal.created_at} className="mt-1 block text-xs text-stone-500">
            {format(new Date(appeal.created_at), "MMM d, yyyy h:mm a")}
          </time>
        </div>
        <span className="text-xs font-bold text-stone-500">Appeal {appeal.id.slice(0, 8).toUpperCase()}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-700">{appeal.text}</p>
      {result.message && (resolved || !confirming) && (
        <p role={result.status === "error" ? "alert" : "status"} className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${result.status === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-900"}`}>
          {result.message}
        </p>
      )}
      {!resolved && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setConfirming("granted")} className="min-h-11 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white active:scale-[0.98]">Review grant</button>
            <button type="button" onClick={() => setConfirming("denied")} className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-bold text-stone-700 active:scale-[0.98]">Review denial</button>
          </div>
          <dialog
            ref={dialogRef}
            aria-labelledby={`appeal-confirm-${appeal.id}`}
            onCancel={(event) => pending ? event.preventDefault() : setConfirming(null)}
            onClose={() => setConfirming(null)}
            className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-2xl border border-stone-200 bg-white p-0 shadow-xl backdrop:bg-stone-950/40"
          >
            {confirming && (
              <form action={confirming === "granted" ? grantAction : denyAction} className="p-5 sm:p-6">
                <h3 id={`appeal-confirm-${appeal.id}`} className="text-lg font-extrabold text-ink">
                  Confirm appeal {confirming === "granted" ? "grant" : "denial"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {confirming === "granted"
                    ? "This grants the appeal and lifts only the recorded ban if it is still the active ban."
                    : "This denies the appeal and leaves the member's current ban unchanged."}
                </p>
                <label className="mt-4 block">
                  <span className="text-sm font-bold text-ink">Internal note <span className="font-normal text-stone-500">(optional)</span></span>
                  <textarea name="internal_note" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} maxLength={4000} rows={3} className="mt-2 w-full rounded-xl border border-stone-300 px-3 py-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100" />
                  <span className="mt-1 block text-xs text-stone-500">Admin only. Never shown to the member.</span>
                </label>
                {result.status === "error" && result.message && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{result.message}</p>}
                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="submit" disabled={pending} className={`min-h-11 rounded-xl px-4 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-60 ${confirming === "denied" ? "bg-red-700" : "bg-brand-600"}`}>
                    {pending ? "Saving..." : confirming === "granted" ? "Confirm grant" : "Confirm denial"}
                  </button>
                  <button ref={cancelRef} type="button" disabled={pending} onClick={() => setConfirming(null)} className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-bold text-stone-700 active:scale-[0.98] disabled:opacity-60">Cancel</button>
                </div>
              </form>
            )}
          </dialog>
        </>
      )}
    </li>
  );
}
