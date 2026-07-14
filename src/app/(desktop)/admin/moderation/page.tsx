import { RouteProgressLink as Link } from "@/components/route-progress-link";
import { AdminModerationWorkspace } from "@/components/admin-moderation/workspace";
import { AdminAppealsQueue } from "@/components/admin-moderation/appeals-queue";
import {
  adminCursorFromSearchParams,
  loadAdminAppeals,
  loadAdminReportCaseContext,
  loadAdminReportCases,
  validAdminUuid,
} from "@/lib/admin-moderation-server";
import { ADMIN_REPORT_REASONS, type AdminReportScope } from "@/lib/admin-moderation";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Search = {
  report?: string | string[];
  scope?: string | string[];
  reason?: string | string[];
  cursor_created_at?: string | string[];
  cursor_id?: string | string[];
  queue?: string | string[];
  appeal_cursor_created_at?: string | string[];
  appeal_cursor_id?: string | string[];
};

export default async function AdminModerationPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { user, profile } = await getCurrentUser();
  if (!user || !profile?.is_admin) redirect("/");
  const query = await searchParams;
  const appealsMode = query.queue === "appeals";
  const appealCursorCreatedAt = typeof query.appeal_cursor_created_at === "string"
    && !Number.isNaN(Date.parse(query.appeal_cursor_created_at))
    ? query.appeal_cursor_created_at
    : null;
  const appealCursorId = validAdminUuid(query.appeal_cursor_id);
  const appealCursor = appealCursorCreatedAt && appealCursorId
    ? { createdAt: appealCursorCreatedAt, id: appealCursorId }
    : null;
  const scope: AdminReportScope = query.scope === "closed" ? "closed" : "open";
  const reason = typeof query.reason === "string"
    && ADMIN_REPORT_REASONS.includes(query.reason as (typeof ADMIN_REPORT_REASONS)[number])
    ? query.reason
    : null;
  const reportId = validAdminUuid(query.report);
  const params = new URLSearchParams();
  if (typeof query.cursor_created_at === "string") params.set("cursor_created_at", query.cursor_created_at);
  if (typeof query.cursor_id === "string") params.set("cursor_id", query.cursor_id);

  const [listResult, contextResult, appealsResult] = appealsMode
    ? [null, null, await loadAdminAppeals({ cursor: appealCursor })]
    : await Promise.all([
        loadAdminReportCases({ scope, reason, cursor: adminCursorFromSearchParams(params) }),
        reportId ? loadAdminReportCaseContext(reportId) : Promise.resolve({ data: null, error: null }),
      ]).then(([list, context]) => [list, context, null] as const);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-7 sm:px-6 sm:pt-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">Moderation</h1>
          <p className="mt-1 text-sm text-stone-500">Review reports and appeals in separate queues.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin" className="inline-flex min-h-11 items-center rounded-xl border border-brand-300 px-4 text-sm font-bold text-brand-700 active:scale-[0.98]">Admin home</Link>
        </div>
      </div>

      <nav aria-label="Moderation queue" className="mb-4 flex gap-1 rounded-xl bg-stone-100 p-1 sm:w-fit">
        <Link href="/admin/moderation" aria-current={!appealsMode ? "page" : undefined} className={`flex min-h-11 flex-1 items-center justify-center rounded-lg px-5 text-sm font-bold sm:flex-none ${!appealsMode ? "bg-white text-ink shadow-sm" : "text-stone-600"}`}>Reports</Link>
        <Link href="/admin/moderation?queue=appeals" aria-current={appealsMode ? "page" : undefined} className={`flex min-h-11 flex-1 items-center justify-center rounded-lg px-5 text-sm font-bold sm:flex-none ${appealsMode ? "bg-white text-ink shadow-sm" : "text-stone-600"}`}>Appeals</Link>
      </nav>

      {appealsMode && appealsResult ? (
        <AdminAppealsQueue list={appealsResult.data} error={appealsResult.error} />
      ) : listResult && contextResult ? (
        <AdminModerationWorkspace
          list={listResult.data}
          context={contextResult.data}
          scope={scope}
          reason={reason}
          error={listResult.error ?? contextResult.error}
        />
      ) : null}
    </div>
  );
}
