import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { buildMonitorUrl } from "@/lib/monitor-check";
import { executeMonitorCheck, getMonitorDetail } from "@/lib/monitor";
import { prisma } from "@/lib/db";
import type { MonitorRange } from "@/lib/monitor";

const patchSchema = z.object({
  monitorEnabled: z.boolean().optional(),
  monitorUrl: z.string().max(500).nullable().optional(),
});

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
  const range = (searchParams.get("range") ?? "7d") as MonitorRange;

  const detail = await getMonitorDetail(session.userId, websiteId, range);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { websiteId } = await params;

  try {
    const body = patchSchema.parse(await request.json());
    const existing = await prisma.website.findFirst({
      where: { id: websiteId, userId: session.userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const website = await prisma.website.update({
      where: { id: websiteId },
      data: {
        monitorEnabled: body.monitorEnabled,
        monitorUrl: body.monitorUrl === undefined ? undefined : body.monitorUrl,
      },
      select: {
        id: true,
        name: true,
        domain: true,
        monitorEnabled: true,
        monitorUrl: true,
      },
    });

    return NextResponse.json({
      website: {
        ...website,
        monitorUrl: buildMonitorUrl(website.domain, website.monitorUrl),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
