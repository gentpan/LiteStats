import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listPasskeys } from "@/lib/passkey";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const passkeys = await listPasskeys(session.userId);
  return NextResponse.json({ passkeys });
}
