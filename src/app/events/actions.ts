"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";
import {
  buildEventRequestPayload,
  eventRequestError,
  eventRequestSuccess,
  type EventRequestActionState,
} from "@/lib/event-request-state";
import { getDemoRuntime, getDemoStore } from "@/lib/demo/runtime";

export async function requestEvent(
  previousState: EventRequestActionState,
  formData: FormData,
): Promise<EventRequestActionState> {
  const demo = await getDemoRuntime();
  if (demo) {
    const { state, payload } = buildEventRequestPayload(formData, demo.activeActorId);
    if (!payload) return state;
    try {
      await getDemoStore().mutate(demo.id, demo.revision, {
        type: "suggest_event",
        actorId: demo.activeActorId,
        input: {
          name: payload.name,
          description: payload.description,
          venue_label: payload.venue_label,
          start_date: payload.start_date,
          end_date: payload.end_date,
          expected_traffic: payload.expected_traffic,
        },
      });
    } catch (error) {
      return eventRequestError(error instanceof Error ? error.message : "Unable to request this event.");
    }
    revalidatePath("/events");
    revalidatePath("/m/events");
    revalidatePath("/admin");
    return eventRequestSuccess(previousState);
  }
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const { state, payload } = buildEventRequestPayload(formData, user.id);
  if (!payload) return state;

  const { error } = await supabase.from("event_requests").insert(payload);
  if (error) return eventRequestError(error.message);

  revalidatePath("/events");
  revalidatePath("/m/events");
  revalidatePath("/admin");
  return eventRequestSuccess(previousState);
}
