import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { getPasskeyByCredentialId, toWebAuthnCredential, updatePasskeyCounter } from "@/lib/passkey";
import { consumeChallenge } from "@/lib/webauthn-challenge";
import { getWebAuthnConfig } from "@/lib/webauthn";

const bodySchema = z.object({
  response: z.unknown(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const { expectedOrigin, rpID } = getWebAuthnConfig();

    const response = body.response as { id?: string };
    if (!response.id) {
      return NextResponse.json({ error: "无效的 Passkey 响应" }, { status: 400 });
    }

    const passkey = await getPasskeyByCredentialId(response.id);
    if (!passkey) {
      return NextResponse.json({ error: "未找到对应的 Passkey" }, { status: 404 });
    }

    const verification = await verifyAuthenticationResponse({
      response: body.response as never,
      expectedChallenge: async (challenge) => {
        const record = await consumeChallenge(challenge, "authentication");
        if (!record) return false;
        if (record.username && record.username !== passkey.user.username) {
          return false;
        }
        return true;
      },
      expectedOrigin,
      expectedRPID: rpID,
      credential: toWebAuthnCredential(passkey),
      requireUserVerification: true,
    });

    if (!verification.verified) {
      return NextResponse.json({ error: "Passkey 验证失败" }, { status: 401 });
    }

    await updatePasskeyCounter(passkey.credentialId, verification.authenticationInfo.newCounter);

    const token = await createSessionToken({
      userId: passkey.user.id,
      username: passkey.user.username,
    });
    await setSessionCookie(token);

    return NextResponse.json({
      ok: true,
      username: passkey.user.username,
    });
  } catch (error) {
    console.error("passkey login verify:", error);
    return NextResponse.json({ error: "Passkey 登录失败" }, { status: 401 });
  }
}
