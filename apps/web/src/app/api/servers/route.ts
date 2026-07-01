import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getServerSummaries } from "@/lib/server-monitor";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  hostname: z.string().min(1).max(255),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const servers = await getServerSummaries(session.userId);
  return NextResponse.json({ servers });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = createSchema.parse(await request.json());
    const agentToken = randomBytes(24).toString("hex");

    const server = await prisma.server.create({
      data: {
        name: body.name,
        hostname: body.hostname,
        agentToken,
        userId: session.userId,
      },
      select: {
        id: true,
        name: true,
        hostname: true,
        agentToken: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ server }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
