import Link from "next/link";
import { format } from "date-fns";
import {
  adminCaseReference,
  adminLabel,
  adminReportHref,
  type AdminIdentity,
  type AdminReportContext,
  type AdminReportScope,
  type AdminRetainedCounts,
} from "@/lib/admin-moderation";
import { CaseDecisionTools } from "@/components/admin-moderation/decision-tools";
import { MemberReportHistory } from "@/components/admin-moderation/member-report-history";
import { SystemActivity } from "@/components/admin-moderation/system-activity";
import { BanCompensationForm } from "@/components/admin-moderation/ban-compensation-form";
import { CopyCaseId } from "@/components/admin-moderation/copy-case-id";
import { DecisionHistory } from "@/components/admin-moderation/decision-history";

export function AdminModerationCaseDetail({
  context,
  scope,
  reason,
}: {
  context: AdminReportContext;
  scope: AdminReportScope;
  reason: string | null;
}) {
  const { report } = context;
  const legacy = report.verdict_version === 0 && report.verdict === null
    && (report.status === "actioned" || report.status === "dismissed");
  return (
    <article className="min-w-0 rounded-2xl border border-stone-200 bg-white">
      <header className="border-b border-stone-200 px-4 py-4 sm:px-6">
        <Link
          href={adminReportHref(null, { scope, reason })}
          className="mb-3 inline-flex min-h-11 items-center text-sm font-bold text-brand-700 xl:hidden"
        >
          Back to reports
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-stone-500">Case {adminCaseReference(report.id)}</p>
            <h2 className="mt-1 text-xl font-extrabold text-ink sm:text-2xl">
              {adminLabel(report.reason)}
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              {adminLabel(report.target_type)} report, {adminLabel(report.status)}
            </p>
          </div>
          <CopyCaseId key={report.id} id={report.id} />
        </div>
      </header>

      <div className="space-y-8 px-4 py-5 sm:px-6 sm:py-6">
        <section aria-labelledby="case-overview-heading">
          <h3 id="case-overview-heading" className="text-base font-extrabold text-ink">Overview</h3>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <IdentitySummary
              label="Reporter"
              identity={context.reporter}
              counts={context.retained_counts.reporter}
            />
            <IdentitySummary
              label="Reported member"
              identity={context.reported}
              counts={context.retained_counts.reported}
            />
          </div>
          {report.details && (
            <div className="mt-4 border-l-2 border-stone-200 pl-4">
              <p className="text-xs font-bold text-stone-500">Reporter details</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-700">{report.details}</p>
            </div>
          )}
          <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-stone-100 pt-4 sm:grid-cols-3">
            <Meta label="Submitted" value={format(new Date(report.created_at), "MMM d, yyyy h:mm a")} />
            <Meta label="Decision" value={report.verdict ? adminLabel(report.verdict) : legacy ? "Legacy decision" : "Not decided"} />
            <Meta label="Action" value={report.enforcement ? adminLabel(report.enforcement) : "None recorded"} />
          </dl>
          {legacy && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Legacy decision: a structured verdict was not recorded. {report.resolution ?? "No legacy resolution was saved."}
            </p>
          )}
        </section>

        <CaseDecisionTools key={report.id} context={context}>
          <section aria-labelledby="account-context-heading">
            <h3 id="account-context-heading" className="text-base font-extrabold text-ink">Current account context</h3>
            <p className="mt-1 text-xs text-stone-500">Mutable profile data. Evidence remains the report-time snapshot.</p>
            <div className="mt-3 grid gap-5 lg:grid-cols-2">
              <AccountDetails label="Reporter" identity={context.reporter} />
              <AccountDetails label="Reported member" identity={context.reported} />
            </div>
            {context.active_ban && context.reported && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-bold text-red-900">Active ban</p>
                <p className="mt-1 text-sm text-red-800">
                  {context.active_ban.expires_at
                    ? `Ends ${format(new Date(context.active_ban.expires_at), "MMM d, yyyy h:mm a")}`
                    : "Permanent"}
                </p>
                {context.active_ban.report_id === report.id && (
                  <BanCompensationForm
                    key={context.active_ban.ban_id}
                    userId={context.reported.id}
                    banId={context.active_ban.ban_id}
                    reportId={report.id}
                  />
                )}
              </div>
            )}
          </section>

          <DecisionHistory key={report.id} reportId={report.id} initialItems={context.history} />
          <SystemActivity key={report.id} reportId={report.id} />
        </CaseDecisionTools>
      </div>
    </article>
  );
}

function IdentitySummary({
  label,
  identity,
  counts,
}: {
  label: string;
  identity: AdminIdentity | null;
  counts: AdminRetainedCounts | null;
}) {
  if (!identity) {
    return <div className="rounded-xl bg-stone-50 p-4 text-sm text-stone-500">{label} is no longer retained.</div>;
  }
  return (
    <div className="rounded-xl bg-stone-50 p-4">
      <p className="text-xs font-bold text-stone-500">{label}</p>
      <p className="mt-1 text-sm font-extrabold text-ink">{identity.full_name ?? "Unknown member"}</p>
      {counts && <MemberReportHistory key={identity.id} userId={identity.id} counts={counts} />}
    </div>
  );
}

function AccountDetails({ label, identity }: { label: string; identity: AdminIdentity | null }) {
  if (!identity) return <p className="text-sm text-stone-500">No retained {label.toLowerCase()} profile.</p>;
  const vehicle = [identity.car_color, identity.car_make_model].filter(Boolean).join(" ");
  return (
    <div>
      <p className="text-sm font-bold text-ink">{label}</p>
      <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-stone-500">Name</dt><dd className="text-stone-700">{identity.full_name ?? "Not provided"}</dd>
        <dt className="text-stone-500">Neighborhood</dt><dd className="text-stone-700">{identity.neighborhood ?? "Not provided"}</dd>
        <dt className="text-stone-500">Vehicle</dt><dd className="text-stone-700">{vehicle || "Not provided"}</dd>
        <dt className="text-stone-500">Joined</dt><dd className="text-stone-700">{identity.created_at ? format(new Date(identity.created_at), "MMM d, yyyy") : "Unknown"}</dd>
      </dl>
      {identity.bio && <p className="mt-3 text-sm leading-6 text-stone-600">{identity.bio}</p>}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold text-stone-500">{label}</dt><dd className="mt-1 text-sm text-stone-700">{value}</dd></div>;
}
