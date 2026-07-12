export type AdminActionState = {
  status: "idle" | "error" | "success" | "info";
  message: string | null;
  resetKey: number;
};

export const ADMIN_ACTION_INITIAL: AdminActionState = {
  status: "idle",
  message: null,
  resetKey: 0,
};

export function adminActionError(message: string): AdminActionState {
  return { status: "error", message, resetKey: 0 };
}

export function adminActionInfo(message: string): AdminActionState {
  return { status: "info", message, resetKey: 0 };
}

export function adminActionSuccess(
  message: string,
  previousState: AdminActionState = ADMIN_ACTION_INITIAL,
): AdminActionState {
  return {
    status: "success",
    message,
    resetKey: previousState.resetKey + 1,
  };
}
