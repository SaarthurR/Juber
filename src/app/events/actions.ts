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

export async function requestEvent(
  previousState: EventRequestActionState,
  formData: FormData,
): Promise<EventRequestActionState> {
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
