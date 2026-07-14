import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  adminCursorFromSearchParams,
  loadAdminReportActions,
  validAdminUuid,
} from "@/lib/admin-moderation-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const reportId = validAdminUuid((await params).reportId);
  if (!reportId) return NextResponse.json({ data: null, error: "Invalid report ID." }, { status: 400 });
  const category = request.nextUrl.searchParams.get("category") === "system"
    ? "system"
    : "decision";
  const result = await loadAdminReportActions({
    reportId,
    category,
    cursor: adminCursorFromSearchParams(request.nextUrl.searchParams),
  });
  return NextResponse.json(result, { status: result.error ? 500 : 200 });
}
