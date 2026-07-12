import { notFound } from "next/navigation";
import { format } from "date-fns";
import { MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { MAvatar } from "@/components/mobile/m-avatar";
import { SubHeader } from "@/components/mobile/sub-header";
import { RouteTrack } from "@/components/route-track";
import { GoogleSignInButton } from "@/components/auth-button";
import { openConversation } from "@/app/messages/actions";
import { CancelRequestButton, AcceptRequestButton } from "@/components/ride-actions";
import { ReportTargetButton } from "@/components/report-target-button";
import { PendingActionButton, PendingActionGroup } from "@/components/pending-action-button";
import { formatRideDateTime } from "@/lib/date-time";
import type { EventRow, Profile, RideRequest } from "@/lib/types";
import { throwReadError } from "@/lib/supabase/read-error";

export const dynamic = "force-dynamic";

type RequestDetail = RideRequest & {
  rider: Profile | null;
  accepted_driver: Profile | null;
  event: Pick<EventRow, "id" | "name" | "slug"> | null;
};

// Mobile ride-request detail. Mirrors the desktop /requests/[id] data + actions
// but renders inside the /m phone shell so mobile users no longer get bounced
// to the desktop layout from request cards and notifications.
export default async function MobileRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await getCurrentUser();
  if (!user) {
    return (
      <div className="px-4 py-16 text-center">
        <MessageCircle size={44} className="mx-auto text-brand-bright" />
        <h1 className="mt-5 text-xl font-extrabold text-ink">Sign in to view ride requests</h1>
        <p className="mt-2 text-sm text-muted-warm">Ride requests are available to signed-in community members.</p>
        <GoogleSignInButton className="mt-5" />
      </div>
    );
  }
  const supabase = await createClient();

  const { data: request, error } = await supabase
    .from("ride_requests")
    .select(
      "*, rider:profiles!ride_requests_rider_id_fkey(*), accepted_driver:profiles!ride_requests_accepted_driver_id_fkey(*), event:events(id,name,slug)",
    )
    .eq("id", id)
    .maybeSingle<RequestDetail>();

  throwReadError(error, "ride request");
  if (!request) notFound();

  const isOwner = user?.id === request.rider_id;
  const isActive = request.status === "active";
  const dateLabel =
    request.earliest_date && request.latest_date
      ? `${format(new Date(`${request.earliest_date}T12:00:00`), "EEE, MMM d")} – ${format(
          new Date(`${request.latest_date}T12:00:00`),
          "EEE, MMM d",
        )}`
      : formatRideDateTime(request.depart_at, "EEE, MMM d, h:mm a");

  return (
    <div className="pb-[calc(5rem+env(safe-area-inset-bottom)+1rem)]">
      <SubHeader
        title="Ride request"
        subtitle={`${request.origin_label} → ${request.destination_label}`}
        backFallback="/m/requests"
        right={
          user && !isOwner ? (
            <ReportTargetButton targetType="ride_request" targetId={request.id} variant="mobile" />
          ) : undefined
        }
      />

      <div className="space-y-4 px-4 pt-1">
        {!isActive && (
          <div className="rounded-2xl border border-border bg-tint px-4 py-3 text-[13px] font-semibold capitalize text-muted">
            {request.status === "fulfilled" && request.accepted_driver
              ? `Accepted by ${request.accepted_driver.full_name ?? "a driver"}.`
              : `This request is ${request.status}.`}
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="bg-stone-900 px-5 py-5 text-white">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">
              Date window
            </p>
            <p className="mt-1 text-[17px] font-extrabold">{dateLabel}</p>
            {request.event && (
              <span className="mt-3 inline-block rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white">
                {request.event.name}
              </span>
            )}
          </div>

          <div className="p-5">
            <RouteTrack from={request.origin_label} to={request.destination_label} />

            <div className="mt-6 grid grid-cols-2 gap-3">
              <InfoCard label="Seats needed">
                {request.seats_needed} seat{request.seats_needed > 1 ? "s" : ""}
              </InfoCard>
              <InfoCard label="Max gas">
                {request.max_price != null
                  ? `$${Number(request.max_price).toFixed(0)}/seat`
                  : "Flexible"}
              </InfoCard>
            </div>

            <p className="mt-6 text-[11px] font-bold uppercase tracking-wide text-muted-warm">
              Notes
            </p>
            <div className="mt-2 rounded-xl bg-[#f7f5f2] p-4 text-[14px] leading-relaxed text-[#44403c]">
              {request.notes || "No additional notes."}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-[#fffaf2] p-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-warm">Rider</p>
          <div className="mt-3 flex items-center gap-3">
            <MAvatar
              src={request.rider?.avatar_url}
              name={request.rider?.full_name}
              seed={request.rider_id}
              size={46}
            />
            <div className="min-w-0">
              <p className="truncate font-bold text-ink">{request.rider?.full_name ?? "Rider"}</p>
              {request.rider?.neighborhood && (
                <p className="truncate text-sm text-muted-warm">{request.rider.neighborhood}</p>
              )}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {!user ? (
              <GoogleSignInButton className="flex w-full items-center justify-center rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white transition active:scale-[0.98]" />
            ) : isOwner ? (
              isActive ? (
                <CancelRequestButton requestId={request.id} base="/m" />
              ) : request.accepted_driver_id ? (
                <BookedMessageButton otherUserId={request.accepted_driver_id} requestId={request.id} />
              ) : (
                <ClosedNote />
              )
            ) : isActive ? (
              <AcceptRequestButton
                requestId={request.id}
                base="/m/messages"
                actionKeyPrefix="mobile-accept-request"
              />
            ) : request.status === "fulfilled" && user.id === request.accepted_driver_id ? (
              <BookedMessageButton otherUserId={request.rider_id} requestId={request.id} />
            ) : (
              <ClosedNote />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-warm">{label}</p>
      <p className="mt-1 text-[15px] font-extrabold text-ink">{children}</p>
    </div>
  );
}

function ClosedNote() {
  return (
    <div className="rounded-xl bg-tint px-4 py-3 text-sm font-semibold text-muted">
      This request is no longer open.
    </div>
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
        <input type="hidden" name="base" value="/m/messages" />
        <PendingActionButton
          actionKey={`mobile-message-request-${requestId}`}
          pendingLabel="Opening chat..."
          className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-white px-5 py-3 text-sm font-bold text-brand-700 transition active:scale-[0.98]"
        >
          <MessageCircle size={17} />
          Message ride partner
        </PendingActionButton>
      </form>
    </PendingActionGroup>
  );
}
