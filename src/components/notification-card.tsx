import { RouteProgressLink as Link } from "@/components/route-progress-link";
import { Bell, Car, Check, X, Ban, Handshake, MessageCircle, CalendarCheck } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { desktopNotificationHref } from "@/lib/notification-href";
import type { NotificationWithContext, NotificationType } from "@/lib/types";

const ICON: Record<NotificationType, React.ComponentType<{ size?: number; className?: string }>> = {
  seat_requested: Car,
  seat_confirmed: Check,
  seat_declined: X,
  seat_cancelled: Ban,
  ride_cancelled: Ban,
  ride_completed: Check,
  request_accepted: Handshake,
  new_message: MessageCircle,
  event_request_approved: CalendarCheck,
  event_request_rejected: X,
  moderation_report_submitted: Bell,
};

function firstName(name: string | null | undefined) {
  return name?.split(" ")[0] ?? "Someone";
}

function titleFor(n: NotificationWithContext): string {
  const who = firstName(n.actor?.full_name);
  switch (n.type) {
    case "seat_requested":
      return `${who} reserved a seat in your ride`;
    case "seat_confirmed":
      return "Your seat was confirmed";
    case "seat_declined":
      return "Your seat request was declined";
    case "seat_cancelled":
      return `${who} cancelled their seat`;
    case "ride_cancelled":
      return "Your ride was cancelled";
    case "ride_completed":
      return "Your ride was completed";
    case "request_accepted":
      return `${who} accepted your ride request`;
    case "new_message":
      return `One new message from ${who}`;
    case "event_request_approved":
      return "Your event board request was approved";
    case "event_request_rejected":
      return "Your event board request was not approved";
    case "moderation_report_submitted":
      return "A new report needs review";
  }
}

export function NotificationCard({ n }: { n: NotificationWithContext }) {
  const Icon = ICON[n.type] ?? Bell;
  const unread = !n.read_at;
  const route = n.ride
    ? `${n.ride.origin_label} → ${n.ride.destination_label}`
    : n.request
      ? `${n.request.origin_label} → ${n.request.destination_label}`
      : n.event
        ? n.event.name
        : null;
  const departs = n.ride
    ? format(new Date(n.ride.depart_at), "EEE, MMM d · h:mm a")
    : n.request
      ? format(new Date(n.request.depart_at), "EEE, MMM d")
      : null;

  const body = (
    <div
      className={`flex gap-3 p-4 transition ${
        unread ? "bg-brand-50/60 hover:bg-brand-50" : "hover:bg-stone-50"
      }`}
    >
      <div className="relative shrink-0">
        {n.actor ? (
          <Avatar src={n.actor.avatar_url} name={n.actor.full_name} size={42} />
        ) : (
          <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-stone-100 text-stone-400">
            <Icon size={20} />
          </span>
        )}
        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-brand-600 shadow ring-1 ring-stone-200">
          <Icon size={12} />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-stone-900">{titleFor(n)}</p>
        {route && (
          <p className="truncate text-sm text-stone-500">
            {route}
            {departs && <span className="text-stone-400"> · {departs}</span>}
          </p>
        )}
        {(n.type === "ride_cancelled" || n.type === "seat_cancelled") && n.message && (
          <p className="mt-1.5 rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-600">
            “{n.message}”
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="whitespace-nowrap text-xs text-stone-400">
          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
        </span>
        {unread && <span className="h-2 w-2 rounded-full bg-brand-600" />}
      </div>
    </div>
  );

  const href = desktopNotificationHref(n);
  if (href) {
    return (
      <Link href={href} className="block">
        {body}
      </Link>
    );
  }
  return body;
}
