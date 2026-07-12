import type { EventRow, NotificationType, NotificationWithContext } from "@/lib/types";

type NotificationHrefInput = Pick<
  NotificationWithContext,
  "type" | "ride_id" | "request_id" | "event_id" | "conversation_id"
> & {
  event?: Pick<EventRow, "slug"> | null;
};

export function desktopNotificationHref(notification: NotificationHrefInput): string | null {
  if (notification.ride_id) return `/rides/${notification.ride_id}`;
  if (notification.request_id) return `/requests/${notification.request_id}`;
  if (notification.event_id && notification.event?.slug) {
    return `/events/${notification.event.slug}`;
  }
  if (notification.conversation_id) {
    return `/messages/${notification.conversation_id}`;
  }
  if (notification.type === "event_request_rejected") return "/events";
  return null;
}

export function mobileNotificationHref(notification: NotificationHrefInput): string | null {
  const desktop = desktopNotificationHref(notification);
  if (!desktop) return null;
  if (desktop === "/events") return "/m/events";
  if (desktop.startsWith("/events/")) return `/m${desktop}`;
  if (desktop.startsWith("/rides/")) return `/m${desktop}`;
  if (desktop.startsWith("/requests/")) return `/m${desktop}`;
  if (desktop.startsWith("/messages/")) return `/m${desktop}`;
  return desktop;
}

export function notificationHrefForSurface(
  notification: NotificationHrefInput,
  surface: "desktop" | "mobile",
): string | null {
  return surface === "mobile"
    ? mobileNotificationHref(notification)
    : desktopNotificationHref(notification);
}

export function isEventRequestNotificationType(
  type: NotificationType,
): type is "event_request_approved" | "event_request_rejected" {
  return type === "event_request_approved" || type === "event_request_rejected";
}
