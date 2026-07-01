import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getServerDetail, type ServerRange } from "@/lib/server-monitor";
import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serverId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { serverId } = await params;
  const { searchParams } = new URL(request.url);
  const range = (searchParams.get("range") ?? "24h") as ServerRange;

  const detail = await getServerDetail(session.userId, serverId, range);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ serverId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { serverId } = await params;
  const server = await prisma.server.findFirst({
    where: { id: serverId, userId: session.userId },
    select: { id: true, name: true },
  });

  if (!server) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.server.delete({ where: { id: serverId } });
  return NextResponse.json({ ok: true, deleted: server.name });
}
