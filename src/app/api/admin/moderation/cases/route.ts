import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  adminCursorFromSearchParams,
  loadAdminReportCases,
} from "@/lib/admin-moderation-server";
import type { AdminReportScope } from "@/lib/admin-moderation";

export async function GET(request: NextRequest) {
  const scope: AdminReportScope = request.nextUrl.searchParams.get("scope") === "closed"
    ? "closed"
    : "open";
  const reason = request.nextUrl.searchParams.get("reason") || null;
  const result = await loadAdminReportCases({
    scope,
    reason,
    cursor: adminCursorFromSearchParams(request.nextUrl.searchParams),
  });
  return NextResponse.json(result, { status: result.error ? 500 : 200 });
}
