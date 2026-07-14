"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  adminLabel,
  parseAdminReportActions,
  type AdminReportAction,
  type AdminReportCursor,
} from "@/lib/admin-moderation";

export function DecisionHistory({ reportId, initialItems }: { reportId: string; initialItems: AdminReportAction[] }) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState<AdminReportCursor | null>(initialItems.length >= 5
    ? { createdAt: initialItems.at(-1)!.created_at, id: initialItems.at(-1)!.id }
    : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOlder() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        category: "decision",
        cursor_created_at: cursor.createdAt,
        cursor_id: cursor.id,
      });
      const response = await fetch(`/api/admin/moderation/cases/${reportId}/actions?${params}`);
      const payload = await response.json() as { data?: unknown; error?: string | null };
      if (!response.ok || payload.error) throw new Error(payload.error || "Could not load older decisions.");
      const parsed = parseAdminReportActions(payload.data);
      setItems((current) => [
        ...current,
        ...parsed.items.map((item) => ({
          ...item,
          current: false,
          superseded: item.action === "report_status" || item.action === "verdict_revised",
        })),
      ]);
      setCursor(parsed.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load older decisions.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="decision-history-heading">
      <h3 id="decision-history-heading" className="text-base font-extrabold text-ink">Decision history</h3>
      {items.length ? (
        <ol className="mt-3 space-y-3">
          {items.map((action) => <HistoryItem key={action.id} action={action} />)}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-stone-500">No structured decision history yet.</p>
      )}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
      {cursor && (
        <button type="button" disabled={loading} onClick={() => void loadOlder()} className="mt-3 min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-bold text-stone-700 active:scale-[0.98] disabled:opacity-60">
          {loading ? "Loading older decisions..." : "Load older decisions"}
        </button>
      )}
    </section>
  );
}

function HistoryItem({ action }: { action: AdminReportAction }) {
  const detail = action.detail;
  const after = detail.after && typeof detail.after === "object"
    ? detail.after as Record<string, unknown>
    : {};
  const verdict = typeof detail.verdict === "string"
    ? detail.verdict
    : typeof after.verdict === "string"
      ? after.verdict
      : null;
  const revisionReason = typeof detail.revision_reason === "string" ? detail.revision_reason : null;
  const internalNote = typeof detail.internal_note === "string" ? detail.internal_note : null;
  const memberReason = typeof detail.member_reason === "string" ? detail.member_reason : null;
  const appealDecision = typeof detail.decision === "string" ? detail.decision : null;
  const before = detail.before && typeof detail.before === "object"
    ? detail.before as Record<string, unknown>
    : null;
  const previousVerdict = before && typeof before.verdict === "string" ? before.verdict : null;
  const previousResolution = before && typeof before.resolution === "string" ? before.resolution : null;
  const previousLegacy = before?.legacy === true;
  return (
    <li className="border-l-2 border-stone-200 pl-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold text-ink">
          {verdict
            ? adminLabel(verdict)
            : action.action === "appeal_resolved" && appealDecision
              ? `Appeal ${adminLabel(appealDecision).toLowerCase()}`
              : adminLabel(action.action)}
        </p>
        {action.current && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800">Current</span>}
        {action.superseded && <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-bold text-stone-700">Superseded</span>}
      </div>
      <p className="mt-1 text-xs text-stone-500">
        {action.reviewer_name ?? "System"}, <time dateTime={action.created_at}>{format(new Date(action.created_at), "MMM d, yyyy h:mm a")}</time>
      </p>
      {revisionReason && <p className="mt-1 text-sm text-stone-700">Revision reason: {revisionReason}</p>}
      {memberReason && <p className="mt-1 text-sm text-stone-700"><span className="font-bold">Member-facing reason:</span> {memberReason}</p>}
      {internalNote && <p className="mt-1 text-sm text-stone-700"><span className="font-bold">Internal only:</span> {internalNote}</p>}
      {before && (
        <div className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">
          <span className="font-bold">Previous, superseded: </span>
          {previousLegacy ? "Legacy decision" : previousVerdict ? adminLabel(previousVerdict) : "Unstructured decision"}
          {previousResolution ? ` - ${previousResolution}` : ""}
        </div>
      )}
    </li>
  );
}
