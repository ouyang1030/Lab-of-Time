// Pure three-way merge between an external calendar feed and imported meetings.
// The last synced external values ("base") are stored per item, so a field the
// member edited locally is kept while untouched fields follow the source.
import type { ImportedEvent, ImportRange } from "./import-calendar.ts";
import { overlapsDates } from "./item-dates.ts";

export type SyncFields = Pick<ImportedEvent, "title" | "date" | "endDate" | "allDay" | "time" | "endTime" | "description" | "location">;
export type SourceData = { uid: string; key: string; fields: SyncFields };
export type ExistingImport = SyncFields & { id: string; ownerId: string; version: number; sourceData: string; hasRsvp: boolean };
export type IncomingImport = { id: string; event: ImportedEvent };
export type SyncPlan = {
  insert: IncomingImport[];
  update: { id: string; version: number; fields: Partial<SyncFields>; sourceData: string }[];
  remove: { id: string; version: number }[];
  preserved: number;
};

// Schedule fields only make sense together; text fields merge independently.
const GROUPS: (keyof SyncFields)[][] = [["date", "endDate", "allDay", "time", "endTime"], ["title"], ["description"], ["location"]];

export async function importedItemId(groupId: string, memberId: string, sourceName: string, key: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([groupId, memberId, sourceName, key])));
  return "ics-" + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function syncFields(source: SyncFields): SyncFields {
  const { title, date, endDate, allDay, time, endTime, description, location } = source;
  return { title, date, endDate, allDay, time, endTime, description, location };
}

export function sourceDataFor(event: ImportedEvent): string {
  return JSON.stringify({ uid: event.uid, key: event.key, fields: syncFields(event) } satisfies SourceData);
}

function readSourceData(row: ExistingImport): SourceData | null {
  if (!row.sourceData) return null;
  return JSON.parse(row.sourceData) as SourceData;
}

const sameGroup = (a: SyncFields, b: SyncFields, group: (keyof SyncFields)[]) => group.every((key) => a[key] === b[key]);

export function planSync({ existing, incoming, incomplete, importerId, range }: {
  existing: ExistingImport[];
  incoming: IncomingImport[];
  incomplete: string[];
  importerId: string;
  range: ImportRange;
}): SyncPlan {
  const plan: SyncPlan = { insert: [], update: [], remove: [], preserved: 0 };
  const rows = new Map(existing.map((row) => [row.id, row]));
  for (const entry of incoming) {
    const row = rows.get(entry.id);
    if (!row) { plan.insert.push(entry); continue; }
    if (row.ownerId !== importerId) { plan.preserved++; continue; }
    const external = syncFields(entry.event), local = syncFields(row);
    // Legacy imports without a stored base count as untouched only while unedited.
    const base = readSourceData(row)?.fields ?? (row.version === 1 ? local : null);
    const fields: Partial<SyncFields> = {};
    let conflict = false;
    for (const group of GROUPS) {
      if (sameGroup(external, local, group)) continue;
      if (base && sameGroup(local, base, group)) Object.assign(fields, Object.fromEntries(group.map((key) => [key, external[key]])));
      else if (!base || !sameGroup(external, base, group)) conflict = true;
    }
    if (conflict) plan.preserved++;
    const sourceData = sourceDataFor(entry.event);
    if (Object.keys(fields).length || sourceData !== row.sourceData)
      plan.update.push({ id: row.id, version: row.version, fields, sourceData });
  }
  // An empty feed is more likely a provider glitch than a deliberate wipe.
  if (!incoming.length) return plan;
  const seen = new Set(incoming.map((entry) => entry.id)), failed = new Set(incomplete);
  for (const row of existing) {
    if (seen.has(row.id) || !overlapsDates(row, range.from, range.to)) continue;
    const source = readSourceData(row);
    const untouched = source && row.ownerId === importerId && !row.hasRsvp && sameGroup(syncFields(row), source.fields, Object.keys(source.fields) as (keyof SyncFields)[]);
    if (untouched && !failed.has(source.uid)) plan.remove.push({ id: row.id, version: row.version });
    else plan.preserved++;
  }
  return plan;
}

