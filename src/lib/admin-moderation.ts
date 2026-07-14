export type AdminReportScope = "open" | "closed";
export type AdminReportDirection = "made" | "received";
export type AdminReportActionCategory = "decision" | "system";
export type AdminVerdict = "violation" | "no_violation" | "inconclusive";
export type AdminEnforcement =
  | "none"
  | "warn_reported"
  | "warn_reporter"
  | "temporary_ban"
  | "permanent_ban";

export type AdminReportCursor = {
  createdAt: string;
  id: string;
};

export type AdminReportCase = {
  id: string;
  target_type: string;
  target_id: string | null;
  target_user_id: string | null;
  reporter_id: string;
  reason: string;
  details: string | null;
  status: string;
  resolution: string | null;
  verdict: AdminVerdict | null;
  enforcement: AdminEnforcement | null;
  verdict_version: number;
  ban_days: number | null;
  created_at: string;
  reviewed_at: string | null;
  reviewer_name: string | null;
  reporter_name: string | null;
  reported_name: string | null;
};

export type AdminReportList = {
  items: AdminReportCase[];
  nextCursor: AdminReportCursor | null;
  total: number;
};

export type AdminRetainedCounts = {
  made: { open: number; closed: number };
  received: { open: number; closed: number };
};

export type AdminIdentity = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  neighborhood: string | null;
  bio: string | null;
  car_make_model: string | null;
  car_color: string | null;
  created_at: string | null;
};

export type AdminReportAction = {
  id: string;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
  reviewer_name: string | null;
  current: boolean;
  superseded: boolean;
};

export type AdminReportContext = {
  report: AdminReportCase;
  reporter: AdminIdentity | null;
  reported: AdminIdentity | null;
  active_ban: {
    ban_id: string;
    report_id: string | null;
    reason: string | null;
    expires_at: string | null;
    created_at: string | null;
  } | null;
  retained_counts: {
    reporter: AdminRetainedCounts;
    reported: AdminRetainedCounts | null;
  };
  history: AdminReportAction[];
  can_revise: boolean;
  revision_block_reason: string | null;
};

export type AdminEvidence = {
  report_id: string;
  receipt_id: string;
  target_type: string;
  snapshot: Record<string, unknown>;
};

export type AdminDecisionResult = {
  reportId: string;
  verdict: AdminVerdict;
  enforcement: AdminEnforcement;
  status: string;
  verdictVersion: number;
  visibleToMember: string | null;
};

export type AdminDecisionState = {
  status: "idle" | "error" | "success";
  message: string | null;
  result: AdminDecisionResult | null;
};

export type AdminAppealCase = {
  id: string;
  user_id: string;
  member_name: string | null;
  text: string;
  created_at: string;
  ban_id: string | null;
};

export type AdminAppealList = {
  items: AdminAppealCase[];
  total: number;
  nextCursor: AdminReportCursor | null;
  continuation: boolean;
};

export const ADMIN_DECISION_INITIAL: AdminDecisionState = {
  status: "idle",
  message: null,
  result: null,
};

export const ADMIN_REPORT_REASONS = [
  "Harassment or abuse",
  "Unsafe or reckless driving",
  "No-show or cancellation abuse",
  "Spam or scam",
  "Inappropriate content",
  "Other",
] as const;

export const ADMIN_DECISION_OPTIONS: Record<AdminVerdict, AdminEnforcement[]> = {
  violation: ["none", "warn_reported", "temporary_ban", "permanent_ban"],
  no_violation: ["none", "warn_reporter"],
  inconclusive: ["none"],
};

export function adminDecisionOptions(verdict: AdminVerdict, hasReportedMember: boolean) {
  return hasReportedMember
    ? ADMIN_DECISION_OPTIONS[verdict]
    : ADMIN_DECISION_OPTIONS[verdict].filter((option) =>
        option === "none" || option === "warn_reporter"
      );
}

export function adminCaseReference(id: string) {
  return id.slice(0, 8).toUpperCase();
}

export function adminLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function adminReportHref(
  reportId: string | null,
  options: { scope?: AdminReportScope; reason?: string | null } = {},
) {
  const params = new URLSearchParams();
  if (options.scope && options.scope !== "open") params.set("scope", options.scope);
  if (options.reason) params.set("reason", options.reason);
  if (reportId) params.set("report", reportId);
  const query = params.toString();
  return `/admin/moderation${query ? `?${query}` : ""}`;
}

export function parseAdminReportList(data: unknown): AdminReportList {
  const value = rpcObject(data);
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(data)
      ? data
      : [];
  const items = rawItems.flatMap((item) => {
    const parsed = parseAdminReportCase(item);
    return parsed ? [parsed] : [];
  });
  const cursor = object(value.next_cursor ?? value.nextCursor);
  const createdAt = string(cursor.created_at ?? cursor.createdAt);
  const id = string(cursor.id);
  return {
    items,
    nextCursor: createdAt && id ? { createdAt, id } : null,
    total: number(value.total),
  };
}

export function parseAdminReportContext(data: unknown): AdminReportContext | null {
  const value = rpcObject(data);
  const report = parseAdminReportCase(value.report ?? value);
  if (!report) return null;
  const rawHistory = value.history_preview ?? value.history ?? value.decision_history;
  const history = Array.isArray(rawHistory)
    ? rawHistory.flatMap((item) => {
        const action = parseAdminReportAction(item);
        return action ? [action] : [];
      })
    : [];
  const decisionIndexes = history.flatMap((action, index) =>
    action.action === "report_status" || action.action === "verdict_revised" ? [index] : [],
  );
  return {
    report,
    reporter: parseIdentity(value.reporter),
    reported: parseIdentity(value.reported),
    active_ban: parseActiveBan(value.active_ban),
    retained_counts: parseRetainedCounts(value.retained_counts),
    history: history.map((action, index) => ({
      ...action,
      current: report.verdict !== null && index === decisionIndexes[0],
      superseded: decisionIndexes.includes(index) && index !== decisionIndexes[0],
    })),
    can_revise: Boolean(value.can_revise ?? value.revision_allowed),
    revision_block_reason: string(value.revision_block_reason),
  };
}

export function parseAdminEvidence(data: unknown): AdminEvidence | null {
  const value = rpcObject(data);
  const reportId = string(value.report_id ?? object(value.report).id);
  const receiptId = string(value.receipt_id ?? value.evidence_receipt_id ?? value.action_id);
  const parsedEvidence = object(value.evidence);
  const snapshot = Object.keys(parsedEvidence).length > 0
    ? parsedEvidence
    : object(value.snapshot);
  if (!reportId || !receiptId) return null;
  return {
    report_id: reportId,
    receipt_id: receiptId,
    target_type: string(value.target_type ?? object(value.report).target_type) ?? "unknown",
    snapshot,
  };
}

export function parseAdminReportActions(data: unknown) {
  const list = parseAdminReportListContainer(data);
  return {
    items: list.items.flatMap((item) => {
      const action = parseAdminReportAction(item);
      return action ? [action] : [];
    }),
    nextCursor: list.nextCursor,
    total: list.total,
  };
}

export function adminMemberReasonRequired(enforcement: AdminEnforcement) {
  return enforcement !== "none";
}

export function adminDecisionErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("stale") || normalized.includes("version")) {
    return "This case changed while you were reviewing it. Refresh before trying again.";
  }
  if (normalized.includes("evidence") || normalized.includes("receipt")) {
    return "Open this case's evidence again before submitting the decision.";
  }
  if (normalized.includes("active ban")) {
    return "This member already has an active ban from another case.";
  }
  return message || "Could not save the moderation decision.";
}

function parseAdminReportCase(data: unknown): AdminReportCase | null {
  const value = object(data);
  const id = string(value.id ?? value.report_id);
  const reporter = object(value.reporter);
  const reported = object(value.reported);
  const reporterId = string(value.reporter_id ?? reporter.id);
  const createdAt = string(value.created_at);
  if (!id || !reporterId || !createdAt) return null;
  return {
    id,
    target_type: string(value.target_type) ?? "unknown",
    target_id: string(value.target_id),
    target_user_id: string(value.target_user_id ?? reported.id),
    reporter_id: reporterId,
    reason: string(value.reason) ?? "other",
    details: string(value.details),
    status: string(value.status) ?? "pending",
    resolution: string(value.resolution),
    verdict: verdict(value.verdict),
    enforcement: enforcement(value.enforcement),
    verdict_version: number(value.verdict_version),
    ban_days: typeof value.ban_days === "number" ? value.ban_days : null,
    created_at: createdAt,
    reviewed_at: string(value.reviewed_at),
    reviewer_name: string(object(value.reviewer).full_name),
    reporter_name: string(value.reporter_name ?? reporter.full_name),
    reported_name: string(value.reported_name ?? reported.full_name),
  };
}

function parseIdentity(data: unknown): AdminIdentity | null {
  const value = object(data);
  const id = string(value.id);
  if (!id) return null;
  return {
    id,
    full_name: string(value.full_name),
    avatar_url: string(value.avatar_url),
    neighborhood: string(value.neighborhood),
    bio: string(value.bio),
    car_make_model: string(value.car_make_model),
    car_color: string(value.car_color),
    created_at: string(value.created_at),
  };
}

function parseActiveBan(data: unknown): AdminReportContext["active_ban"] {
  const value = object(data);
  const banId = string(value.ban_id);
  return banId
    ? {
        ban_id: banId,
        report_id: string(value.report_id),
        reason: string(value.reason),
        expires_at: string(value.expires_at),
        created_at: string(value.created_at),
      }
    : null;
}

function parseRetainedCounts(data: unknown): AdminReportContext["retained_counts"] {
  const value = object(data);
  return {
    reporter: parseMemberCounts(value.reporter),
    reported: value.reported ? parseMemberCounts(value.reported) : null,
  };
}

function parseMemberCounts(data: unknown): AdminRetainedCounts {
  const value = object(data);
  const made = object(value.made);
  const received = object(value.received);
  return {
    made: { open: number(made.open), closed: number(made.closed) },
    received: { open: number(received.open), closed: number(received.closed) },
  };
}

function parseAdminReportAction(data: unknown): AdminReportAction | null {
  const value = object(data);
  const id = string(value.id ?? value.action_id);
  const createdAt = string(value.created_at);
  if (!id || !createdAt) return null;
  return {
    id,
    action: string(value.action) ?? "report_status",
    detail: object(value.detail),
    created_at: createdAt,
    reviewer_name: string(
      value.reviewer_name ?? value.actor_name ?? object(value.actor).full_name,
    ),
    current: Boolean(value.current ?? object(value.detail).current),
    superseded: Boolean(value.superseded ?? object(value.detail).superseded),
  };
}

function parseAdminReportListContainer(data: unknown) {
  const value = rpcObject(data);
  const items = Array.isArray(value.items) ? value.items : Array.isArray(data) ? data : [];
  const cursor = object(value.next_cursor ?? value.nextCursor);
  const createdAt = string(cursor.created_at ?? cursor.createdAt);
  const id = string(cursor.id);
  return {
    items,
    nextCursor: createdAt && id ? { createdAt, id } : null,
    total: number(value.total),
  };
}

function rpcObject(data: unknown) {
  if (Array.isArray(data) && data.length === 1) return object(data[0]);
  return object(data);
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function string(value: unknown) {
  return typeof value === "string" && value.length ? value : null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function verdict(value: unknown): AdminVerdict | null {
  return value === "violation" || value === "no_violation" || value === "inconclusive"
    ? value
    : null;
}

function enforcement(value: unknown): AdminEnforcement | null {
  return value === "none"
    || value === "warn_reported"
    || value === "warn_reporter"
    || value === "temporary_ban"
    || value === "permanent_ban"
    ? value
    : null;
}
