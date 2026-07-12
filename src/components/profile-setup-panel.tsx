import Link from "next/link";
import type { SetupProgress } from "@/lib/setup-progress";

type SetupMode = "onboarding" | "contact_required";

const BANNER_COPY: Record<SetupMode, { title: string; body: string }> = {
  onboarding: {
    title: "Welcome to Juber",
    body: "A quick profile helps drivers and riders coordinate pickup. You can browse rides now and finish contact info when you are ready to book or post.",
  },
  contact_required: {
    title: "Contact info needed",
    body: "Add a phone or WhatsApp number so drivers and riders can coordinate pickup before you book or post.",
  },
};

const RATIONALE: Record<string, string> = {
  contact: "So drivers and riders can coordinate pickup.",
  home: "Private. Only shared with a confirmed ride partner.",
  vehicle: "Only needed if you plan to drive.",
};

export function setupRationale(section: keyof typeof RATIONALE) {
  return RATIONALE[section];
}

export function ProfileSetupPanel({
  mode,
  progress,
  skipHref,
  variant,
}: {
  mode: SetupMode;
  progress: SetupProgress;
  skipHref: string;
  variant: "desktop" | "mobile";
}) {
  const banner = BANNER_COPY[mode];
  const isMobile = variant === "mobile";

  return (
    <div className={isMobile ? "space-y-4" : "space-y-5"}>
      <div
        className={
          isMobile
            ? "rounded-[14px] border border-brand-200 bg-tint px-4 py-3"
            : "rounded-xl border border-brand-200 bg-tint px-4 py-3"
        }
      >
        <p
          className={
            isMobile
              ? "text-[14px] font-extrabold text-brand-700"
              : "text-sm font-extrabold text-brand-700"
          }
        >
          {banner.title}
        </p>
        <p
          className={
            isMobile
              ? "mt-1.5 text-[13px] font-medium leading-snug text-brand-700/90"
              : "mt-1.5 text-sm font-medium leading-snug text-brand-700/90"
          }
        >
          {banner.body}
        </p>
      </div>

      <section aria-labelledby="setup-progress-heading">
        <p
          id="setup-progress-heading"
          className={
            isMobile
              ? "text-[11px] font-extrabold uppercase tracking-[0.1em] text-brand-600"
              : "text-xs font-extrabold uppercase tracking-[0.08em] text-brand-600"
          }
        >
          Setup progress
        </p>
        <p
          aria-live="polite"
          className={
            isMobile
              ? "mt-1.5 text-[13px] font-semibold text-ink"
              : "mt-1.5 text-sm font-semibold text-ink"
          }
        >
          {progress.summary}
          {!progress.essentialsComplete && " — contact is required to book or post."}
        </p>
        <ul
          className={
            isMobile
              ? "mt-3 space-y-2 text-[13px] font-medium text-muted"
              : "mt-3 space-y-2 text-sm font-medium text-stone-600"
          }
          aria-label="Profile setup checklist"
        >
          {progress.items.map((item) => (
            <li key={item.id} className="flex min-h-11 items-center gap-2.5">
              <span
                aria-hidden="true"
                className={
                  item.done
                    ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white"
                    : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-bold text-muted-warm"
                }
              >
                {item.done ? "✓" : "·"}
              </span>
              <span>
                {item.label}
                {item.essential ? "" : " (optional)"}
                {item.done ? " — done" : " — not yet"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {mode === "onboarding" && (
        <Link
          href={skipHref}
          className={
            isMobile
              ? "inline-flex min-h-11 items-center text-[13px] font-bold text-brand-600 underline-offset-2 hover:underline"
              : "inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 underline-offset-2 hover:underline"
          }
        >
          Skip for now and browse rides
        </Link>
      )}
    </div>
  );
}
