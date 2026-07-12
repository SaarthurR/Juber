export type ModerationActionState = {
  status: "idle" | "error" | "success" | "info" | "pending";
  message: string | null;
  resetKey: number;
};

export const MODERATION_ACTION_INITIAL: ModerationActionState = {
  status: "idle",
  message: null,
  resetKey: 0,
};

export function moderationActionError(message: string): ModerationActionState {
  return { status: "error", message, resetKey: 0 };
}

export function moderationActionSuccess(
  message: string,
  previousState: ModerationActionState = MODERATION_ACTION_INITIAL,
): ModerationActionState {
  return {
    status: "success",
    message,
    resetKey: previousState.resetKey + 1,
  };
}

export function moderationActionInfo(message: string): ModerationActionState {
  return { status: "info", message, resetKey: 0 };
}
