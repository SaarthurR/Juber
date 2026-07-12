import { RouteProgressLink as Link } from "@/components/route-progress-link";
import { AdminModerationPanel } from "@/components/admin-moderation-panel";
import { loadAdminModerationQueue } from "@/lib/moderation-server";

export const dynamic = "force-dynamic";

export default async function MobileAdminPage() {
  const queue = await loadAdminModerationQueue();

  return (
    <div className="px-4 pb-28 pt-6">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">Admin</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink">Moderation queue</h1>
        <p className="mt-2 text-sm text-stone-500">
          Review reports and appeals on mobile.
        </p>
        <Link href="/m" className="mt-3 inline-block text-sm font-bold text-brand-600">
          Back to rides
        </Link>
      </div>

      <AdminModerationPanel
        reports={queue.reports}
        appeals={queue.appeals}
        error={queue.error}
      />
    </div>
  );
}
