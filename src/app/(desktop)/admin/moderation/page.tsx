import { RouteProgressLink as Link } from "@/components/route-progress-link";
import { AdminModerationPanel } from "@/components/admin-moderation-panel";
import { loadAdminModerationQueue } from "@/lib/moderation-server";

export const dynamic = "force-dynamic";

export default async function AdminModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string | string[] }>;
}) {
  const { report } = await searchParams;
  const queue = await loadAdminModerationQueue(report);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Moderation</h1>
          <p className="mt-1 text-sm text-stone-500">
            Review reports and appeals. Evidence loads through secure admin RPCs only.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm font-bold text-brand-600 hover:text-brand-700"
        >
          Back to admin
        </Link>
      </div>

      <AdminModerationPanel
        key={queue.selectedReport?.id ?? "none"}
        reports={queue.reports}
        appeals={queue.appeals}
        error={queue.error}
        initialReport={queue.selectedReport}
      />
    </div>
  );
}
