import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { buildMonitorUrl } from "@/lib/monitor-check";
import { executeMonitorCheck } from "@/lib/monitor";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  domain: z.string().min(1).max(255),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const websites = await prisma.website.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      domain: true,
      trackingId: true,
      monitorEnabled: true,
      monitorUrl: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ websites });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = createSchema.parse(await request.json());
    const trackingId = randomBytes(12).toString("hex");

    const monitorUrl = buildMonitorUrl(body.domain);
    const website = await prisma.website.create({
      data: {
        name: body.name,
        domain: body.domain,
        trackingId,
        userId: session.userId,
        monitorEnabled: true,
        monitorUrl,
      },
      select: {
        id: true,
        name: true,
        domain: true,
        trackingId: true,
        monitorEnabled: true,
        monitorUrl: true,
        createdAt: true,
      },
    });

    executeMonitorCheck(website.id).catch((error) => {
      console.error("Initial monitor check failed:", error);
    });

    return NextResponse.json({ website }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
