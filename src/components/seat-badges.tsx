import { User } from "lucide-react";

// Shows filled vs. open seats, like Moober's row of little person icons.
export function SeatBadges({
  total,
  available,
}: {
  total: number;
  available: number;
}) {
  const filled = Math.max(0, total - available);
  return (
    <div className="flex items-center gap-1" title={`${available} of ${total} seats open`}>
      {Array.from({ length: total }).map((_, i) => (
        <User
          key={i}
          size={18}
          className={i < filled ? "text-stone-700" : "text-stone-300"}
          fill={i < filled ? "currentColor" : "none"}
        />
      ))}
    </div>
  );
}
