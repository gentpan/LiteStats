import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { executeMonitorCheck } from "@/lib/monitor";
import { prisma } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { websiteId } = await params;
  const website = await prisma.website.findFirst({
    where: { id: websiteId, userId: session.userId },
    select: { id: true, monitorEnabled: true },
  });

  if (!website) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!website.monitorEnabled) {
    return NextResponse.json({ error: "Monitoring disabled for this site" }, { status: 400 });
  }

  const check = await executeMonitorCheck(websiteId);
  if (!check) {
    return NextResponse.json({ error: "Check failed" }, { status: 500 });
  }

  return NextResponse.json({
    check: {
      id: check.id,
      status: check.status,
      responseMs: check.responseMs,
      statusCode: check.statusCode,
      sslValid: check.sslValid,
      sslDaysLeft: check.sslDaysLeft,
      sslExpiresAt: check.sslExpiresAt?.toISOString() ?? null,
      sslIssuer: check.sslIssuer,
      error: check.error,
      checkedAt: check.checkedAt.toISOString(),
    },
  });
}
