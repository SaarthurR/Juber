"use client";

/**
 * Former app-wide contact gate. Browsing is never blocked; write paths gate at
 * point of action via `hasContact` and `contactSetupDestination`.
 */
export function ContactRequiredGate({
  children,
}: {
  required?: boolean;
  children: React.ReactNode;
}) {
  return children;
}
