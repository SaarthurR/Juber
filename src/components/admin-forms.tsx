"use client";

import { useActionState } from "react";
import { format } from "date-fns";
import {
  approveEventRequest,
  createEvent,
  createPlace,
  deleteEvent,
  deleteEventRequest,
  deletePlace,
  importJcncEvents,
  rejectEventRequest,
} from "@/app/admin/actions";
import { AdminActionFeedback } from "@/components/admin-action-feedback";
import { EventSourceLink } from "@/components/event-source-link";
import { FormField } from "@/components/form-bits";
import { PendingActionButton, PendingActionGroup } from "@/components/pending-action-button";
import { ADMIN_ACTION_INITIAL, type AdminActionState } from "@/lib/admin-action-state";
import type { EventRequestWithRequester, EventRow } from "@/lib/types";

export function AdminJcncImportForm() {
  const [state, formAction] = useActionState(importJcncEvents, ADMIN_ACTION_INITIAL);

  return (
    <form action={formAction} className="space-y-3">
      <AdminActionFeedback state={state} />
      <PendingActionButton
        actionKey="import-jcnc-events"
        pendingLabel="Importing..."
        className="rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-bold text-brand-700 transition hover:bg-tint disabled:cursor-not-allowed disabled:opacity-60"
      >
        Import JCNC events
      </PendingActionButton>
    </form>
  );
}

export function AdminEventRequestCard({ request }: { request: EventRequestWithRequester }) {
  const [approveState, approveAction] = useActionState(
    approveEventRequest.bind(null, request.id),
    ADMIN_ACTION_INITIAL,
  );
  const [rejectState, rejectAction] = useActionState(
    rejectEventRequest.bind(null, request.id),
    ADMIN_ACTION_INITIAL,
  );
  const [deleteState, deleteAction] = useActionState(
    deleteEventRequest.bind(null, request.id),
    ADMIN_ACTION_INITIAL,
  );
  const feedback = mergeAdminFeedback([approveState, rejectState, deleteState]);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_18px_44px_-36px_rgba(28,25,23,0.4)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-extrabold text-ink">{request.name}</h3>
            {request.expected_traffic === "high" && (
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
                high traffic
              </span>
            )}
            {request.source === "jcnc" && (
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-600">
                JCNC import
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-stone-500">
            {requestDates(request)}
            {request.venue_label ? ` · ${request.venue_label}` : ""}
          </p>
          <p className="mt-1 text-xs font-semibold text-stone-400">
            Requested by {request.requester?.full_name ?? "Admin import"}
          </p>
          {request.description && (
            <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-stone-600">
              {request.description}
            </p>
          )}
          {request.source_url && (
            <EventSourceLink
              href={request.source_url}
              label="View source"
              className="mt-2 inline-block text-sm font-bold text-brand-600 hover:text-brand-700"
            />
          )}
        </div>

        <PendingActionGroup>
          <div className="flex shrink-0 flex-col gap-3 md:items-end">
            <AdminActionFeedback state={feedback} className="max-w-sm text-left md:text-right" />
            <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
              <form action={approveAction}>
                <PendingActionButton
                  actionKey={`approve-event-request-${request.id}`}
                  pendingLabel="Approving..."
                  className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Approve
                </PendingActionButton>
              </form>
              <form action={rejectAction}>
                <PendingActionButton
                  actionKey={`reject-event-request-${request.id}`}
                  pendingLabel="Rejecting..."
                  className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-bold text-stone-600 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reject
                </PendingActionButton>
              </form>
              <form action={deleteAction}>
                <PendingActionButton
                  actionKey={`delete-event-request-${request.id}`}
                  pendingLabel="Deleting..."
                  className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Delete
                </PendingActionButton>
              </form>
            </div>
          </div>
        </PendingActionGroup>
      </div>
    </div>
  );
}

export function AdminCreateEventForm() {
  const [state, formAction] = useActionState(createEvent, ADMIN_ACTION_INITIAL);

  return (
    <form key={state.resetKey} action={formAction} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
      <AdminActionFeedback state={state} />
      <FormField label="Name" name="name" required placeholder="Paryushan 2026" />
      <FormField label="Venue" name="venue_label" placeholder="JCNC, Milpitas" />
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Start date" name="start_date" type="date" />
        <FormField label="End date" name="end_date" type="date" />
      </div>
      <FormField label="Description" name="description" textarea />
      <FormField
        label="Event link (optional)"
        name="source_url"
        type="url"
        placeholder="https://example.org/event"
      />
      <PendingActionButton
        actionKey="add-event"
        pendingLabel="Adding event..."
        className="w-full rounded-xl bg-brand-600 px-5 py-4 font-bold text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        Add event
      </PendingActionButton>
    </form>
  );
}

export function AdminDeleteEventButton({ eventId }: { eventId: string }) {
  const [state, formAction] = useActionState(deleteEvent.bind(null, eventId), ADMIN_ACTION_INITIAL);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <AdminActionFeedback
        state={state}
        className="max-w-xs rounded-lg border px-2 py-1 text-xs font-semibold"
      />
      <PendingActionButton
        actionKey={`delete-event-${eventId}`}
        pendingLabel="Deleting..."
        className="text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
      >
        Delete
      </PendingActionButton>
    </form>
  );
}

export function AdminCreatePlaceForm({ events }: { events: EventRow[] }) {
  const [state, formAction] = useActionState(createPlace, ADMIN_ACTION_INITIAL);

  return (
    <form key={state.resetKey} action={formAction} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
      <AdminActionFeedback state={state} />
      <FormField label="Name" name="name" required placeholder="Fremont" />
      <FormField label="Address (optional)" name="address" />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-stone-700">Kind</span>
        <select
          name="kind"
          defaultValue="neighborhood"
          className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
        >
          <option value="neighborhood">Neighborhood</option>
          <option value="event">Event venue</option>
          <option value="hub">Hub</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-stone-700">
          Attach to event (optional)
        </span>
        <select
          name="event_id"
          defaultValue=""
          className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
        >
          <option value="">— None —</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>
      </label>
      <PendingActionButton
        actionKey="add-location"
        pendingLabel="Adding location..."
        className="w-full rounded-xl bg-brand-600 px-5 py-4 font-bold text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        Add location
      </PendingActionButton>
    </form>
  );
}

export function AdminDeletePlaceButton({ placeId }: { placeId: string }) {
  const [state, formAction] = useActionState(deletePlace.bind(null, placeId), ADMIN_ACTION_INITIAL);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <AdminActionFeedback
        state={state}
        className="max-w-xs rounded-lg border px-2 py-1 text-xs font-semibold"
      />
      <PendingActionButton
        actionKey={`delete-place-${placeId}`}
        pendingLabel="Deleting..."
        className="text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
      >
        Delete
      </PendingActionButton>
    </form>
  );
}

function mergeAdminFeedback(states: AdminActionState[]): AdminActionState {
  for (let index = states.length - 1; index >= 0; index -= 1) {
    const state = states[index];
    if (state?.message && state.status !== "idle") return state;
  }
  return ADMIN_ACTION_INITIAL;
}

function requestDates(request: EventRequestWithRequester) {
  if (!request.start_date) return "Date TBD";
  const start = format(new Date(`${request.start_date}T12:00:00`), "MMM d");
  if (!request.end_date || request.end_date === request.start_date) return start;
  return `${start} - ${format(new Date(`${request.end_date}T12:00:00`), "MMM d")}`;
}
