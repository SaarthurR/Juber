import Link from "next/link";
import {
  ADMIN_REPORT_REASONS,
  adminLabel,
  adminReportHref,
  type AdminReportContext,
  type AdminReportList,
  type AdminReportScope,
} from "@/lib/admin-moderation";
import { AdminModerationCaseDetail } from "@/components/admin-moderation/case-detail";
import { ReportQueue } from "@/components/admin-moderation/report-queue";

export function AdminModerationWorkspace({
  list,
  context,
  scope,
  reason,
  error,
}: {
  list: AdminReportList;
  context: AdminReportContext | null;
  scope: AdminReportScope;
  reason: string | null;
  error: string | null;
}) {
  return (
    <section aria-label="Moderation reports workspace">
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
      <div className="xl:grid xl:min-h-[calc(100dvh-13rem)] xl:grid-cols-[20rem_minmax(0,1fr)] xl:gap-5">
        <aside className={context ? "hidden xl:block" : "block"} aria-label="Reports list">
          <div className="rounded-2xl border border-stone-200 bg-white p-3">
            <nav aria-label="Report status" className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
              {(["open", "closed"] as const).map((mode) => (
                <Link
                  key={mode}
                  href={adminReportHref(null, { scope: mode, reason })}
                  aria-current={scope === mode ? "page" : undefined}
                  className={`flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-bold transition active:scale-[0.98] ${
                    scope === mode
                      ? "bg-white text-ink shadow-sm"
                      : "text-stone-600 hover:text-ink"
                  }`}
                >
                  {adminLabel(mode)}
                </Link>
              ))}
            </nav>

            <form method="get" className="mt-3">
              {scope !== "open" && <input type="hidden" name="scope" value={scope} />}
              <label htmlFor="moderation-reason" className="text-xs font-bold text-stone-600">
                Reason
              </label>
              <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
                <select
                  id="moderation-reason"
                  name="reason"
                  defaultValue={reason ?? ""}
                  className="h-11 min-w-0 rounded-xl border border-stone-300 bg-white px-3 text-sm text-ink focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">All reasons</option>
                  {ADMIN_REPORT_REASONS.map((value) => (
                    <option key={value} value={value}>{adminLabel(value)}</option>
                  ))}
                </select>
                <button className="h-11 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white transition hover:bg-brand-700 active:scale-[0.98]">
                  Apply
                </button>
              </div>
            </form>

            <ReportQueue key={`${scope}:${reason ?? "all"}`} initial={list} selectedReportId={context?.report.id ?? null} scope={scope} reason={reason} />
          </div>
        </aside>

        <div className={context ? "block" : "hidden xl:block"}>
          {context ? (
            <AdminModerationCaseDetail context={context} scope={scope} reason={reason} />
          ) : (
            <div className="flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white px-6 text-center">
              <div>
                <h2 className="text-lg font-extrabold text-ink">Select a report</h2>
                <p className="mt-1 text-sm text-stone-500">Case context loads without opening evidence.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
