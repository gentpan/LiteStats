import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMonitorOverview } from "@/lib/monitor";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getMonitorOverview(session.userId);
  return NextResponse.json(data);
}
