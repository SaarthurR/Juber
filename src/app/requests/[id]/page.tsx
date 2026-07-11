import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle2, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Avatar } from "@/components/ui/avatar";
import { RouteTrack } from "@/components/route-track";
import { GoogleSignInButton } from "@/components/auth-button";
import { openConversation } from "@/app/messages/actions";
import { acceptRideRequest } from "@/app/rides/actions";
import { CancelRequestButton } from "@/components/ride-actions";
import { PendingActionButton, PendingActionGroup } from "@/components/pending-action-button";
import type { EventRow, Profile, RideRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

type RequestDetail = RideRequest & {
  rider: Profile | null;
  accepted_driver: Profile | null;
  event: Pick<EventRow, "id" | "name" | "slug"> | null;
};

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await getCurrentUser();
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("ride_requests")
    .select("*, rider:profiles!ride_requests_rider_id_fkey(*), accepted_driver:profiles!ride_requests_accepted_driver_id_fkey(*), event:events(id,name,slug)")
    .eq("id", id)
    .single<RequestDetail>();

  if (!request) notFound();

  const isOwner = user?.id === request.rider_id;
  const isActive = request.status === "active";
  const dateLabel =
    request.earliest_date && request.latest_date
      ? `${format(new Date(`${request.earliest_date}T12:00:00`), "EEE, MMM d")} - ${format(
          new Date(`${request.latest_date}T12:00:00`),
          "EEE, MMM d",
        )}`
      : format(new Date(request.depart_at), "EEE, MMM d, h:mm a");
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/rides?tab=requests"
          aria-label="Back to ride requests"
          className="text-stone-500 transition hover:text-stone-800"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            Ride request details
          </h1>
          <p className="text-sm text-stone-500">
            {request.origin_label} &nbsp;-&gt;&nbsp; {request.destination_label}
          </p>
        </div>
      </div>

      {request.status !== "active" && (
        <div className="mb-6 rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4 text-sm font-semibold capitalize text-stone-600">
          {request.status === "fulfilled" && request.accepted_driver ? (
            <>
              This request was accepted by{" "}
              <Link
                href={`/profile/${request.accepted_driver_id}`}
                className="text-brand-600 hover:text-brand-700 hover:underline"
              >
                {request.accepted_driver.full_name ?? "a driver"}
              </Link>
              .
            </>
          ) : (
            <>This request is {request.status}.</>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-[#efe4d3] bg-white shadow-[0_24px_50px_-32px_rgba(92,59,46,0.35)]">
        <div className="bg-stone-900 px-6 py-6 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/60">
            Date window
          </p>
          <p className="mt-1 text-lg font-extrabold">{dateLabel}</p>
          {request.event && (
            <Link
              href={`/events/${request.event.slug}`}
              className="mt-4 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/15"
            >
              {request.event.name}
            </Link>
          )}
        </div>

        <div className="grid gap-8 p-6 md:grid-cols-[1fr_280px]">
          <div>
            <RouteTrack from={request.origin_label} to={request.destination_label} />

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <InfoCard label="Seats needed">
                {request.seats_needed} seat{request.seats_needed > 1 ? "s" : ""}
              </InfoCard>
              <InfoCard label="Max gas contribution">
                {request.max_price != null
                  ? `$${Number(request.max_price).toFixed(0)}/seat`
                  : "Flexible"}
              </InfoCard>
            </div>

            <p className="mt-8 text-sm font-bold uppercase tracking-wide text-[#57534e]">
              Notes
            </p>
            <div className="mt-3 rounded-xl bg-[#f7f5f2] p-4 text-[15px] leading-relaxed text-[#44403c]">
              {request.notes || "No additional notes."}
            </div>
          </div>

          <aside className="rounded-2xl border border-stone-200 bg-[#fffaf2] p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-stone-400">
              Rider
            </p>
            <Link
              href={`/profile/${request.rider_id}`}
              className="mt-3 flex items-center gap-3 transition-opacity hover:opacity-80"
            >
              <Avatar src={request.rider?.avatar_url} name={request.rider?.full_name} size={46} />
              <div>
                <p className="font-bold text-ink">{request.rider?.full_name ?? "Rider"}</p>
                {request.rider?.neighborhood && (
                  <p className="text-sm text-stone-500">{request.rider.neighborhood}</p>
                )}
              </div>
            </Link>

            <div className="mt-5 space-y-3">
              {!user ? (
                <GoogleSignInButton
                  className="flex w-full items-center justify-center rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700"
                />
              ) : isOwner ? (
                <OwnerActions
                  requestId={request.id}
                  isActive={isActive}
                  acceptedDriverId={request.accepted_driver_id}
                />
              ) : isActive ? (
                <ResponderActions requestId={request.id} />
              ) : request.status === "fulfilled" && user.id === request.accepted_driver_id ? (
                <BookedMessageButton
                  otherUserId={request.rider_id}
                  requestId={request.id}
                />
              ) : (
                <div className="rounded-xl bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-500">
                  This request is no longer open.
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-stone-400">{label}</p>
      <p className="mt-1 text-base font-extrabold text-stone-900">{children}</p>
    </div>
  );
}

function OwnerActions({
  requestId,
  isActive,
  acceptedDriverId,
}: {
  requestId: string;
  isActive: boolean;
  acceptedDriverId: string | null;
}) {
  if (!isActive) {
    return acceptedDriverId ? (
      <BookedMessageButton otherUserId={acceptedDriverId} requestId={requestId} />
    ) : (
      <div className="rounded-xl bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-500">
        This request is closed.
      </div>
    );
  }

  return (
    <CancelRequestButton requestId={requestId} />
  );
}

function ResponderActions({ requestId }: { requestId: string }) {
  return (
    <form action={acceptRideRequest.bind(null, requestId)}>
      <PendingActionButton
        actionKey={`accept-request-${requestId}`}
        pendingLabel="Accepting..."
        className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700 active:scale-[0.98]"
      >
        <CheckCircle2 size={17} />
        Accept request
      </PendingActionButton>
    </form>
  );
}

function BookedMessageButton({
  otherUserId,
  requestId,
}: {
  otherUserId: string;
  requestId: string;
}) {
  return (
    <PendingActionGroup>
      <form action={openConversation.bind(null, otherUserId)}>
        <input type="hidden" name="request_id" value={requestId} />
        <PendingActionButton
          actionKey={`message-request-${requestId}`}
          pendingLabel="Opening..."
          className="flex w-full items-center justify-center gap-2 rounded-full border border-stone-200 px-5 py-3 text-sm font-bold text-stone-700 transition hover:bg-white active:scale-[0.98]"
        >
          <MessageCircle size={17} />
          Message ride partner
        </PendingActionButton>
      </form>
    </PendingActionGroup>
  );
}
