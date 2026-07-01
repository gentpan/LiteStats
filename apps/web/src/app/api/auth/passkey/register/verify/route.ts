import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { getSession } from "@/lib/auth";
import { createPasskey } from "@/lib/passkey";
import { consumeChallenge } from "@/lib/webauthn-challenge";
import { getWebAuthnConfig } from "@/lib/webauthn";

const bodySchema = z.object({
  response: z.unknown(),
  deviceName: z.string().min(1).max(80),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = bodySchema.parse(await request.json());
    const { expectedOrigin, rpID } = getWebAuthnConfig();

    const verification = await verifyRegistrationResponse({
      response: body.response as never,
      expectedChallenge: async (challenge) => {
        const record = await consumeChallenge(challenge, "registration");
        return record?.userId === session.userId;
      },
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Passkey 注册验证失败" }, { status: 400 });
    }

    const { credential, credentialBackedUp } = verification.registrationInfo;

    await createPasskey({
      userId: session.userId,
      credential,
      deviceName: body.deviceName,
      backedUp: credentialBackedUp,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("passkey register verify:", error);
    return NextResponse.json({ error: "Passkey 注册失败" }, { status: 400 });
  }
}
