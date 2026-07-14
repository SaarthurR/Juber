import { NextResponse } from "next/server";
import {
  loadAdminReportEvidence,
  validAdminUuid,
} from "@/lib/admin-moderation-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const reportId = validAdminUuid((await params).reportId);
  if (!reportId) return NextResponse.json({ data: null, error: "Invalid report ID." }, { status: 400 });
  const result = await loadAdminReportEvidence(reportId);
  return NextResponse.json(result, { status: result.error ? 500 : 200 });
}
