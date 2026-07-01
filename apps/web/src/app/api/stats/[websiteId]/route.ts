import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getWebsiteStats, type StatsRange } from "@/lib/analytics";

const rangeSchema = z.enum(["24h", "7d", "30d"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { websiteId } = await params;
  const { searchParams } = new URL(request.url);
  const rangeResult = rangeSchema.safeParse(searchParams.get("range") ?? "7d");
  const range = (rangeResult.success ? rangeResult.data : "7d") as StatsRange;

  const website = await prisma.website.findFirst({
    where: { id: websiteId, userId: session.userId },
    select: { id: true, name: true, domain: true, trackingId: true },
  });

  if (!website) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stats = await getWebsiteStats(website.id, range);
  return NextResponse.json({ website, stats });
}
