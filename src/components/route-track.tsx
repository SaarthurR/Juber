export function RouteTrack({ from, to }: { from: string; to: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="font-medium text-stone-900 truncate">{from}</span>
      <div className="flex min-w-0 flex-1 items-center gap-0.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-brand-600 bg-white" />
        <span className="h-0.5 flex-1 bg-gold" />
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600" />
      </div>
      <span className="font-medium text-stone-900 truncate">{to}</span>
    </div>
  );
}
