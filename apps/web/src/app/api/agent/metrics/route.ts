import { NextResponse } from "next/server";
import { z } from "zod";
import { recordServerMetrics } from "@/lib/server-monitor";

const metricsSchema = z.object({
  cpuPercent: z.number().min(0).max(100).optional(),
  memUsed: z.number().int().nonnegative().optional(),
  memTotal: z.number().int().positive().optional(),
  diskUsed: z.number().int().nonnegative().optional(),
  diskTotal: z.number().int().positive().optional(),
  load1: z.number().nonnegative().optional(),
  uptimeSec: z.number().int().nonnegative().optional(),
});

function getAgentToken(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return request.headers.get("x-agent-token")?.trim() ?? null;
}

export async function POST(request: Request) {
  const token = getAgentToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing agent token" }, { status: 401 });
  }

  try {
    const body = metricsSchema.parse(await request.json());
    const metric = await recordServerMetrics(token, body);

    if (!metric) {
      return NextResponse.json({ error: "Invalid agent token" }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
