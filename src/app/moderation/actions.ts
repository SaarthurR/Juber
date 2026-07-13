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
  moderationActionMessage,
  type ReportTargetType,
} from "@/lib/moderation";
import { requireAdminProfile } from "@/lib/moderation-server";

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
    const { supabase } = await requireSignedIn();
    const targetType = str(formData.get("target_type")) as ReportTargetType | null;
    const targetId = str(formData.get("target_id"));
    const reason = str(formData.get("reason"));
    const details = str(formData.get("details"));

    if (!targetType || !targetId || !reason) {
      return moderationActionError("Choose a reason before submitting.");
    }

    const { data, error } = await supabase.rpc("submit_report", {
      p_target_type: targetType,
      p_target_id: targetId,
      p_reason: reason,
      p_details: details,
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
    const { supabase } = await requireSignedIn();
    const text = str(formData.get("text"));
    if (!text) return moderationActionError("Tell us why this suspension should be lifted.");

    const { data, error } = await supabase.rpc("submit_appeal", { p_text: text });
    if (error) {
      return moderationActionError(mapAppealSubmitError(error.message));
    }
    if (!data) {
      return moderationActionError("Could not submit appeal.");
    }

    revalidateModerationPaths();
    return moderationActionSuccess(
      "Appeal submitted. We will email you when it is reviewed.",
      previousState,
    );
  } catch (error) {
    return moderationActionError(
      actionErrorMessage(error, "Could not submit appeal."),
    );
  }
}

export async function loadReportEvidenceAction(
  reportId: string,
): Promise<{ data: unknown; error: string | null }> {
  try {
    const { supabase } = await requireAdminProfile();
    const { data, error } = await supabase.rpc("admin_report_evidence", {
      p_report_id: reportId,
    });
    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: actionErrorMessage(error, "Could not load evidence."),
    };
  }
}

export async function adminSetReportStatusAction(
  reportId: string,
  status: "reviewing" | "dismissed" | "actioned",
  resolution: string | null,
  previousState: ModerationActionState,
): Promise<ModerationActionState> {
  try {
    const { supabase } = await requireAdminProfile();
    const { data, error } = await supabase.rpc("admin_set_report_status", {
      p_report_id: reportId,
      p_status: status,
      p_resolution: resolution,
    });
    if (error) return moderationActionError(error.message);

    const outcome = (data as { outcome?: string } | null)?.outcome ?? "updated";
    revalidateModerationPaths();
    return moderationActionSuccess(
      moderationActionMessage(outcome, "Report updated."),
      previousState,
    );
  } catch (error) {
    return moderationActionError(
      actionErrorMessage(error, "Could not update report."),
    );
  }
}

export async function adminWarnUserAction(
  targetUserId: string,
  reportId: string | null,
  note: string | null,
  previousState: ModerationActionState,
): Promise<ModerationActionState> {
  try {
    const { supabase } = await requireAdminProfile();
    const { error } = await supabase.rpc("admin_warn_user", {
      p_target_user_id: targetUserId,
      p_report_id: reportId,
      p_note: note,
    });
    if (error) return moderationActionError(error.message);

    revalidateModerationPaths();
    return moderationActionSuccess("Warning sent.", previousState);
  } catch (error) {
    return moderationActionError(
      actionErrorMessage(error, "Could not send warning."),
    );
  }
}

export async function adminBanUserAction(
  targetUserId: string,
  reason: string,
  expiresAt: string | null,
  reportId: string | null,
  previousState: ModerationActionState,
): Promise<ModerationActionState> {
  void previousState;
  try {
    const { supabase } = await requireAdminProfile();
    const { error } = await supabase.rpc("admin_ban_user", {
      p_target_user_id: targetUserId,
      p_reason: reason,
      p_expires_at: expiresAt,
      p_report_id: reportId,
    });
    if (error) return moderationActionError(error.message);

    revalidateModerationPaths();
    return moderationActionInfo(
      "Ban applied. The user keeps access until their session expires; database lockout is immediate.",
    );
  } catch (error) {
    return moderationActionError(
      actionErrorMessage(error, "Could not ban user."),
    );
  }
}

export async function adminUnbanUserAction(
  targetUserId: string,
  note: string | null,
  previousState: ModerationActionState,
): Promise<ModerationActionState> {
  try {
    const { supabase } = await requireAdminProfile();
    const { data, error } = await supabase.rpc("admin_unban_user", {
      p_target_user_id: targetUserId,
      p_note: note,
    });
    if (error) return moderationActionError(error.message);
    if (data === false) {
      return moderationActionInfo("This user is not currently banned.");
    }

    revalidateModerationPaths();
    return moderationActionSuccess("Ban lifted.", previousState);
  } catch (error) {
    return moderationActionError(
      actionErrorMessage(error, "Could not lift ban."),
    );
  }
}

export async function adminResolveAppealAction(
  appealId: string,
  decision: "granted" | "denied",
  note: string | null,
  previousState: ModerationActionState,
): Promise<ModerationActionState> {
  try {
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
