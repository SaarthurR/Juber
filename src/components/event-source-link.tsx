import { parseEventSourceUrl } from "@/lib/event-url";

export function EventSourceLink({
  href,
  className = "inline-block text-sm font-bold text-brand-600 hover:text-brand-700",
  label = "View event link",
}: {
  href: string;
  className?: string;
  label?: string;
}) {
  const safeHref = parseEventSourceUrl(href);
  if (!safeHref) return null;

  return (
    <a href={safeHref} target="_blank" rel="noopener noreferrer" className={className}>
      {label}
    </a>
  );
}
