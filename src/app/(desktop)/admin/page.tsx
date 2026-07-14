import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DemoModeToggle } from "@/components/demo-mode-toggle";
import {
  AdminCreateEventForm,
  AdminCreatePlaceForm,
  AdminDeleteEventButton,
  AdminDeletePlaceButton,
  AdminEventRequestCard,
  AdminJcncImportForm,
} from "@/components/admin-forms";
import { loadAdminHome } from "@/lib/admin-home";
import { getDemoRuntime } from "@/lib/demo/runtime";
import { localDemoUnlockEnabled } from "@/lib/demo/access";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { user, profile } = await getCurrentUser();
  if (!user || !profile?.is_admin) redirect(localDemoUnlockEnabled() ? "/admin/demo" : "/");

  const [runtime, { events: eventList, places: placeList, eventRequests: requestList, moderationSummary }] = await Promise.all([
    getDemoRuntime(),
    loadAdminHome(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 text-3xl font-bold">Admin</h1>
      <DemoModeToggle active={Boolean(runtime)} />

      <section id="moderation-summary" className="mb-8 rounded-2xl border border-stone-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Moderation</h2>
            <p className="mt-1 text-sm text-stone-500">
              {moderationSummary.openReports} open {moderationSummary.openReports === 1 ? "report" : "reports"} and {moderationSummary.openAppeals} open {moderationSummary.openAppeals === 1 ? "appeal" : "appeals"}.
            </p>
            {moderationSummary.error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">Counts could not be refreshed.</p>}
          </div>
          <a
            href="/admin/moderation"
            className="inline-flex min-h-11 items-center rounded-xl border border-brand-200 bg-white px-4 text-sm font-bold text-brand-700 transition hover:bg-tint active:scale-[0.98]"
          >
            Open moderation workspace
          </a>
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Event requests</h2>
            <p className="mt-1 text-sm text-stone-500">
              Approve user suggestions or import likely high-traffic JCNC calendar items.
            </p>
          </div>
          <AdminJcncImportForm />
        </div>

        {requestList.length ? (
          <div className="grid gap-3">
            {requestList.map((request) => (
              <AdminEventRequestCard key={request.id} request={request} />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
            No pending event requests.
          </p>
        )}
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <details className="rounded-2xl border border-stone-200 bg-white">
            <summary className="cursor-pointer px-5 py-4 text-lg font-bold">
              Create event
            </summary>
            <div className="border-t border-stone-100 p-4">
              <AdminCreateEventForm />
            </div>
          </details>

          <ul className="mt-5 space-y-2">
            {eventList.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm"
              >
                <span>{event.name}</span>
                <AdminDeleteEventButton eventId={event.id} />
              </li>
            ))}
          </ul>
        </section>

        <section>
          <details className="rounded-2xl border border-stone-200 bg-white">
            <summary className="cursor-pointer px-5 py-4 text-lg font-bold">
              Add preset location
            </summary>
            <div className="border-t border-stone-100 p-4">
              <AdminCreatePlaceForm events={eventList} />
            </div>
          </details>

          <ul className="mt-5 space-y-2">
            {placeList.map((place) => (
              <li
                key={place.id}
                className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm"
              >
                <span>
                  {place.name}{" "}
                  <span className="text-stone-400">({place.kind})</span>
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
