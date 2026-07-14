import "server-only";

import { loadAdminModerationSummary } from "@/lib/admin-moderation-server";
import { getDemoRuntime } from "@/lib/demo/runtime";
import { queryDemoEventRequests, queryDemoEvents } from "@/lib/demo/queries";
import { createClient } from "@/lib/supabase/server";
import type { EventRequestWithRequester, EventRow, Place } from "@/lib/types";

export async function loadAdminHome() {
  const runtime = await getDemoRuntime();
  if (runtime) {
    const state = runtime.state;
    return {
      events: queryDemoEvents(state).sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? "")),
      places: Object.values(state.places).filter((place) => place.active).sort((a, b) => a.name.localeCompare(b.name)),
      eventRequests: queryDemoEventRequests(state)
        .filter((request) => request.status === "pending")
        .map((request) => ({
          ...request,
          start_date: request.start_date?.slice(0, 10) ?? null,
          end_date: request.end_date?.slice(0, 10) ?? null,
        })),
      moderationSummary: {
        openReports: Object.values(state.reports).filter((report) => report.status === "pending" || report.status === "reviewing").length,
        openAppeals: Object.values(state.appeals).filter((appeal) => appeal.status === "pending").length,
        error: null,
      },
    };
  }

  const supabase = await createClient();
  const [{ data: events }, { data: places }, { data: eventRequests }, moderationSummary] =
    await Promise.all([
      supabase.from("events").select("*").order("start_date"),
      supabase.from("places").select("*").order("name"),
      supabase
        .from("event_requests")
        .select("*, requester:profiles!event_requests_requested_by_fkey(id,full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      loadAdminModerationSummary(),
    ]);
  return {
    events: (events as EventRow[]) ?? [],
    places: (places as Place[]) ?? [],
    eventRequests: (eventRequests as EventRequestWithRequester[]) ?? [],
    moderationSummary,
  };
}
