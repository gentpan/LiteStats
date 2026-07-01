import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function DELETE(
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
    select: { id: true, name: true },
  });

  if (!website) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.website.delete({ where: { id: websiteId } });

  return NextResponse.json({ ok: true, deleted: website.name });
}
