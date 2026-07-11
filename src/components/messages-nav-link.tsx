"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";

/**
 * Messages nav item with a combined unread badge for notifications and chats.
 */
export function MessagesNavLink({
  initialUnread,
}: {
  initialUnread: number;
}) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(initialUnread);
  const [syncedTo, setSyncedTo] = useState(initialUnread);

  if (syncedTo !== initialUnread) {
    setSyncedTo(initialUnread);
    setUnread(initialUnread);
  }

  const active = pathname.startsWith("/messages");
  const visibleUnread = unread;

  return (
    <Link
      href="/messages"
      prefetch
      aria-label="Messages"
      aria-current={active ? "page" : undefined}
      className={`relative ml-1 hidden h-[38px] w-[38px] items-center justify-center rounded-full transition-colors duration-200 hover:bg-tint hover:text-brand-700 sm:flex ${
        active ? "bg-tint text-brand-700 ring-1 ring-brand-200" : "text-[#57534e]"
      }`}
    >
      <MessageSquare size={19} strokeWidth={2} />
      {visibleUnread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
          {visibleUnread > 9 ? "9+" : visibleUnread}
        </span>
      )}
    </Link>
  );
}
