import Link from "next/link";
import { MessagesSquare, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { GoogleSignInButton } from "@/components/auth-button";
import { SubHeader } from "@/components/mobile/sub-header";
import { MRequestCard } from "@/components/mobile/mobile-cards";
import type { RideRequestWithRider } from "@/lib/types";
import { throwReadError } from "@/lib/supabase/read-error";

export const dynamic = "force-dynamic";

export default async function MobileRequestsPage() {
  const { user } = await getCurrentUser();
  if (!user) {
    return (
      <div className="px-4 py-16 text-center">
        <MessagesSquare size={44} className="mx-auto text-brand-bright" />
        <h1 className="mt-5 text-xl font-extrabold text-ink">Sign in to view ride requests</h1>
        <p className="mt-2 text-sm text-muted-warm">Ride requests are available to signed-in community members.</p>
        <GoogleSignInButton className="mt-5" />
      </div>
    );
  }
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("ride_requests")
    .select("*, rider:profiles!ride_requests_rider_id_fkey(*), event:events(id,name,slug)")
    .eq("status", "active")
    .gte("latest_date", today)
    .order("depart_at", { ascending: true });
  throwReadError(error, "ride requests");

  const requests = (data as RideRequestWithRider[]) ?? [];

  return (
    <div className="pb-[calc(5rem+env(safe-area-inset-bottom)+1rem)]">
      <SubHeader
        title="Ride requests"
        pill={requests.length ? `${requests.length} open` : undefined}
        backFallback="/m"
      />

      <div className="px-4 pt-1">
        {requests.length ? (
          <div className="space-y-3">
            {requests.map((request) => (
              <MRequestCard key={request.id} request={request} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center px-6 pt-20 text-center">
      <div className="flex h-[108px] w-[108px] items-center justify-center rounded-full bg-tint">
        <MessagesSquare size={52} className="text-brand-bright" strokeWidth={1.8} />
      </div>
      <h2 className="mt-6 text-[21px] font-extrabold text-ink">No requests yet</h2>
      <p className="mt-2 max-w-[260px] text-[14.5px] leading-relaxed text-muted">
        When someone needs a ride to JCNC, it&apos;ll show up here. Be the first to ask the sangha.
      </p>
      <Link
        href="/m/requests/new"
        className="mt-7 inline-flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3.5 text-[14px] font-bold text-white shadow-[0_14px_24px_-12px_rgba(166,83,41,0.7)] transition active:scale-95"
      >
        <Plus size={17} strokeWidth={2.5} />
        Request a ride
      </Link>
    </div>
  );
}
