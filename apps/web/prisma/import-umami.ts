import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DATA_DIR = process.env.UMAMI_DATA_DIR ?? join(process.cwd(), "data/umami-export");
const BATCH_SIZE = 1000;
const ADMIN_USERNAME = process.env.IMPORT_USER ?? "admin";

type UmamiWebsite = {
  website_id: string;
  name: string;
  domain: string | null;
  created_at: string;
};

type UmamiSession = {
  session_id: string;
  website_id: string;
  browser: string | null;
  os: string | null;
  device: string | null;
  country: string | null;
  created_at: string;
  last_seen_at: string;
};

type UmamiEventRow = {
  session_id: string;
  website_id: string;
  created_at: string;
  url_path: string;
  url_query: string | null;
  referrer_domain: string | null;
  referrer_path: string | null;
  hostname: string | null;
  event_type: string;
  event_name: string | null;
};

function newId() {
  return randomBytes(12).toString("hex");
}

function newTrackingId() {
  return randomBytes(12).toString("hex");
}

function parseCsv(text: string): UmamiEventRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]!);
  const rows: UmamiEventRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]!);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])) as UmamiEventRow;
    rows.push(row);
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function buildUrl(row: UmamiEventRow) {
  const host = row.hostname?.trim();
  const path = row.url_path || "/";
  const query = row.url_query?.trim();
  const pathWithQuery = query ? `${path}?${query}` : path;

  if (host) {
    return `https://${host}${pathWithQuery}`;
  }

  return pathWithQuery;
}

function buildPath(row: UmamiEventRow) {
  const path = row.url_path || "/";
  const query = row.url_query?.trim();
  return query ? `${path}?${query}` : path;
}

function buildReferrer(row: UmamiEventRow) {
  const domain = row.referrer_domain?.trim();
  const path = row.referrer_path?.trim();

  if (domain && path) return `https://${domain}${path}`;
  if (domain) return `https://${domain}`;
  if (path) return path;
  return null;
}

function eventType(umamiType: string) {
  return umamiType === "2" ? "event" : "pageview";
}

async function main() {
  const user = await prisma.user.findUnique({ where: { username: ADMIN_USERNAME } });
  if (!user) {
    throw new Error(`User "${ADMIN_USERNAME}" not found. Run db:seed first.`);
  }

  const websitesPath = join(DATA_DIR, "websites.json");
  const sessionsPath = join(DATA_DIR, "sessions.json");
  const eventsPath = join(DATA_DIR, "events.csv");

  const websites = JSON.parse(readFileSync(websitesPath, "utf8")) as UmamiWebsite[];
  const sessions = JSON.parse(readFileSync(sessionsPath, "utf8")) as UmamiSession[];
  const events = parseCsv(readFileSync(eventsPath, "utf8"));

  console.log(`Importing ${websites.length} websites, ${sessions.length} sessions, ${events.length} events`);
  console.log(`Data directory: ${DATA_DIR}`);

  const websiteIdMap = new Map<string, string>();
  const sessionIdMap = new Map<string, string>();

  for (const website of websites) {
    const existing = await prisma.website.findFirst({
      where: {
        userId: user.id,
        domain: website.domain ?? "",
        name: website.name,
      },
      select: { id: true },
    });

    if (existing) {
      websiteIdMap.set(website.website_id, existing.id);
      console.log(`Skip existing website: ${website.name}`);
      continue;
    }

    const created = await prisma.website.create({
      data: {
        id: newId(),
        name: website.name,
        domain: website.domain ?? website.name,
        trackingId: newTrackingId(),
        userId: user.id,
        createdAt: new Date(website.created_at),
      },
    });

    websiteIdMap.set(website.website_id, created.id);
    console.log(`Imported website: ${website.name} (${website.domain ?? "no domain"})`);
  }

  const sessionRows = sessions
    .map((session) => {
      const websiteId = websiteIdMap.get(session.website_id);
      if (!websiteId) return null;

      const id = newId();
      sessionIdMap.set(session.session_id, id);

      return {
        id,
        websiteId,
        visitorId: session.session_id,
        browser: session.browser,
        os: session.os,
        device: session.device,
        country: session.country,
        lastSeenAt: new Date(session.last_seen_at),
        createdAt: new Date(session.created_at),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  for (let i = 0; i < sessionRows.length; i += BATCH_SIZE) {
    const batch = sessionRows.slice(i, i + BATCH_SIZE);
    await prisma.session.createMany({ data: batch, skipDuplicates: true });
    console.log(`Sessions: ${Math.min(i + BATCH_SIZE, sessionRows.length)}/${sessionRows.length}`);
  }

  let importedEvents = 0;
  let skippedEvents = 0;

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    const data = [];

    for (const row of batch) {
      const websiteId = websiteIdMap.get(row.website_id);
      const sessionId = sessionIdMap.get(row.session_id);

      if (!websiteId || !sessionId) {
        skippedEvents++;
        continue;
      }

      const type = eventType(row.event_type);

      data.push({
        id: newId(),
        websiteId,
        sessionId,
        type,
        url: buildUrl(row),
        path: buildPath(row),
        referrer: buildReferrer(row),
        eventName: type === "event" ? row.event_name : null,
        createdAt: new Date(row.created_at),
      });
    }

    if (data.length > 0) {
      await prisma.event.createMany({ data });
      importedEvents += data.length;
    }

    console.log(`Events: ${Math.min(i + BATCH_SIZE, events.length)}/${events.length}`);
  }

  console.log(`Import complete. Websites: ${websiteIdMap.size}, Sessions: ${sessionRows.length}, Events: ${importedEvents}, Skipped events: ${skippedEvents}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
