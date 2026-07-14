import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  adminCursorFromSearchParams,
  loadAdminUserReports,
  validAdminUuid,
} from "@/lib/admin-moderation-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const userId = validAdminUuid((await params).userId);
  if (!userId) return NextResponse.json({ data: null, error: "Invalid user ID." }, { status: 400 });
  const direction = request.nextUrl.searchParams.get("direction") === "received"
    ? "received"
    : "made";
  const requestedScope = request.nextUrl.searchParams.get("scope");
  const scope = requestedScope === "open" || requestedScope === "closed"
    ? requestedScope
    : "all";
  const result = await loadAdminUserReports({
    userId,
    direction,
    scope,
    cursor: adminCursorFromSearchParams(request.nextUrl.searchParams),
  });
  return NextResponse.json(result, { status: result.error ? 500 : 200 });
}
