"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";
import {
  adminActionError,
  adminActionSuccess,
  type AdminActionState,
} from "@/lib/admin-action-state";
import { parseEventSourceUrl } from "@/lib/event-url";
import { actionErrorMessage } from "@/lib/action-lifecycle";
import {
  createAdminReviewActions,
  type AdminReviewClient,
} from "@/lib/admin-review-actions";
import {
  buildJcncImportRows,
  collectExistingJcncDedupeKeys,
  fetchJcncCalendar,
  likelyHighTraffic,
  parseJcncIcs,
  planJcncImport,
  summarizeJcncImport,
} from "@/lib/jcnc-import";

function str(v: FormDataEntryValue | null) {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function requireAdmin() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) redirect("/");
  return { supabase, user };
}

function revalidateAdminEventPaths() {
  revalidatePath("/admin");
  revalidatePath("/events");
  revalidatePath("/m/events");
}

const adminReviewActions = createAdminReviewActions({
  requireAdmin: async () => {
    const { supabase } = await requireAdmin();
    return {
      supabase: supabase as unknown as AdminReviewClient,
    };
  },
  revalidatePath,
  actionErrorMessage,
});

export async function createEvent(
  previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const { supabase, user } = await requireAdmin();
    const name = str(formData.get("name"));
    if (!name) return adminActionError("Please add an event name.");

    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
    const sourceUrl = parseEventSourceUrl(formData.get("source_url"));
    if (formData.get("source_url")?.toString().trim() && !sourceUrl) {
      return adminActionError("Please enter a valid http or https URL.");
    }

    const { error } = await supabase.from("events").insert({
      name,
      slug,
      description: str(formData.get("description")),
      venue_label: str(formData.get("venue_label")),
      start_date: str(formData.get("start_date")),
      end_date: str(formData.get("end_date")),
      source_url: sourceUrl,
      created_by: user.id,
    });
    if (error) return adminActionError(error.message);

    revalidateAdminEventPaths();
    return adminActionSuccess("Event added.", previousState);
  } catch (error) {
    return adminActionError(actionErrorMessage(error, "Could not add event."));
  }
}

export async function createPlace(
  previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const { supabase } = await requireAdmin();
    const name = str(formData.get("name"));
    if (!name) return adminActionError("Please add a location name.");

    const { error } = await supabase.from("places").insert({
      name,
      address: str(formData.get("address")),
      kind: str(formData.get("kind")) ?? "neighborhood",
      event_id: str(formData.get("event_id")),
    });
    if (error) return adminActionError(error.message);

    revalidatePath("/admin");
    return adminActionSuccess("Location added.", previousState);
  } catch (error) {
    return adminActionError(actionErrorMessage(error, "Could not add location."));
  }
}

export async function deleteEvent(
  eventId: string,
  previousState: AdminActionState,
): Promise<AdminActionState> {
  return adminReviewActions.deleteEvent(eventId, previousState);
}

export async function deletePlace(
  placeId: string,
  previousState: AdminActionState,
): Promise<AdminActionState> {
  return adminReviewActions.deletePlace(placeId, previousState);
}

export async function approveEventRequest(
  requestId: string,
  previousState: AdminActionState,
): Promise<AdminActionState> {
  return adminReviewActions.approveEventRequest(requestId, previousState);
}

export async function rejectEventRequest(
  requestId: string,
  previousState: AdminActionState,
): Promise<AdminActionState> {
  return adminReviewActions.rejectEventRequest(requestId, previousState);
}

export async function deleteEventRequest(
  requestId: string,
  previousState: AdminActionState,
): Promise<AdminActionState> {
  return adminReviewActions.deleteEventRequest(requestId, previousState);
}

export async function importJcncEvents(
  previousState: AdminActionState,
): Promise<AdminActionState> {
  try {
    const { supabase, user } = await requireAdmin();
    const calendarText = await fetchJcncCalendar();
    const candidates = parseJcncIcs(calendarText).filter(likelyHighTraffic);

    const { data: existingRows, error: existingError } = await supabase
      .from("event_requests")
      .select("source, source_url, name, start_date, venue_label")
      .eq("source", "jcnc");

    if (existingError) return adminActionError(existingError.message);

    const plan = planJcncImport(
      candidates,
      collectExistingJcncDedupeKeys(existingRows ?? []),
    );
    const summary = summarizeJcncImport(plan);

    if (plan.imported > 0) {
      const { error } = await supabase
        .from("event_requests")
        .insert(buildJcncImportRows(plan.rows, user.id));
      if (error) return adminActionError(error.message);
    }

    revalidatePath("/admin");

    if (summary.status === "success") {
      return adminActionSuccess(summary.message, previousState);
    }

    return {
      status: summary.status,
      message: summary.message,
      resetKey: previousState.resetKey,
    };
  } catch (error) {
    return adminActionError(actionErrorMessage(error, "Could not import JCNC events."));
  }
}
