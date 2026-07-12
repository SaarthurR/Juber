import { BackButton } from "@/components/mobile/back-button";

export function SubHeader({
  title,
  subtitle,
  pill,
  right,
  backFallback,
  allowAnonymousBack = false,
}: {
  title: string;
  subtitle?: string;
  pill?: string;
  right?: React.ReactNode;
  backFallback?: string;
  allowAnonymousBack?: boolean;
}) {
  return (
    <header className="flex items-center gap-3 bg-cream px-4 py-3">
      <BackButton
        fallback={backFallback}
        allowAnonymousBrowse={allowAnonymousBack}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-[18px] font-extrabold tracking-[-0.02em] text-ink">
            {title}
          </h1>
          {pill && (
            <span className="shrink-0 rounded-full bg-sand px-2.5 py-0.5 text-[11px] font-bold text-sand-text">
              {pill}
            </span>
          )}
        </div>
        {subtitle && <p className="truncate text-xs text-muted-warm">{subtitle}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </header>
  );
}
