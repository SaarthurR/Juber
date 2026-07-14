"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";
import { actionErrorMessage } from "@/lib/action-lifecycle";
import {
  moderationActionError,
  moderationActionInfo,
  moderationActionSuccess,
  type ModerationActionState,
} from "@/lib/moderation-action-state";
import {
  mapAppealSubmitError,
  mapReportSubmitError,
  type ReportTargetType,
} from "@/lib/moderation";
import { requireAdminProfile } from "@/lib/moderation-server";
import {
  ADMIN_DECISION_OPTIONS,
  adminDecisionErrorMessage,
  type AdminDecisionState,
  type AdminEnforcement,
  type AdminVerdict,
} from "@/lib/admin-moderation";
import { getDemoRuntime, getDemoStore } from "@/lib/demo/runtime";

function str(v: FormDataEntryValue | null) {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}

function revalidateModerationPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/moderation");
  revalidatePath("/m/admin");
  revalidatePath("/banned");
  revalidatePath("/m/banned");
}

async function requireSignedIn() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) throw new Error("Sign in required");
  return { supabase, user };
}

export async function submitReportAction(
  previousState: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  try {
    const targetType = str(formData.get("target_type")) as ReportTargetType | null;
    const targetId = str(formData.get("target_id"));
    const reason = str(formData.get("reason"));
    const details = str(formData.get("details"));
    const includeMessageContext =
      targetType === "message"
      && formData.get("include_message_context") === "on";

    if (!targetType || !targetId || !reason) {
      return moderationActionError("Choose a reason before submitting.");
    }

    const demo = await getDemoRuntime();
    if (demo) {
      const targetUserId = targetType === "user"
        ? demo.state.profiles[targetId]?.id
        : targetType === "ride"
          ? demo.state.rides[targetId]?.driver_id
          : targetType === "ride_request"
            ? demo.state.rideRequests[targetId]?.rider_id
            : demo.state.messages[targetId]?.sender_id;
      if (!targetUserId) return moderationActionError("Could not submit report.");
      await getDemoStore().mutate(demo.id, demo.revision, {
        type: "submit_report",
        actorId: demo.activeActorId,
        targetType,
        targetId,
        targetUserId,
        reason,
        details: includeMessageContext ? details ?? "Included message context." : details,
      });
      revalidateModerationPaths();
      return moderationActionSuccess("Report submitted. Our team will review it.", previousState);
    }

    const { supabase } = await requireSignedIn();

    const { data, error } = await supabase.rpc("submit_report", {
      p_target_type: targetType,
      p_target_id: targetId,
      p_reason: reason,
      p_details: details,
      p_include_message_context: includeMessageContext,
    });

    if (error) {
      return moderationActionError(mapReportSubmitError(error.message));
    }
    if (!data) {
      return moderationActionError("Could not submit report.");
    }

    return moderationActionSuccess(
      "Report submitted. Our team will review it.",
      previousState,
    );
  } catch (error) {
    return moderationActionError(
      actionErrorMessage(error, "Could not submit report."),
    );
  }
}

export async function submitAppealAction(
  previousState: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  try {
    const text = str(formData.get("text"));
    if (!text) return moderationActionError("Tell us why this suspension should be lifted.");

    const demo = await getDemoRuntime();
    if (demo) {
      const ban = Object.values(demo.state.bans).find((item) => item.userId === demo.activeActorId && !item.liftedAt && (!item.expiresAt || item.expiresAt > demo.state.now));
      if (!ban) return moderationActionError("This suspension is no longer active.");
      await getDemoStore().mutate(demo.id, demo.revision, { type: "submit_appeal", actorId: demo.activeActorId, banId: ban.id, text });
      revalidateModerationPaths();
      return moderationActionSuccess("Appeal submitted. You can check its status here.", previousState);
    }

    const { supabase } = await requireSignedIn();

    const { data, error } = await supabase.rpc("submit_appeal", { p_text: text });
    if (error) {
      return moderationActionError(mapAppealSubmitError(error.message));
    }
    if (!data) {
      return moderationActionError("Could not submit appeal.");
    }

    revalidateModerationPaths();
    return moderationActionSuccess(
      "Appeal submitted. You can check its status here.",
      previousState,
    );
  } catch (error) {
    return moderationActionError(
      actionErrorMessage(error, "Could not submit appeal."),
    );
  }
}

export async function adminCloseReportCaseAction(
  previousState: AdminDecisionState,
  formData: FormData,
): Promise<AdminDecisionState> {
  const reportId = str(formData.get("report_id"));
  const receiptId = str(formData.get("evidence_receipt_id"));
  const verdict = str(formData.get("verdict")) as AdminVerdict | null;
  const enforcement = str(formData.get("enforcement")) as AdminEnforcement | null;
  const expectedVersion = Number(formData.get("expected_version"));
  const memberReason = str(formData.get("member_reason"));
  const internalNote = str(formData.get("internal_note"));
  const rawBanDays = str(formData.get("ban_days"));
  const banDays = rawBanDays ? Number(rawBanDays) : null;

  if (!reportId || !receiptId || !verdict || !enforcement) {
    return adminDecisionError("Open the evidence and complete the decision first.");
  }
  if (!ADMIN_DECISION_OPTIONS[verdict]?.includes(enforcement)) {
    return adminDecisionError("Choose an action allowed for this decision.");
  }
  if (enforcement !== "none" && !memberReason) {
    return adminDecisionError("Add the reason that will be visible to the affected member.");
  }
  if (memberReason && memberReason.length > 500) {
    return adminDecisionError("Member-facing reason must be 500 characters or fewer.");
  }
  if (internalNote && internalNote.length > 4000) {
    return adminDecisionError("Internal note must be 4000 characters or fewer.");
  }
  if (enforcement === "temporary_ban" && ![1, 7, 30].includes(banDays ?? 0)) {
    return adminDecisionError("Choose a 1, 7, or 30 day ban.");
  }

  try {
    const demo = await getDemoRuntime();
    if (demo) {
      const next = await getDemoStore().mutate(demo.id, demo.revision, {
        type: "close_report",
        actorId: demo.activeActorId,
        reportId,
        expectedVersion,
        receiptId,
        verdict,
        enforcement,
        resolution: memberReason ?? internalNote ?? "No member action required.",
        banDays: enforcement === "temporary_ban" ? banDays as 1 | 7 | 30 : undefined,
      });
      const report = next.state.reports[reportId];
      revalidateModerationPaths();
      return {
        status: "success",
        message: "Decision saved. The case is now in Closed reports.",
        result: {
          reportId,
          verdict,
          enforcement,
          status: report.status,
          verdictVersion: report.verdictVersion,
          visibleToMember: memberReason,
        },
      };
    }
    const { supabase } = await requireAdminProfile();
    const { data, error } = await supabase.rpc("admin_close_report_case", {
      p_report_id: reportId,
      p_expected_version: expectedVersion,
      p_evidence_receipt_id: receiptId,
      p_verdict: verdict,
      p_enforcement: enforcement,
      p_member_reason: memberReason,
      p_internal_note: internalNote,
      p_ban_days: enforcement === "temporary_ban" ? banDays : null,
    });
    if (error) return adminDecisionError(adminDecisionErrorMessage(error.message));
    const payload = data as Record<string, unknown> | null;
    if (payload?.outcome !== "closed") {
      return adminDecisionError("Could not confirm the saved decision.");
    }
    revalidateModerationPaths();
    return {
      status: "success",
      message: "Decision saved. The case is now in Closed reports.",
      result: {
        reportId,
        verdict,
        enforcement,
        status: String(payload.status ?? "closed"),
        verdictVersion: Number(payload.verdict_version ?? expectedVersion + 1),
        visibleToMember: memberReason,
      },
    };
  } catch (error) {
    return adminDecisionError(
      actionErrorMessage(error, "Could not save the moderation decision."),
    );
  }
}

export async function adminReviseReportDecisionAction(
  previousState: AdminDecisionState,
  formData: FormData,
): Promise<AdminDecisionState> {
  const reportId = str(formData.get("report_id"));
  const receiptId = str(formData.get("evidence_receipt_id"));
  const verdict = str(formData.get("verdict")) as AdminVerdict | null;
  const expectedVersion = Number(formData.get("expected_version"));
  const revisionReason = str(formData.get("revision_reason"));
  const internalNote = str(formData.get("internal_note"));
  if (!reportId || !receiptId || !verdict || !revisionReason) {
    return adminDecisionError("Open the evidence and explain why this decision is changing.");
  }
  if (revisionReason.length > 1000) {
    return adminDecisionError("Revision reason must be 1000 characters or fewer.");
  }
  if (internalNote && internalNote.length > 4000) {
    return adminDecisionError("Internal note must be 4000 characters or fewer.");
  }

  try {
    const demo = await getDemoRuntime();
    if (demo) {
      const next = await getDemoStore().mutate(demo.id, demo.revision, {
        type: "revise_report",
        actorId: demo.activeActorId,
        reportId,
        expectedVersion,
        receiptId,
        verdict,
        enforcement: "none",
        resolution: revisionReason,
      });
      const report = next.state.reports[reportId];
      revalidateModerationPaths();
      return {
        status: "success",
        message: "Decision revised. The previous decision remains in case history.",
        result: { reportId, verdict, enforcement: "none", status: report.status, verdictVersion: report.verdictVersion, visibleToMember: null },
      };
    }
    const { supabase } = await requireAdminProfile();
    const { data, error } = await supabase.rpc("admin_revise_report_decision", {
      p_report_id: reportId,
      p_expected_version: expectedVersion,
      p_evidence_receipt_id: receiptId,
      p_verdict: verdict,
      p_revision_reason: revisionReason,
      p_internal_note: internalNote,
    });
    if (error) return adminDecisionError(adminDecisionErrorMessage(error.message));
    const payload = data as Record<string, unknown> | null;
    if (payload?.outcome !== "revised") {
      return adminDecisionError("Could not confirm the revised decision.");
    }
    revalidateModerationPaths();
    return {
      status: "success",
      message: "Decision revised. The previous decision remains in case history.",
      result: {
        reportId,
        verdict,
        enforcement: "none",
        status: String(payload.status ?? "closed"),
        verdictVersion: Number(payload.verdict_version ?? expectedVersion + 1),
        visibleToMember: null,
      },
    };
  } catch (error) {
    return adminDecisionError(
      actionErrorMessage(error, "Could not revise the moderation decision."),
    );
  }
}

export async function adminCompensateBanAction(
  previousState: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  const userId = str(formData.get("user_id"));
  const banId = str(formData.get("expected_ban_id"));
  const reportId = str(formData.get("expected_report_id"));
  const memberReason = str(formData.get("member_reason"));
  const internalNote = str(formData.get("internal_note"));
  if (!userId || !banId || !reportId || !memberReason) {
    return moderationActionError("Add the member-visible reason before lifting this ban.");
  }
  if (memberReason.length > 500) {
    return moderationActionError("Member-facing reason must be 500 characters or fewer.");
  }
  if (internalNote && internalNote.length > 4000) {
    return moderationActionError("Internal note must be 4000 characters or fewer.");
  }
  try {
    const demo = await getDemoRuntime();
    if (demo) {
      await getDemoStore().mutate(demo.id, demo.revision, { type: "compensate_ban", actorId: demo.activeActorId, banId, reason: memberReason });
      revalidateModerationPaths();
      return moderationActionSuccess("Ban lifted. The original case decision is unchanged.", previousState);
    }
    const { supabase } = await requireAdminProfile();
    const { data, error } = await supabase.rpc("admin_compensate_ban", {
      p_user_id: userId,
      p_expected_ban_id: banId,
      p_expected_report_id: reportId,
      p_member_reason: memberReason,
      p_internal_note: internalNote,
    });
    if (error) return moderationActionError(adminDecisionErrorMessage(error.message));
    if ((data as { outcome?: string } | null)?.outcome !== "compensated") {
      return moderationActionError("Could not confirm that the exact ban was lifted.");
    }
    revalidateModerationPaths();
    return moderationActionSuccess("Ban lifted. The original case decision is unchanged.", previousState);
  } catch (error) {
    return moderationActionError(actionErrorMessage(error, "Could not lift this ban."));
  }
}

export async function adminResolveAppealAction(
  appealId: string,
  decision: "granted" | "denied",
  previousState: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  const note = str(formData.get("internal_note"));
  if (note && note.length > 4000) {
    return moderationActionError("Internal note must be 4000 characters or fewer.");
  }
  try {
    const demo = await getDemoRuntime();
    if (demo) {
      await getDemoStore().mutate(demo.id, demo.revision, { type: "resolve_appeal", actorId: demo.activeActorId, appealId, decision });
      revalidateModerationPaths();
      return moderationActionSuccess(decision === "granted" ? "Appeal granted and ban lifted." : "Appeal denied.", previousState);
    }
    const { supabase } = await requireAdminProfile();
    const { data, error } = await supabase.rpc("admin_resolve_appeal", {
      p_appeal_id: appealId,
      p_decision: decision,
      p_note: note,
    });
    if (error) return moderationActionError(error.message);

    const payload = data as {
      outcome?: string;
      unbanned?: boolean;
    } | null;
    revalidateModerationPaths();

    if (payload?.outcome === "already_terminal") {
      return moderationActionInfo("This appeal was already reviewed.");
    }
    if (payload?.outcome !== "resolved") {
      return moderationActionError(
        payload?.outcome === "missing"
          ? "This appeal no longer exists. Refresh the queue."
          : "Could not confirm the appeal decision.",
      );
    }

    const message =
      decision === "granted" && payload?.unbanned
        ? "Appeal granted and ban lifted."
        : decision === "granted"
          ? "Appeal granted, but the ban instance no longer matches."
          : "Appeal denied.";

    return moderationActionSuccess(message, previousState);
  } catch (error) {
    return moderationActionError(
      actionErrorMessage(error, "Could not resolve appeal."),
    );
  }
}

function adminDecisionError(message: string): AdminDecisionState {
  return { status: "error", message, result: null };
}
