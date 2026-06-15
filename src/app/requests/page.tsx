import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { RequestCard } from "@/components/ride-card";
import { GoogleSignInButton } from "@/components/auth-button";
import type { RideRequestWithRider } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const { user } = await getCurrentUser();
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  let requests: RideRequestWithRider[] = [];
  if (user) {
    const { data } = await supabase
      .from("ride_requests")
      .select("*, rider:profiles!ride_requests_rider_id_fkey(*), event:events(id,name,slug)")
      .eq("status", "active")
      .neq("rider_id", user.id)
      .gte("depart_at", nowIso)
      .order("depart_at", { ascending: true });
    requests = (data as RideRequestWithRider[]) ?? [];
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex items-end justify-between border-b border-stone-200 pb-4">
        <h1 className="text-2xl font-bold">Ride Requests</h1>
        {user ? (
          <Link
            href="/requests/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <Plus size={16} /> Post a request
          </Link>
        ) : (
          <GoogleSignInButton label="Sign in to post" />
        )}
      </div>

      {!user ? (
        <div className="rounded-2xl border border-dashed border-stone-300 p-10 text-center">
          <p className="mb-4 text-stone-500">Sign in to see ride requests from community members.</p>
          <GoogleSignInButton label="Sign in" />
        </div>
      ) : requests.length > 0 ? (
        <div className="grid gap-4">
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-500">
          <p className="mb-4 text-base">No ride requests yet.</p>
          <Link
            href="/requests/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <Plus size={16} /> Post a request
          </Link>
        </div>
      )}
    </div>
  );
}
