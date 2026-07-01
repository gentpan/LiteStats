import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  username: z.string().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    if (!body.username) {
      const totalPasskeys = await prisma.passkey.count();
      return NextResponse.json({
        userExists: null,
        hasPasskeys: totalPasskeys > 0,
        passkeyCount: totalPasskeys,
        hint: totalPasskeys > 0 ? "discoverable" : "register_first",
      });
    }

    const user = await prisma.user.findUnique({
      where: { username: body.username },
      select: {
        id: true,
        _count: { select: { passkeys: true } },
      },
    });

    if (!user) {
      return NextResponse.json({
        userExists: false,
        hasPasskeys: false,
        passkeyCount: 0,
        hint: "user_not_found",
      });
    }

    const passkeyCount = user._count.passkeys;
    return NextResponse.json({
      userExists: true,
      hasPasskeys: passkeyCount > 0,
      passkeyCount,
      hint: passkeyCount > 0 ? "ready" : "register_first",
    });
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}
