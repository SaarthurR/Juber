"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  adminCaseReference,
  adminLabel,
  adminReportHref,
  parseAdminReportList,
  type AdminReportCase,
  type AdminReportCursor,
  type AdminReportList,
  type AdminReportScope,
} from "@/lib/admin-moderation";

export function ReportQueue({
  initial,
  selectedReportId,
  scope,
  reason,
}: {
  initial: AdminReportList;
  selectedReportId: string | null;
  scope: AdminReportScope;
  reason: string | null;
}) {
  const [items, setItems] = useState<AdminReportCase[]>(initial.items);
  const [cursor, setCursor] = useState<AdminReportCursor | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOlder() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        scope,
        cursor_created_at: cursor.createdAt,
        cursor_id: cursor.id,
      });
      if (reason) params.set("reason", reason);
      const response = await fetch(`/api/admin/moderation/cases?${params}`);
      const payload = await response.json() as { data?: unknown; error?: string | null };
      if (!response.ok || payload.error) throw new Error(payload.error || "Could not load older reports.");
      const parsed = parseAdminReportList(payload.data);
      setItems((current) => [...current, ...parsed.items]);
      setCursor(parsed.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load older reports.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div aria-live="polite">
      <p className="mt-4 px-1 text-xs font-semibold text-stone-500">
        {initial.total} retained {scope} {initial.total === 1 ? "report" : "reports"}
      </p>
      {items.length ? (
        <ul className="mt-2 space-y-1" aria-label={`${adminLabel(scope)} reports`}>
          {items.map((report) => {
            const selected = selectedReportId === report.id;
            return (
              <li key={report.id}>
                <a
                  href={adminReportHref(report.id, { scope, reason })}
                  aria-current={selected ? "true" : undefined}
                  className={`block min-h-11 rounded-xl border px-3 py-3 transition active:scale-[0.99] ${selected ? "border-brand-300 bg-brand-50" : "border-transparent hover:border-stone-200 hover:bg-stone-50"}`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold text-ink">{adminLabel(report.reason)}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">{adminLabel(report.status)}</span>
                      <span className="text-[11px] font-bold text-stone-500">{adminCaseReference(report.id)}</span>
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-stone-500">{report.reported_name ?? adminLabel(report.target_type)}</span>
                  <time className="mt-1 block text-xs text-stone-400" dateTime={report.created_at}>{format(new Date(report.created_at), "MMM d, yyyy h:mm a")}</time>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-stone-300 px-4 py-8 text-center">
          <p className="text-sm font-bold text-ink">No matching reports</p>
          <p className="mt-1 text-sm text-stone-500">Try another status or reason.</p>
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{error}</p>}
      {cursor && (
        <button type="button" disabled={loading} onClick={() => void loadOlder()} className="mt-3 min-h-11 w-full rounded-xl border border-stone-300 text-sm font-bold text-stone-700 transition hover:bg-stone-50 active:scale-[0.98] disabled:opacity-60">
          {loading ? "Loading older reports..." : "Load older reports"}
        </button>
      )}
    </div>
  );
}
