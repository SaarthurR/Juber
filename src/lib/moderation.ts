export type ReportTargetType = "user" | "ride" | "ride_request" | "message";

export type ModerationBan = {
  reason: string;
  expires_at: string | null;
  created_at: string;
  ban_id: string;
};

export type ModerationWarning = {
  id: string;
  note: string | null;
  created_at: string;
};

export type ModerationSnapshot = {
  banned: boolean;
  ban: ModerationBan | null;
  hasPendingAppeal: boolean;
  warnings: ModerationWarning[];
};

export type ReportRow = {
  id: string;
  target_type: ReportTargetType;
  target_id: string;
  target_user_id: string | null;
  reporter_id: string;
  reason: string;
  status: "pending" | "reviewing" | "actioned" | "dismissed";
  resolution: string | null;
  created_at: string;
};

export type ModerationEvidence = {
  report?: {
    id: string;
    target_type: string;
    reason: string;
    details: string | null;
    status: string;
  };
  evidence?: Record<string, unknown>;
  reporter?: {
    full_name?: string | null;
  };
  reported?: {
    full_name?: string | null;
  };
};

export type ModerationEvidenceState = {
  selectedReportId: string | null;
  requestToken: number;
  loading: boolean;
  evidence: ModerationEvidence | null;
  error: string | null;
};

export type ModerationEvidenceAction =
  | { type: "select"; reportId: string }
  | {
      type: "resolve";
      reportId: string;
      requestToken: number;
      evidence: ModerationEvidence;
    }
  | {
      type: "reject";
      reportId: string;
      requestToken: number;
      error: string;
    };

export type BoundModerationActionTarget = {
  reportId: string;
  reportedUserId: string | null;
  reporterUserId: string;
  reason: string;
};

export function createModerationEvidenceState(
  selectedReportId: string | null,
): ModerationEvidenceState {
  return {
    selectedReportId,
    requestToken: selectedReportId ? 1 : 0,
    loading: selectedReportId !== null,
    evidence: null,
    error: null,
  };
}

export function moderationEvidenceReducer(
  state: ModerationEvidenceState,
  action: ModerationEvidenceAction,
): ModerationEvidenceState {
  if (action.type === "select") {
    if (action.reportId === state.selectedReportId) return state;
    return {
      selectedReportId: action.reportId,
      requestToken: state.requestToken + 1,
      loading: true,
      evidence: null,
      error: null,
    };
  }

  if (
    action.reportId !== state.selectedReportId
    || action.requestToken !== state.requestToken
  ) {
    return state;
  }

  if (action.type === "reject") {
    return {
      ...state,
      loading: false,
      evidence: null,
      error: action.error,
    };
  }

  if (action.evidence.report?.id !== action.reportId) {
    return {
      ...state,
      loading: false,
      evidence: null,
      error: "Evidence did not match the selected report.",
    };
  }

  return {
    ...state,
    loading: false,
    evidence: action.evidence,
    error: null,
  };
}

export function isModerationEvidenceReady(state: ModerationEvidenceState) {
  return (
    !state.loading
    && state.selectedReportId !== null
    && state.evidence?.report?.id === state.selectedReportId
  );
}

export function visibleModerationEvidence(state: ModerationEvidenceState) {
  return isModerationEvidenceReady(state) ? state.evidence : null;
}

export function bindModerationActionTarget(
  state: ModerationEvidenceState,
  report: ReportRow | null,
): BoundModerationActionTarget | null {
  if (
    !report
    || !isModerationEvidenceReady(state)
    || report.id !== state.selectedReportId
  ) {
    return null;
  }

  return {
    reportId: report.id,
    reportedUserId: report.target_user_id,
    reporterUserId: report.reporter_id,
    reason: report.reason,
  };
}

export type AppealRow = {
  id: string;
  user_id: string;
  text: string;
  status: "pending" | "granted" | "denied";
  created_at: string;
  ban_id: string;
};

export const REPORT_REASONS = [
  "Harassment or abuse",
  "Unsafe or reckless driving",
  "No-show or cancellation abuse",
  "Spam or scam",
  "Inappropriate content",
  "Other",
] as const;

export const MODERATION_ALLOWED_PATHS = new Set(["/banned", "/m/banned"]);

export function isModerationAllowedPath(pathname: string) {
  return (
    MODERATION_ALLOWED_PATHS.has(pathname)
    || pathname.startsWith("/auth/")
  );
}

export function bannedPagePath(isMobile: boolean) {
  return isMobile ? "/m/banned" : "/banned";
}

export function parseModerationNotices(raw: unknown): ModerationSnapshot {
  const payload = (raw ?? {}) as Record<string, unknown>;
  const banRaw = payload.ban as Record<string, unknown> | null | undefined;
  const ban =
    banRaw && typeof banRaw.reason === "string" && typeof banRaw.ban_id === "string"
      ? {
          reason: banRaw.reason,
          expires_at: typeof banRaw.expires_at === "string" ? banRaw.expires_at : null,
          created_at: typeof banRaw.created_at === "string" ? banRaw.created_at : "",
          ban_id: banRaw.ban_id,
        }
      : null;

  const warningsRaw = Array.isArray(payload.warnings) ? payload.warnings : [];
  const warnings = warningsRaw.flatMap((entry) => {
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.created_at !== "string") return [];
    return [{
      id: row.id,
      note: typeof row.note === "string" ? row.note : null,
      created_at: row.created_at,
    }];
  });

  return {
    banned: Boolean(payload.banned) || ban !== null,
    ban,
    hasPendingAppeal: Boolean(payload.has_pending_appeal),
    warnings,
  };
}

export function formatBanExpiry(expiresAt: string | null) {
  if (!expiresAt) return "Permanent";
  return new Date(expiresAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function mapReportSubmitError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("rate limit")) {
    return "You have submitted too many reports. Try again later.";
  }
  if (normalized.includes("duplicate") || normalized.includes("unique")) {
    return "You already have a pending report for this item.";
  }
  if (normalized.includes("not found")) {
    return "This item is no longer available to report.";
  }
  if (normalized.includes("account_suspended")) {
    return "Your account is suspended.";
  }
  return message || "Could not submit report.";
}

export function mapAppealSubmitError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("pending appeal")) {
    return "You already have a pending appeal.";
  }
  if (normalized.includes("active ban")) {
    return "Appeals are only available while your account is suspended.";
  }
  return message || "Could not submit appeal.";
}

export function moderationActionMessage(outcome: string, fallback: string) {
  switch (outcome) {
    case "updated":
      return "Report updated.";
    case "resolved":
      return "Appeal resolved.";
    case "already_terminal":
      return "This item was already reviewed.";
    case "missing":
      return "This item is no longer available.";
    default:
      return fallback;
  }
}
