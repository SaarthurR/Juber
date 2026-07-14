"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  adminCaseReference,
  adminLabel,
  adminReportHref,
  parseAdminReportList,
  type AdminReportCase,
  type AdminReportCursor,
  type AdminReportDirection,
  type AdminReportScope,
  type AdminRetainedCounts,
} from "@/lib/admin-moderation";

export function MemberReportHistory({ userId, counts }: { userId: string; counts: AdminRetainedCounts }) {
  const [query, setQuery] = useState<{ direction: AdminReportDirection; scope: AdminReportScope } | null>(null);
  const [items, setItems] = useState<AdminReportCase[]>([]);
  const [cursor, setCursor] = useState<AdminReportCursor | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (query && dialog && !dialog.open) dialog.showModal();
    if (!query && dialog?.open) dialog.close();
  }, [query]);

  async function load(direction: AdminReportDirection, scope: AdminReportScope, next: AdminReportCursor | null = null) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ direction, scope });
      if (next) {
        params.set("cursor_created_at", next.createdAt);
        params.set("cursor_id", next.id);
      }
      const response = await fetch(`/api/admin/moderation/users/${userId}/reports?${params}`);
      const payload = await response.json() as { data?: unknown; error?: string | null };
      if (!response.ok || payload.error) throw new Error(payload.error || "Could not load retained reports.");
      const parsed = parseAdminReportList(payload.data);
      setItems((current) => next ? [...current, ...parsed.items] : parsed.items);
      setCursor(parsed.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load retained reports.");
    } finally {
      setLoading(false);
    }
  }

  function open(direction: AdminReportDirection, scope: AdminReportScope) {
    setItems([]);
    setCursor(null);
    setQuery({ direction, scope });
    void load(direction, scope);
  }

  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <CountGroup label="Reports made" values={counts.made} onOpen={(scope) => open("made", scope)} />
        <CountGroup label="Reports received" values={counts.received} onOpen={(scope) => open("received", scope)} />
      </div>
      <p className="mt-2 text-[11px] text-stone-500">Retained reports only</p>

      <dialog
        ref={dialogRef}
        aria-labelledby={`history-${userId}`}
        onCancel={() => setQuery(null)}
        className="mb-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-2xl border border-stone-200 bg-white p-0 shadow-xl backdrop:bg-stone-950/40 sm:m-auto sm:w-[min(42rem,calc(100%-2rem))] sm:rounded-2xl"
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-stone-200 bg-white px-4 py-4 sm:px-5">
          <div>
            <h4 id={`history-${userId}`} className="text-lg font-extrabold text-ink">
              {query ? `${adminLabel(query.direction)} ${adminLabel(query.scope)} reports` : "Retained reports"}
            </h4>
            <p className="mt-1 text-xs text-stone-500">Metadata and current decision only. Evidence is not loaded.</p>
          </div>
          <button type="button" onClick={() => setQuery(null)} className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-bold text-stone-700 active:scale-[0.98]">Close</button>
        </div>
        <div className="min-h-44 overflow-y-auto px-4 py-4 sm:px-5" aria-live="polite">
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</p>}
          {items.length > 0 ? (
            <ul className="space-y-2">
              {items.map((report) => (
                <li key={report.id}>
                  <a href={adminReportHref(report.id, { scope: report.status === "pending" || report.status === "reviewing" ? "open" : "closed" })} className="block min-h-11 rounded-xl border border-stone-200 px-4 py-3 transition hover:bg-stone-50 active:scale-[0.99]">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-ink">{adminLabel(report.reason)}</span>
                      <span className="text-xs font-semibold text-stone-500">{adminCaseReference(report.id)}</span>
                    </span>
                    <span className="mt-1 block text-xs text-stone-500">
                      {adminLabel(report.status)}{report.verdict ? `, ${adminLabel(report.verdict)}` : ""} · {format(new Date(report.created_at), "MMM d, yyyy")}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : !loading && !error ? (
            <p className="py-8 text-center text-sm text-stone-500">No retained reports in this group.</p>
          ) : null}
          {loading && <p className="py-6 text-center text-sm font-semibold text-stone-500">Loading reports...</p>}
          {cursor && query && !loading && (
            <button type="button" onClick={() => void load(query.direction, query.scope, cursor)} className="mt-3 min-h-11 w-full rounded-xl border border-stone-300 text-sm font-bold text-stone-700 active:scale-[0.98]">Load older</button>
          )}
        </div>
      </dialog>
    </>
  );
}

function CountGroup({
  label,
  values,
  onOpen,
}: {
  label: string;
  values: { open: number; closed: number };
  onOpen: (scope: AdminReportScope) => void;
}) {
  return (
    <div>
      <p className="font-bold text-stone-600">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        <button type="button" onClick={() => onOpen("open")} className="min-h-11 rounded-lg px-2 font-bold text-brand-700 underline-offset-2 hover:underline active:scale-[0.98]">{values.open} Open</button>
        <button type="button" onClick={() => onOpen("closed")} className="min-h-11 rounded-lg px-2 font-bold text-brand-700 underline-offset-2 hover:underline active:scale-[0.98]">{values.closed} Closed</button>
      </div>
    </div>
  );
}
