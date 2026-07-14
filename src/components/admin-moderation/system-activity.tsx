"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  adminLabel,
  parseAdminReportActions,
  type AdminReportAction,
  type AdminReportCursor,
} from "@/lib/admin-moderation";

export function SystemActivity({ reportId }: { reportId: string }) {
  const [items, setItems] = useState<AdminReportAction[]>([]);
  const [cursor, setCursor] = useState<AdminReportCursor | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(next: AdminReportCursor | null = null) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ category: "system" });
      if (next) {
        params.set("cursor_created_at", next.createdAt);
        params.set("cursor_id", next.id);
      }
      const response = await fetch(`/api/admin/moderation/cases/${reportId}/actions?${params}`);
      const payload = await response.json() as { data?: unknown; error?: string | null };
      if (!response.ok || payload.error) throw new Error(payload.error || "Could not load system activity.");
      const parsed = parseAdminReportActions(payload.data);
      setItems((current) => next ? [...current, ...parsed.items] : parsed.items);
      setCursor(parsed.nextCursor);
      setLoaded(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load system activity.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <details
      className="rounded-xl border border-stone-200"
      onToggle={(event) => {
        if (event.currentTarget.open && !loaded && !loading) void load();
      }}
    >
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-bold text-ink">
        System activity
      </summary>
      <div className="border-t border-stone-200 px-4 py-4" aria-live="polite">
        {error && (
          <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            <p>{error}</p>
            <button type="button" onClick={() => void load()} className="mt-2 min-h-11 rounded-xl border border-red-300 px-3 font-bold">Retry</button>
          </div>
        )}
        {loading && <p className="text-sm font-semibold text-stone-500">Loading activity...</p>}
        {!loading && loaded && !items.length && <p className="text-sm text-stone-500">No system activity retained.</p>}
        {items.length > 0 && (
          <ol className="space-y-3">
            {items.map((action) => (
              <li key={action.id} className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
                <time dateTime={action.created_at} className="text-xs text-stone-500">{format(new Date(action.created_at), "MMM d, yyyy h:mm a")}</time>
                <p className="text-sm text-stone-700"><span className="font-bold text-ink">{adminLabel(action.action)}</span>{action.reviewer_name ? ` by ${action.reviewer_name}` : ""}</p>
              </li>
            ))}
          </ol>
        )}
        {cursor && !loading && (
          <button type="button" onClick={() => void load(cursor)} className="mt-4 min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-bold text-stone-700 active:scale-[0.98]">Load older activity</button>
        )}
      </div>
    </details>
  );
}
