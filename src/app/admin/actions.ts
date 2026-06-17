"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";

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

export async function createEvent(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const name = str(formData.get("name"));
  if (!name) return;

  const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;

  const { error } = await supabase.from("events").insert({
    name,
    slug,
    description: str(formData.get("description")),
    venue_label: str(formData.get("venue_label")),
    start_date: str(formData.get("start_date")),
    end_date: str(formData.get("end_date")),
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/events");
  revalidatePath("/m/events");
}

export async function createPlace(formData: FormData) {
  const { supabase } = await requireAdmin();
  const name = str(formData.get("name"));
  if (!name) return;

  const { error } = await supabase.from("places").insert({
    name,
    address: str(formData.get("address")),
    kind: str(formData.get("kind")) ?? "neighborhood",
    event_id: str(formData.get("event_id")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function deleteEvent(eventId: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("events").delete().eq("id", eventId);
  revalidatePath("/admin");
  revalidatePath("/events");
  revalidatePath("/m/events");
}

export async function deletePlace(placeId: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("places").delete().eq("id", placeId);
  revalidatePath("/admin");
}

export async function approveEventRequest(requestId: string) {
  const { supabase, user } = await requireAdmin();
  const { data: request, error: readError } = await supabase
    .from("event_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (readError) throw new Error(readError.message);
  if (!request || request.status !== "pending") return;

  const slug = `${slugify(request.name)}-${Math.random().toString(36).slice(2, 6)}`;
  const { data: event, error: insertError } = await supabase
    .from("events")
    .insert({
      name: request.name,
      slug,
      description: request.description,
      venue_label: request.venue_label,
      start_date: request.start_date,
      end_date: request.end_date,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  const { error: updateError } = await supabase
    .from("event_requests")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      approved_event_id: event.id,
    })
    .eq("id", requestId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath("/admin");
  revalidatePath("/events");
  revalidatePath("/m/events");
}

export async function rejectEventRequest(requestId: string) {
  const { supabase, user } = await requireAdmin();
  const { error } = await supabase
    .from("event_requests")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function deleteEventRequest(requestId: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("event_requests").delete().eq("id", requestId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

type IcsEvent = {
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  source_url: string | null;
};

function unfoldIcs(text: string) {
  return text.replace(/\r?\n[ \t]/g, "");
}

function unescapeIcs(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function dateFromIcs(value: string, endDate = false) {
  const raw = value.trim().slice(0, 8);
  if (!/^\d{8}$/.test(raw)) return null;
  const date = new Date(Date.UTC(
    Number(raw.slice(0, 4)),
    Number(raw.slice(4, 6)) - 1,
    Number(raw.slice(6, 8)),
  ));
  if (endDate) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function parseJcncIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  for (const block of unfoldIcs(text).split("BEGIN:VEVENT").slice(1)) {
    const lines = block.split(/\r?\n/);
    const get = (field: string) => {
      const line = lines.find((l) => l.startsWith(field) || l.startsWith(`${field};`));
      return line ? unescapeIcs(line.slice(line.indexOf(":") + 1)) : null;
    };

    const name = get("SUMMARY");
    if (!name) continue;

    events.push({
      name,
      description: get("DESCRIPTION"),
      start_date: dateFromIcs(get("DTSTART") ?? ""),
      end_date: dateFromIcs(get("DTEND") ?? "", true),
      source_url: get("URL"),
    });
  }
  return events;
}

function daysBetween(start: string | null, end: string | null) {
  if (!start || !end) return 0;
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
}

function likelyHighTraffic(event: IcsEvent) {
  const haystack = `${event.name} ${event.description ?? ""}`.toLowerCase();
  const keywords = [
    "anniversary",
    "paryushan",
    "das lakshan",
    "mahavir",
    "janma",
    "picnic",
    "mela",
    "festival",
    "maha",
    "kalyanak",
    "pratistha",
    "cultural",
    "yatra",
  ];
  return daysBetween(event.start_date, event.end_date) >= 2 || keywords.some((k) => haystack.includes(k));
}

export async function importJcncEvents() {
  const { supabase, user } = await requireAdmin();
  const response = await fetch("https://jcnc.org/events/?ical=1", {
    headers: { accept: "text/calendar" },
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error("Could not load JCNC calendar.");

  const imported = parseJcncIcs(await response.text()).filter(likelyHighTraffic);
  if (!imported.length) {
    revalidatePath("/admin");
    return;
  }

  const sourceUrls = imported.map((e) => e.source_url).filter(Boolean) as string[];
  const { data: existing } = sourceUrls.length
    ? await supabase
        .from("event_requests")
        .select("source_url")
        .eq("source", "jcnc")
        .in("source_url", sourceUrls)
    : { data: [] };
  const seen = new Set((existing ?? []).map((e) => e.source_url as string));

  const rows = imported
    .filter((e) => !e.source_url || !seen.has(e.source_url))
    .map((e) => ({
      name: e.name,
      description: e.description
        ? `Likely high-traffic JCNC event imported from jcnc.org.\n\n${e.description}`
        : "Likely high-traffic JCNC event imported from jcnc.org.",
      venue_label: "JCNC, Milpitas",
      start_date: e.start_date,
      end_date: e.end_date,
      source: "jcnc",
      source_url: e.source_url,
      expected_traffic: "high",
      requested_by: user.id,
    }));

  if (rows.length) {
    const { error } = await supabase.from("event_requests").insert(rows);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/admin");
}
