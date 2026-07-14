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
  outcomeId: string;
  acknowledgedAt: string | null;
};

export type ModerationOutcomeType =
  | "warning"
  | "ban"
  | "unban"
  | "appeal_granted"
  | "appeal_denied";

export type ModerationOutcome = {
  id: string;
  type: ModerationOutcomeType;
  sourceActionId: string;
  acknowledgedAt: string | null;
  createdAt: string;
  memberReason: string | null;
};

export type ModerationAppeal = {
  id: string;
  status: "pending" | "granted" | "denied";
  createdAt: string;
  resolvedAt: string | null;
};

export type ModerationOutcomeCursor = {
  id: string;
  createdAt: string;
};

export type ModerationSnapshot = {
  banned: boolean;
  ban: ModerationBan | null;
  hasPendingAppeal: boolean;
  appeal: ModerationAppeal | null;
  warnings: ModerationWarning[];
  outcomes: ModerationOutcome[];
  outcomeCursor: ModerationOutcomeCursor | null;
  loadError?: boolean;
};

export const EMPTY_MODERATION_SNAPSHOT: ModerationSnapshot = {
  banned: false,
  ban: null,
  hasPendingAppeal: false,
  appeal: null,
  warnings: [],
  outcomes: [],
  outcomeCursor: null,
};

export const REPORT_REASONS = [
  "Harassment or abuse",
  "Unsafe or reckless driving",
  "No-show or cancellation abuse",
  "Spam or scam",
  "Inappropriate content",
  "Other",
] as const;

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
    if (
      typeof row.id !== "string"
      || typeof row.created_at !== "string"
      || typeof row.outcome_id !== "string"
    ) return [];
    return [{
      id: row.id,
      note: typeof row.note === "string" ? row.note : null,
      created_at: row.created_at,
      outcomeId: row.outcome_id,
      acknowledgedAt:
        typeof row.acknowledged_at === "string" ? row.acknowledged_at : null,
    }];
  });

  const appealRaw = payload.appeal as Record<string, unknown> | null | undefined;
  const appealStatus = appealRaw?.status;
  const appeal: ModerationAppeal | null = appealRaw
    && typeof appealRaw.id === "string"
    && (appealStatus === "pending"
      || appealStatus === "granted"
      || appealStatus === "denied")
    && typeof appealRaw.created_at === "string"
      ? {
          id: appealRaw.id,
          status: appealStatus as ModerationAppeal["status"],
          createdAt: appealRaw.created_at,
          resolvedAt:
            typeof appealRaw.resolved_at === "string" ? appealRaw.resolved_at : null,
        }
      : null;

  const outcomeTypes = new Set<ModerationOutcomeType>([
    "warning",
    "ban",
    "unban",
    "appeal_granted",
    "appeal_denied",
  ]);
  const outcomesRaw = Array.isArray(payload.outcomes) ? payload.outcomes : [];
  const outcomes = outcomesRaw.flatMap((entry) => {
    const row = entry as Record<string, unknown>;
    if (
      typeof row.id !== "string"
      || typeof row.type !== "string"
      || !outcomeTypes.has(row.type as ModerationOutcomeType)
      || typeof row.source_action_id !== "string"
      || typeof row.created_at !== "string"
    ) return [];
    return [{
      id: row.id,
      type: row.type as ModerationOutcomeType,
      sourceActionId: row.source_action_id,
      acknowledgedAt:
        typeof row.acknowledged_at === "string" ? row.acknowledged_at : null,
      createdAt: row.created_at,
      memberReason:
        row.type === "unban" && typeof row.member_reason === "string"
          ? row.member_reason
          : null,
    }];
  });

  const cursorRaw = payload.outcome_cursor as Record<string, unknown> | null | undefined;
  const outcomeCursor = cursorRaw
    && typeof cursorRaw.id === "string"
    && typeof cursorRaw.created_at === "string"
      ? { id: cursorRaw.id, createdAt: cursorRaw.created_at }
      : null;

  return {
    banned: Boolean(payload.banned) || ban !== null,
    ban,
    hasPendingAppeal: Boolean(payload.has_pending_appeal),
    appeal,
    warnings,
    outcomes,
    outcomeCursor,
  };
}

export function formatBanExpiry(expiresAt: string | null) {
  if (!expiresAt) return "Permanent";
  return new Date(expiresAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatBanLength(ban: ModerationBan) {
  if (!ban.expires_at) return "Permanent";
  const start = new Date(ban.created_at).getTime();
  const end = new Date(ban.expires_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return "Temporary";
  }
  const days = Math.max(1, Math.round((end - start) / 86_400_000));
  return `${days} day${days === 1 ? "" : "s"}`;
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
