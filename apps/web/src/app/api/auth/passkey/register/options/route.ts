import { NextResponse } from "next/server";
import { z } from "zod";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPasskeyExcludeList } from "@/lib/passkey";
import { saveChallenge } from "@/lib/webauthn-challenge";
import { getWebAuthnConfig, userIdToBytes } from "@/lib/webauthn";

const bodySchema = z.object({
  deviceName: z.string().min(1).max(80).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { rpID, rpName } = getWebAuthnConfig();
  const excludeCredentials = await getPasskeyExcludeList(user.id);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.username,
    userID: userIdToBytes(user.id),
    userDisplayName: user.username,
    attestationType: "none",
    excludeCredentials,
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await saveChallenge({
    challenge: options.challenge,
    type: "registration",
    userId: user.id,
    username: user.username,
  });

  return NextResponse.json({
    options,
    deviceName: body.data.deviceName ?? "我的 Passkey",
  });
}
