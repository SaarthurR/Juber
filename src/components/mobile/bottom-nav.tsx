"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Car, MessageSquare, Calendar, User, Plus } from "lucide-react";

const TABS = [
  { href: "/m", label: "Rides", icon: Car },
  { href: "/m/requests", label: "Requests", icon: MessageSquare },
  { href: "/m/events", label: "Events", icon: Calendar },
  { href: "/m/profile", label: "Profile", icon: User },
] as const;

// Only the four tab roots show the bar; sub-pages (trip details, forms) use
// their own sticky footers instead.
const TAB_ROOTS = new Set<string>(TABS.map((t) => t.href));
const TAB_COLUMNS: Record<(typeof TABS)[number]["href"], number> = {
  "/m": 0,
  "/m/requests": 1,
  "/m/events": 3,
  "/m/profile": 4,
};

export function BottomNav() {
  const pathname = usePathname();
  if (!pathname || !TAB_ROOTS.has(pathname)) return null;

  return <VisibleBottomNav key={pathname} pathname={pathname} />;
}

function VisibleBottomNav({ pathname }: { pathname: string }) {
  const [selectedPath, setSelectedPath] = useState(pathname);

  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)];
  const activeColumn = TAB_COLUMNS[selectedPath as keyof typeof TAB_COLUMNS];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[440px] border-t border-border bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="relative grid h-20 grid-cols-5 items-center">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-2 h-14 w-1/5 px-1.5"
          style={{ transform: `translateX(${activeColumn * 100}%)` }}
        >
          <span className="block h-full w-full rounded-2xl bg-tint ring-1 ring-brand-100" />
        </span>
        {left.map((t) => (
          <TabItem
            key={t.href}
            {...t}
            active={selectedPath === t.href}
            onSelect={setSelectedPath}
          />
        ))}

        {/* Center Post action — raised FAB */}
        <div className="flex justify-center">
          <Link
            href="/rides/new"
            aria-label="Post a ride"
            className="-mt-[22px] flex h-[58px] w-[58px] items-center justify-center rounded-[19px] bg-brand-600 text-white shadow-[0_14px_24px_-12px_rgba(166,83,41,0.7)] transition active:scale-95"
          >
            <Plus size={26} strokeWidth={2.5} />
          </Link>
        </div>

        {right.map((t) => (
          <TabItem
            key={t.href}
            {...t}
            active={selectedPath === t.href}
            onSelect={setSelectedPath}
          />
        ))}
      </div>
    </nav>
  );
}

function TabItem({
  href,
  label,
  icon: Icon,
  active,
  onSelect,
}: {
  href: string;
  label: string;
  icon: typeof Car;
  active: boolean;
  onSelect: (href: string) => void;
}) {
  return (
    <Link
      href={href}
      prefetch
      onClick={() => onSelect(href)}
      aria-current={active ? "page" : undefined}
      className={`relative z-10 flex min-h-14 flex-col items-center justify-center gap-1 ${
        active ? "text-brand-600" : "text-muted-warm"
      }`}
    >
      <Icon size={23} strokeWidth={active ? 2.4 : 2} />
      <span className={`text-[10px] ${active ? "font-bold" : "font-semibold"}`}>{label}</span>
    </Link>
  );
}
