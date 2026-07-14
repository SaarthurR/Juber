export const MODERATION_ACTION_GROUPS = [
  {
    title: "Report status",
    actions: [
      { id: "reviewing", label: "Mark reviewing", tier: "benign" as const },
      { id: "dismiss", label: "Dismiss report", tier: "benign" as const },
      { id: "actioned", label: "Mark actioned", tier: "benign" as const },
    ],
  },
  {
    title: "Reported member",
    actions: [
      { id: "warn-reported", label: "Warn reported", tier: "warning" as const },
      { id: "ban-temp", label: "Temp ban", tier: "temp-ban" as const },
      { id: "ban-perm", label: "Permanent ban", tier: "permanent-ban" as const },
      { id: "unban", label: "Unban member", tier: "benign" as const },
    ],
  },
  {
    title: "Reporter",
    actions: [{ id: "warn-reporter", label: "Warn reporter", tier: "warning" as const }],
  },
] as const;

export const MODERATION_CONFIRM_REQUIRED_ACTIONS = new Set([
  "ban-perm",
  "ban-temp",
  "unban",
  "warn-reporter",
]);

export const MODERATION_DESTRUCTIVE_CONFIRM_ACTIONS = new Set([
  "ban-perm",
  "ban-temp",
  "unban",
  "warn-reporter",
]);

export function moderationActionButtonClass(
  tier: "benign" | "warning" | "temp-ban" | "permanent-ban",
) {
  const base =
    "h-11 rounded-xl border px-3.5 text-sm font-bold transition disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200";
  switch (tier) {
    case "warning":
      return `${base} border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`;
    case "temp-ban":
      return `${base} border-orange-200 bg-orange-50 text-orange-900 hover:bg-orange-100`;
    case "permanent-ban":
      return `${base} border-red-300 bg-red-50 text-red-800 hover:bg-red-100`;
    default:
      return `${base} border-stone-200 text-stone-700 hover:bg-stone-50`;
  }
}

export function moderationConfirmLabel(action: string, banDays?: 1 | 7 | 30) {
  switch (action) {
    case "ban-perm":
      return "Permanent ban";
    case "ban-temp":
      return `Confirm ${banDays ?? 7}-day ban`;
    case "unban":
      return "Unban member";
    case "warn-reporter":
      return "Warn reporter";
    default:
      return "Confirm";
  }
}
