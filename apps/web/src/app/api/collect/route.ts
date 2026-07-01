import { NextResponse } from "next/server";
import { z } from "zod";
import { isbot } from "isbot";
import { prisma } from "@/lib/db";
import { hashVisitorId } from "@/lib/hash";
import { getOrCreateSession } from "@/lib/analytics";
import { lookupGeoIp } from "@/lib/geoip";

const collectSchema = z.object({
  trackingId: z.string().min(1),
  type: z.enum(["pageview", "event"]),
  url: z.string().optional(),
  path: z.string().optional(),
  referrer: z.string().nullable().optional(),
  eventName: z.string().optional(),
});

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "0.0.0.0";
  return request.headers.get("x-real-ip") ?? "0.0.0.0";
}

export async function POST(request: Request) {
  try {
    const userAgent = request.headers.get("user-agent") ?? "";
    if (!userAgent || isbot(userAgent)) {
      return new NextResponse(null, { status: 202 });
    }

    const raw = await request.json();
    const data = collectSchema.parse(raw);

    const website = await prisma.website.findUnique({
      where: { trackingId: data.trackingId },
      select: { id: true },
    });

    if (!website) {
      return NextResponse.json({ error: "Unknown tracking id" }, { status: 404 });
    }

    const ip = getClientIp(request);
    const visitorId = hashVisitorId(ip, userAgent, website.id);
    const geo = await lookupGeoIp(ip);
    const session = await getOrCreateSession({
      websiteId: website.id,
      visitorId,
      userAgent,
      country: geo?.countryCode ?? null,
    });

    await prisma.event.create({
      data: {
        websiteId: website.id,
        sessionId: session.id,
        type: data.type,
        url: data.url,
        path: data.path,
        referrer: data.referrer ?? null,
        eventName: data.type === "event" ? data.eventName : null,
      },
    });

    return new NextResponse(null, {
      status: 202,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("collect error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
