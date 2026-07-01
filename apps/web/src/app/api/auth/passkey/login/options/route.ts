import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { getPasskeyAllowList } from "@/lib/passkey";
import { saveChallenge } from "@/lib/webauthn-challenge";
import { getWebAuthnConfig } from "@/lib/webauthn";

const bodySchema = z.object({
  username: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const { rpID } = getWebAuthnConfig();

    let allowCredentials: Awaited<ReturnType<typeof getPasskeyAllowList>> | undefined;
    let username: string | undefined;

    if (body.username) {
      const user = await prisma.user.findUnique({
        where: { username: body.username },
        select: { id: true, username: true },
      });

      if (!user) {
        return NextResponse.json({ error: "用户不存在或未注册 Passkey" }, { status: 404 });
      }

      const credentials = await getPasskeyAllowList(user.id);
      if (credentials.length === 0) {
        return NextResponse.json({ error: "该用户尚未注册 Passkey" }, { status: 404 });
      }

      allowCredentials = credentials;
      username = user.username;
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: "preferred",
    });

    await saveChallenge({
      challenge: options.challenge,
      type: "authentication",
      username,
    });

    return NextResponse.json({ options });
  } catch (error) {
    console.error("passkey login options:", error);
    return NextResponse.json({ error: "无法生成 Passkey 登录选项" }, { status: 400 });
  }
}
