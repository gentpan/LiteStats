import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { deletePasskey, renamePasskey } from "@/lib/passkey";

const renameSchema = z.object({
  deviceName: z.string().min(1).max(80),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = renameSchema.parse(await request.json());
    const passkey = await renamePasskey(session.userId, id, body.deviceName);

    if (!passkey) {
      return NextResponse.json({ error: "Passkey 不存在" }, { status: 404 });
    }

    return NextResponse.json({ passkey });
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const passkey = await deletePasskey(session.userId, id);

  if (!passkey) {
    return NextResponse.json({ error: "Passkey 不存在" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
