import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { NewRideForm } from "@/components/new-ride-form";
import type { EventRow, Place } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewRidePage({
  searchParams,
}: {
  searchParams: Promise<{ event_id?: string | string[] }>;
}) {
  const sp = await searchParams;
  const eventId = Array.isArray(sp.event_id) ? sp.event_id[0] : sp.event_id;
  const minDepartDate = new Date();
  minDepartDate.setMinutes(minDepartDate.getMinutes() + 15);
  const minDepartAt = [
    minDepartDate.getFullYear(),
    String(minDepartDate.getMonth() + 1).padStart(2, "0"),
    String(minDepartDate.getDate()).padStart(2, "0"),
  ].join("-") + `T${String(minDepartDate.getHours()).padStart(2, "0")}:${String(
    minDepartDate.getMinutes(),
  ).padStart(2, "0")}`;
  const { user } = await getCurrentUser();
  if (!user) redirect("/");

  const supabase = await createClient();
  const [{ data: places }, { data: events }] = await Promise.all([
    supabase.from("places").select("*").eq("active", true),
    supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .order("start_date", { ascending: true }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-4xl font-black tracking-tight text-stone-900 sm:text-5xl">
        New Carpool
      </h1>
      <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-stone-600">
        Share your seats with the sangha. One car instead of four - that&apos;s ahimsa.
      </p>

      <div className="mt-8">
        <NewRideForm
          events={(events as EventRow[]) ?? []}
          places={(places as Place[]) ?? []}
          defaultEventId={eventId ?? ""}
          minDepartAt={minDepartAt}
        />
      </div>
    </div>
  );
}
