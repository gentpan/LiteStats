import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWebAuthnHealth } from "@/lib/webauthn";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      webauthn: getWebAuthnHealth(),
    });
  } catch {
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
