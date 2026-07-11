import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { MobileRequestForm } from "@/components/mobile/request-form";
import type { Place } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MobileNewRequestPage() {
  const { user } = await getCurrentUser();
  if (!user) redirect("/m");

  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const { data: places } = await supabase
    .from("places")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });

  const neighborhoods = ((places as Place[]) ?? []).filter((p) => p.kind !== "event");
  const options = neighborhoods.length ? neighborhoods : ((places as Place[]) ?? []);

  return <MobileRequestForm options={options} today={today} />;
}
