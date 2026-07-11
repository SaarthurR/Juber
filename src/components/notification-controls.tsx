import type { ReactNode } from "react";
import type { NotificationBulkStatus } from "@/lib/notifications-controller";

export function NotificationBulkReadControl({
  unread,
  status,
  disabled = false,
  onActivate,
}: {
  unread: number;
  status: NotificationBulkStatus;
  disabled?: boolean;
  onActivate: () => void;
}) {
  const pending = status === "pending";
  const label =
    pending ? "Marking…" : status === "error" ? "Retry mark all read" : "Mark all read";

  return (
    <button
      type="button"
      onClick={onActivate}
      disabled={disabled || unread === 0 || pending}
      className="rounded-full px-2 py-1 text-xs font-bold text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

export function NotificationBulkReadFeedback({
  error,
  statusMessage,
}: {
  error: string | null;
  statusMessage: string | null;
}) {
  if (error) {
    return (
      <p role="alert" className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
        {error}
      </p>
    );
  }
  return statusMessage ? (
    <p
      aria-live="polite"
      className="mb-2 rounded-xl bg-green-50 px-3 py-2 text-xs text-green-700"
    >
      {statusMessage}
    </p>
  ) : null;
}

export function NotificationRowActions({
  title,
  unread,
  pending,
  disabled = false,
  error,
  onActivate,
  onRetry,
  children,
}: {
  title: string;
  unread: boolean;
  pending: boolean;
  disabled?: boolean;
  error: string | null;
  onActivate: () => void;
  onRetry: () => void;
  children?: ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onActivate}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        aria-label={`${title}${unread ? ", unread" : ""}`}
        className="block w-full text-left active:opacity-70 disabled:cursor-wait disabled:opacity-70"
      >
        {children}
      </button>
      {error ? (
        <div
          role="alert"
          className="mb-3 flex items-center justify-between gap-2 px-14 text-xs text-red-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={onRetry}
            aria-label={`Retry marking ${title} read`}
            className="shrink-0 rounded-full bg-red-50 px-3 py-1 font-bold text-red-700"
          >
            Retry
          </button>
        </div>
      ) : null}
    </>
  );
}
