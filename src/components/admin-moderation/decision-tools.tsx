"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import {
  adminCloseReportCaseAction,
  adminReviseReportDecisionAction,
} from "@/app/moderation/actions";
import {
  ADMIN_DECISION_INITIAL,
  adminCaseReference,
  adminDecisionOptions,
  adminLabel,
  adminMemberReasonRequired,
  adminReportHref,
  parseAdminEvidence,
  type AdminEnforcement,
  type AdminEvidence,
  type AdminReportContext,
  type AdminVerdict,
} from "@/lib/admin-moderation";

export function CaseDecisionTools({ context, children }: { context: AdminReportContext; children: React.ReactNode }) {
  const report = context.report;
  const terminal = report.status === "actioned" || report.status === "dismissed";
  const revise = terminal && context.can_revise;
  const action = revise ? adminReviseReportDecisionAction : adminCloseReportCaseAction;
  const [state, formAction, pending] = useActionState(action, ADMIN_DECISION_INITIAL);
  const [evidence, setEvidence] = useState<AdminEvidence | null>(null);
  const [evidenceState, setEvidenceState] = useState<"idle" | "loading" | "error">("idle");
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<AdminVerdict>(report.verdict ?? "violation");
  const [enforcement, setEnforcement] = useState<AdminEnforcement>("none");
  const [banDays, setBanDays] = useState("7");
  const [memberReason, setMemberReason] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [revisionReason, setRevisionReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const requestTokenRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmOpen && !dialog.open) {
      dialog.showModal();
      if (enforcement === "permanent_ban") cancelRef.current?.focus();
    } else if (!confirmOpen && dialog.open) {
      dialog.close();
    }
  }, [confirmOpen, enforcement]);

  async function openEvidence() {
    abortRef.current?.abort();
    const controller = new AbortController();
    const requestToken = crypto.randomUUID();
    abortRef.current = controller;
    requestTokenRef.current = requestToken;
    setEvidence(null);
    setEvidenceError(null);
    setEvidenceState("loading");
    try {
      const response = await fetch(`/api/admin/moderation/cases/${report.id}/evidence`, {
        signal: controller.signal,
      });
      const payload = await response.json() as { data?: unknown; error?: string | null };
      if (requestTokenRef.current !== requestToken) return;
      const next = parseAdminEvidence(payload.data);
      if (!response.ok || payload.error || !next || next.report_id !== report.id) {
        throw new Error(payload.error || "Could not verify this evidence receipt.");
      }
      setEvidence(next);
      setEvidenceState("idle");
    } catch (error) {
      if (controller.signal.aborted) return;
      setEvidenceState("error");
      setEvidenceError(error instanceof Error ? error.message : "Could not load evidence.");
    }
  }

  if (terminal && !revise) {
    return (
      <>
        <EvidenceSection
          evidence={evidence}
          loading={evidenceState === "loading"}
          error={evidenceError}
          onOpen={() => void openEvidence()}
        />
        {children}
        <section aria-labelledby="decision-heading">
          <h3 id="decision-heading" className="text-base font-extrabold text-ink">Decision</h3>
          <p className="mt-2 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-700">
            {context.revision_block_reason
              ?? "This case delivered member-facing enforcement, so its verdict cannot be rewritten in this release."}
          </p>
        </section>
      </>
    );
  }

  if (state.status === "success" && state.result) {
    return (
      <>
        <EvidenceSection evidence={evidence} loading={false} error={null} onOpen={() => void openEvidence()} />
        {children}
        <section aria-labelledby="decision-complete-heading" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4" role="status">
          <h3 id="decision-complete-heading" className="text-base font-extrabold text-emerald-950">
            {revise ? "Decision revised" : "Decision saved"}
          </h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <Result label="Case" value={adminCaseReference(state.result.reportId)} />
            <Result label="Decision" value={adminLabel(state.result.verdict)} />
            <Result label="Action" value={adminLabel(state.result.enforcement)} />
          </dl>
          <p className="mt-3 text-sm text-emerald-900">{state.message}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={adminReportHref(null, { scope: "open" })} className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-4 text-sm font-bold text-white active:scale-[0.98]">Next open report</a>
            <a href={adminReportHref(report.id, { scope: "closed" })} className="inline-flex min-h-11 items-center rounded-xl border border-emerald-300 px-4 text-sm font-bold text-emerald-900 active:scale-[0.98]">View closed case</a>
          </div>
        </section>
      </>
    );
  }

  const affectedMember = enforcement === "none"
    ? null
    : enforcement === "warn_reporter"
      ? context.reporter?.full_name
      : context.reported?.full_name;
  const enforcementOptions = adminDecisionOptions(verdict, context.reported !== null);

  return (
    <>
      <EvidenceSection
        evidence={evidence}
        loading={evidenceState === "loading"}
        error={evidenceError}
        onOpen={() => void openEvidence()}
      />
      {children}

      <section aria-labelledby="decision-heading">
        <h3 id="decision-heading" className="text-base font-extrabold text-ink">
          {revise ? "Revise decision" : "Decision"}
        </h3>
        {revise && (
          <p className="mt-1 text-sm text-stone-600">Only the verdict can change. This case has never delivered member-facing enforcement.</p>
        )}
        <form action={formAction} className="mt-4 space-y-5">
          <input type="hidden" name="report_id" value={report.id} />
          <input type="hidden" name="expected_version" value={report.verdict_version} />
          <input type="hidden" name="evidence_receipt_id" value={evidence?.receipt_id ?? ""} />

          <fieldset>
            <legend className="text-sm font-bold text-ink">Decision</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(["violation", "no_violation", "inconclusive"] as const).map((value) => (
                <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${verdict === value ? "border-brand-400 bg-brand-50 text-brand-900" : "border-stone-300 text-stone-700"}`}>
                  <input
                    type="radio"
                    name="verdict"
                    value={value}
                    checked={verdict === value}
                    onChange={() => {
                      setVerdict(value);
                      setEnforcement("none");
                    }}
                    className="size-4 accent-brand-600"
                  />
                  {value === "inconclusive" ? "Not enough information" : adminLabel(value)}
                </label>
              ))}
            </div>
          </fieldset>

          {!revise && (
            <label className="block">
              <span className="text-sm font-bold text-ink">Action</span>
              <select
                name="enforcement"
                value={enforcement}
                onChange={(event) => setEnforcement(event.target.value as AdminEnforcement)}
                className="mt-2 h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-ink focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                {enforcementOptions.map((value) => (
                  <option key={value} value={value}>{adminLabel(value)}</option>
                ))}
              </select>
              {!context.reported && verdict === "violation" && (
                <span className="mt-1 block text-xs text-stone-500">The reported member is no longer retained, so warning and ban actions are unavailable.</span>
              )}
            </label>
          )}
          {revise && <input type="hidden" name="enforcement" value="none" />}

          {enforcement === "temporary_ban" && (
            <label className="block">
              <span className="text-sm font-bold text-ink">Ban duration</span>
              <select name="ban_days" value={banDays} onChange={(event) => setBanDays(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100">
                <option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option>
              </select>
            </label>
          )}

          {adminMemberReasonRequired(enforcement) && !revise && (
            <label className="block">
              <span className="text-sm font-bold text-ink">Member-facing reason</span>
              <textarea
                name="member_reason"
                value={memberReason}
                onChange={(event) => setMemberReason(event.target.value)}
                required
                maxLength={500}
                rows={3}
                aria-describedby={`${titleId}-member-help`}
                className="mt-2 w-full rounded-xl border border-stone-300 px-3 py-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <span id={`${titleId}-member-help`} className="mt-1 block text-xs text-stone-500">Visible to the affected member. Do not include reporter identity or internal details.</span>
            </label>
          )}

          {revise && (
            <label className="block">
              <span className="text-sm font-bold text-ink">Revision reason</span>
              <textarea name="revision_reason" value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} required maxLength={1000} rows={3} className="mt-2 w-full rounded-xl border border-stone-300 px-3 py-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100" />
              <span className="mt-1 block text-xs text-stone-500">Recorded in case history for future reviewers.</span>
            </label>
          )}

          <label className="block">
            <span className="text-sm font-bold text-ink">Internal note</span>
            <textarea name="internal_note" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} maxLength={4000} rows={3} className="mt-2 w-full rounded-xl border border-stone-300 px-3 py-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100" />
            <span className="mt-1 block text-xs text-stone-500">Admin only. Never shown to a member.</span>
          </label>

          {state.status === "error" && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{state.message}</p>}

          <button
            type="button"
            disabled={!evidence || (revise && !revisionReason.trim()) || (adminMemberReasonRequired(enforcement) && !memberReason.trim())}
            onClick={() => setConfirmOpen(true)}
            className="min-h-11 rounded-xl bg-brand-600 px-5 text-sm font-bold text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Review decision
          </button>

          <dialog
            ref={dialogRef}
            aria-labelledby={`${titleId}-confirm-title`}
            onCancel={(event) => {
              if (pending) event.preventDefault();
              else setConfirmOpen(false);
            }}
            className="m-auto w-[min(34rem,calc(100%-2rem))] rounded-2xl border border-stone-200 bg-white p-0 shadow-xl backdrop:bg-stone-950/40"
          >
            <div className="p-5 sm:p-6">
              <h4 id={`${titleId}-confirm-title`} className="text-lg font-extrabold text-ink" tabIndex={-1}>Confirm decision</h4>
              <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-3 text-sm">
                <dt className="text-stone-500">Case</dt><dd className="font-semibold text-ink">{adminCaseReference(report.id)}</dd>
                <dt className="text-stone-500">Decision</dt><dd className="font-semibold text-ink">{adminLabel(verdict)}</dd>
                <dt className="text-stone-500">Affected member</dt><dd className="text-stone-700">{affectedMember ?? "No member action"}</dd>
                <dt className="text-stone-500">Action</dt><dd className="text-stone-700">{adminLabel(enforcement)}{enforcement === "temporary_ban" ? ` for ${banDays} days` : ""}</dd>
                <dt className="text-stone-500">Visible to member</dt><dd className="whitespace-pre-wrap text-stone-700">{memberReason || "Nothing"}</dd>
                <dt className="text-stone-500">Internal only</dt><dd className="whitespace-pre-wrap text-stone-700">{internalNote || "Nothing"}</dd>
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                <ConfirmSubmit destructive={enforcement === "permanent_ban"} />
                <button ref={cancelRef} type="button" disabled={pending} onClick={() => setConfirmOpen(false)} className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-bold text-stone-700 active:scale-[0.98] disabled:opacity-60">Cancel</button>
              </div>
            </div>
          </dialog>
        </form>
      </section>
    </>
  );
}

function EvidenceSection({
  evidence,
  loading,
  error,
  onOpen,
}: {
  evidence: AdminEvidence | null;
  loading: boolean;
  error: string | null;
  onOpen: () => void;
}) {
  return (
    <section aria-labelledby="evidence-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="evidence-heading" className="text-base font-extrabold text-ink">Evidence snapshot</h3>
          <p className="mt-1 text-xs text-stone-500">Opening evidence is audited and unlocks decisions for this case only.</p>
        </div>
        <button type="button" disabled={loading} onClick={onOpen} className="min-h-11 rounded-xl border border-brand-300 px-4 text-sm font-bold text-brand-800 transition hover:bg-brand-50 active:scale-[0.98] disabled:opacity-50">
          {loading ? "Opening evidence..." : evidence ? "Open evidence again" : "Open evidence"}
        </button>
      </div>
      <div aria-live="polite">
        {loading && (
          <div className="mt-3 space-y-2" aria-label="Loading evidence">
            <div className="h-4 w-32 animate-pulse rounded bg-stone-200 motion-reduce:animate-none" />
            <div className="h-20 animate-pulse rounded-xl bg-stone-100 motion-reduce:animate-none" />
          </div>
        )}
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</p>}
        {evidence && <EvidenceSnapshot evidence={evidence} />}
      </div>
    </section>
  );
}

function EvidenceSnapshot({ evidence }: { evidence: AdminEvidence }) {
  const body = typeof evidence.snapshot.body === "string" ? evidence.snapshot.body : null;
  const context = Array.isArray(evidence.snapshot.context) ? evidence.snapshot.context : [];
  if (body) {
    return (
      <div className="mt-3 space-y-3">
        <div className="rounded-xl border-2 border-brand-200 bg-brand-50 px-4 py-3">
          <p className="text-xs font-bold text-brand-800">Reported message</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-800">{body}</p>
        </div>
        {context.length > 0 && (
          <div>
            <p className="text-xs font-bold text-stone-500">Reporter-shared context</p>
            <ol className="mt-2 space-y-2">
              {context.map((raw, index) => {
                const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
                return (
                  <li key={`${String(item.created_at)}-${index}`} className="rounded-xl bg-stone-50 px-4 py-3 text-sm">
                    <p className="text-xs font-bold text-stone-500">{item.role === "reported" ? "Reported member" : "Reporter"}</p>
                    <p className="mt-1 whitespace-pre-wrap text-stone-700">{String(item.body ?? "")}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    );
  }
  return (
    <dl className="mt-3 grid gap-3 rounded-xl bg-stone-50 p-4 sm:grid-cols-2">
      {Object.entries(evidence.snapshot).map(([key, value]) => (
        <div key={key} className="min-w-0">
          <dt className="text-xs font-bold text-stone-500">{adminLabel(key)}</dt>
          <dd className="mt-1 break-words text-sm text-stone-700">{formatEvidenceValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatEvidenceValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function ConfirmSubmit({ destructive }: { destructive: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`min-h-11 rounded-xl px-4 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-60 ${destructive ? "bg-red-700" : "bg-brand-600"}`}>
      {pending ? "Saving decision..." : "Confirm decision"}
    </button>
  );
}

function Result({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold text-emerald-800">{label}</dt><dd className="mt-1 text-sm font-bold text-emerald-950">{value}</dd></div>;
}
