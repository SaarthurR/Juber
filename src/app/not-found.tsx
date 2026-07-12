import Link from "next/link";
import { RouteProgressLink as HomeLink } from "@/components/route-progress-link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Page not found</h1>
      <p className="mt-2 text-sm text-stone-500">
        This link may be outdated or the page was removed.
      </p>
      <HomeLink
        href="/"
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700"
      >
        Back to home
      </HomeLink>
      <p className="mt-4 text-sm text-muted-warm">
        On mobile?{" "}
        <Link href="/m" className="font-semibold text-brand-600 hover:text-brand-700">
          Open the mobile home
        </Link>
      </p>
    </div>
  );
}
