// Runs one subscription sync against D1: fetch → parse → three-way merge → write.
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { attendance, calendarSubscriptions, items, members } from "../db/schema";
import { fetchCalendarText } from "./calendar-url";
import { defaultImportRange, parseCalendar } from "./import-calendar";
import { importedItemId, planSync, sourceDataFor } from "./calendar-merge";

type Db = DrizzleD1Database<typeof schema>;
type Subscription = typeof calendarSubscriptions.$inferSelect;

export const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
const BATCH_SIZE = 50;

async function runBatches(db: Db, statements: unknown[]) {
  for (let i = 0; i < statements.length; i += BATCH_SIZE)
    await db.batch(statements.slice(i, i + BATCH_SIZE) as unknown as Parameters<Db["batch"]>[0]);
}

/** The feed could not be fetched or parsed; the message is written for its subscriber. */
export class CalendarFeedError extends Error {}

/** Syncs one subscription and records the outcome on it. Returns the summary message. */
export async function syncSubscription(db: Db, subscription: Subscription, now = new Date()) {
  const finish = (ok: boolean, message: string) =>
    db.update(calendarSubscriptions)
      .set({ lastSyncAt: now.getTime(), lastOk: ok, lastMessage: message.slice(0, 300) })
      .where(eq(calendarSubscriptions.id, subscription.id));
  const range = defaultImportRange(now);
  let parsed;
  try {
    parsed = parseCalendar(await fetchCalendarText(subscription.url), range);
  } catch (error) {
    // Only the external feed can fail here; database errors below stay internal.
    const message = error instanceof Error ? error.message : "Could not read calendar";
    await finish(false, message);
    throw new CalendarFeedError(message);
  }
  const incoming = await Promise.all(parsed.events.map(async (event) => ({
    id: await importedItemId(subscription.groupId, subscription.memberId, subscription.name, event.key),
    event,
  })));
  const rows = await db.select().from(items).where(and(
    eq(items.groupId, subscription.groupId),
    eq(items.importedBy, subscription.memberId),
    eq(items.sourceName, subscription.name),
  ));
  const rsvp = new Set<string>();
  for (let i = 0; i < rows.length; i += 90) {
    const ids = rows.slice(i, i + 90).map((row) => row.id);
    for (const row of await db.selectDistinct({ itemId: attendance.itemId }).from(attendance).where(inArray(attendance.itemId, ids)))
      rsvp.add(row.itemId);
  }
  const plan = planSync({
    existing: rows.map((row) => ({ ...row, hasRsvp: rsvp.has(row.id) })),
    incoming,
    incomplete: parsed.incomplete,
    importerId: subscription.memberId,
    range,
  });
  const statements = [
    ...plan.insert.map(({ id, event }) => db.insert(items).values({
      id, groupId: subscription.groupId, ownerId: subscription.memberId, importedBy: subscription.memberId,
      sourceName: subscription.name, sourceData: sourceDataFor(event), importBatch: "",
      title: event.title, date: event.date, endDate: event.endDate, allDay: event.allDay, time: event.time,
      endTime: event.endTime, description: event.description, location: event.location,
      type: "meeting" as const, cycle: "week" as const, status: "todo" as const, priority: "normal" as const, version: 1,
    }).onConflictDoNothing()),
    ...plan.update.map((change) => db.update(items)
      .set({ ...change.fields, sourceData: change.sourceData, ...(Object.keys(change.fields).length ? { version: change.version + 1 } : {}) })
      .where(and(eq(items.id, change.id), eq(items.version, change.version)))),
    ...plan.remove.map((entry) => db.delete(items).where(and(
      eq(items.id, entry.id), eq(items.version, entry.version),
      sql`NOT EXISTS (SELECT 1 FROM attendance WHERE attendance.item_id = ${items.id})`,
    ))),
  ];
  await runBatches(db, statements);
  const changed = plan.update.filter((change) => Object.keys(change.fields).length).length;
  const parts = [`${plan.insert.length} added`, `${changed} updated`, `${plan.remove.length} removed`];
  if (plan.preserved) parts.push(`${plan.preserved} kept with local edits`);
  if (parsed.warnings.length) parts.push(`${parsed.warnings.length} skipped`);
  const message = parts.join(" · ");
  await finish(true, message);
  return message;
}

/** Cron entry point: syncs the subscriptions that are most overdue (every 12 hours). */
export async function syncDueSubscriptions(db: Db, limit = 20, now = new Date()) {
  const graceMs = 5 * 60 * 1000;
  const due = await db.select({ subscription: calendarSubscriptions })
    .from(calendarSubscriptions)
    .innerJoin(members, eq(members.id, calendarSubscriptions.memberId))
    .where(and(eq(members.active, true), sql`${calendarSubscriptions.lastSyncAt} <= ${now.getTime() - (SYNC_INTERVAL_MS - graceMs)}`))
    .orderBy(calendarSubscriptions.lastSyncAt)
    .limit(limit);
  for (const { subscription } of due) {
    try {
      await syncSubscription(db, subscription, now);
    } catch (error) {
      // One broken feed must not stop the rest; feed failures are also stored on the subscription.
      console.warn("Calendar subscription sync failed", subscription.id, error);
    }
  }
}
