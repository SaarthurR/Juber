import type { AdminActionState } from "@/lib/admin-action-state";

export function AdminActionFeedback({
  state,
  className,
}: {
  state: AdminActionState;
  className?: string;
}) {
  if (!state.message || state.status === "idle") return null;

  const role = state.status === "error" ? "alert" : "status";
  const tone =
    state.status === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : state.status === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-stone-200 bg-stone-50 text-stone-700";

  return (
    <p
      role={role}
      className={
        className ??
        `rounded-xl border px-4 py-3 text-sm font-semibold ${tone}`
      }
    >
      {state.message}
    </p>
  );
}
