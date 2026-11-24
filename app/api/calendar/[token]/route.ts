// Read-only ICS feed for calendar apps, which cannot send the session cookie:
// the secret link itself authorizes one member's chosen view of their lab.
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attendance, calendarFeeds, groups, items, members } from "@/db/schema";
import { FEED_HISTORY_DAYS, feedCalendar } from "@/lib/calendar-feed";
import { countAttempt, sha256Hex } from "@/lib/server-security";
import { logSecurityEvent } from "@/lib/security-log";

export const dynamic = "force-dynamic";

// Calendar apps poll every few minutes at most; this leaves room for several devices.
const FEED_REQUESTS_PER_HOUR = 60;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const textResponse = (body: string, status: number, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers } });

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.match(/^([0-9a-f]{64})\.ics$/)?.[1];
  if (!token) return textResponse("Calendar not found", 404);
  const db = getDb();
  // Only an active member still in the lab that issued the link can be served.
  const feed = await db
    .select({ memberId: calendarFeeds.memberId, groupId: calendarFeeds.groupId, scope: calendarFeeds.scope, labName: groups.name })
    .from(calendarFeeds)
    .innerJoin(members, and(eq(members.id, calendarFeeds.memberId), eq(members.groupId, calendarFeeds.groupId), eq(members.active, true)))
    .innerJoin(groups, eq(groups.id, calendarFeeds.groupId))
    .where(eq(calendarFeeds.tokenHash, await sha256Hex(token)))
    .get();
  if (!feed) return textResponse("Calendar not found", 404);
  if ((await countAttempt(db, "calendar-feed:" + feed.memberId, HOUR)) > FEED_REQUESTS_PER_HOUR) {
    logSecurityEvent("rate_limited", { limit: "calendar-feed", account: feed.memberId });
    return textResponse("Too many requests", 429, { "Retry-After": "3600" });
  }
  const [entries, responses, team] = await Promise.all([
    db.select().from(items).where(eq(items.groupId, feed.groupId)),
    db.select().from(attendance).where(eq(attendance.memberId, feed.memberId)),
    db.select({ id: members.id, name: members.name }).from(members).where(eq(members.groupId, feed.groupId)),
  ]);
  const from = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(Date.now() - FEED_HISTORY_DAYS * DAY);
  const calendar = feedCalendar({ ...feed, from, items: entries, attendance: responses, members: team });
  return new Response(calendar, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="lab-of-time.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
