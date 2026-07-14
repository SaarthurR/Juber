import { redirect } from "next/navigation";
import { RouteProgressLink as Link } from "@/components/route-progress-link";
import { DemoModeToggle } from "@/components/demo-mode-toggle";
import {
  AdminCreateEventForm,
  AdminCreatePlaceForm,
  AdminDeleteEventButton,
  AdminDeletePlaceButton,
  AdminEventRequestCard,
  AdminJcncImportForm,
} from "@/components/admin-forms";
import { getCurrentUser } from "@/lib/auth";
import { loadAdminHome } from "@/lib/admin-home";
import { getDemoRuntime } from "@/lib/demo/runtime";
import { validAdminUuid } from "@/lib/admin-moderation-server";

export const dynamic = "force-dynamic";

export default async function MobileAdminPage({ searchParams }: { searchParams: Promise<{ report?: string | string[] }> }) {
  const reportId = validAdminUuid((await searchParams).report);
  if (reportId) redirect(`/admin/moderation?report=${reportId}`);
  const { user, profile } = await getCurrentUser();
  if (!user || !profile?.is_admin) redirect(process.env.DEMO_ADMIN_PASSCODE ? "/admin/demo" : "/");
  const [runtime, { events: eventList, places: placeList, eventRequests: requestList, moderationSummary }] = await Promise.all([
    getDemoRuntime(),
    loadAdminHome(),
  ]);

  return (
    <div className="px-4 pb-28 pt-6">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">Admin</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink">Admin</h1>
        <p className="mt-2 text-sm text-stone-500">
          {moderationSummary.openReports} open {moderationSummary.openReports === 1 ? "report" : "reports"} and {moderationSummary.openAppeals} open {moderationSummary.openAppeals === 1 ? "appeal" : "appeals"}.
        </p>
        {moderationSummary.error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">Counts could not be refreshed.</p>}
        <Link href="/m" className="mt-3 inline-block text-sm font-bold text-brand-600">
          Back to rides
        </Link>
      </div>

      <DemoModeToggle active={Boolean(runtime)} />

      <Link href="/admin/moderation" className="flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-bold text-white active:scale-[0.98]">
        Open moderation workspace
      </Link>

      <div className="mt-8 space-y-6">
        <section>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-extrabold">Event requests</h2>
            <AdminJcncImportForm />
          </div>
          <div className="mt-3 grid gap-3">
            {requestList.length ? requestList.map((request) => (
              <AdminEventRequestCard key={request.id} request={request} />
            )) : (
              <p className="rounded-xl border border-dashed border-stone-300 bg-white p-5 text-sm text-stone-500">No pending event requests.</p>
            )}
          </div>
        </section>

        <section>
          <details className="rounded-2xl border border-stone-200 bg-white">
            <summary className="cursor-pointer px-5 py-4 text-base font-extrabold">
              Create event
            </summary>
            <div className="border-t border-stone-100 p-4">
              <AdminCreateEventForm />
            </div>
          </details>
          <ul className="mt-3 space-y-2">
            {eventList.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm"
              >
                <span>{event.name}</span>
                <AdminDeleteEventButton eventId={event.id} />
              </li>
            ))}
          </ul>
        </section>

        <section>
          <details className="rounded-2xl border border-stone-200 bg-white">
            <summary className="cursor-pointer px-5 py-4 text-base font-extrabold">
              Add preset location
            </summary>
            <div className="border-t border-stone-100 p-4">
              <AdminCreatePlaceForm events={eventList} />
            </div>
          </details>
          <ul className="mt-3 space-y-2">
            {placeList.map((place) => (
              <li
                key={place.id}
                className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm"
              >
                <span>
                  {place.name} <span className="text-stone-400">({place.kind})</span>
                </span>
                <AdminDeletePlaceButton placeId={place.id} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
