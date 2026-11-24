import { FEED_SCOPE_LABELS, TYPE_LABELS, type FeedScope, type Item, type Member, type Rsvp } from "./model.ts";
import { lastItemDate } from "./item-dates.ts";
import { toCalendar } from "./ics.ts";

/** Subscribed calendars receive items that end on or after this many days ago. */
export const FEED_HISTORY_DAYS = 90;

export type FeedSource = {
  memberId: string;
  scope: FeedScope;
  labName: string;
  /** First date included, YYYY-MM-DD in Europe/Vienna. */
  from: string;
  items: Item[];
  attendance: Rsvp[];
  members: Pick<Member, "id" | "name">[];
};

/**
 * "mine" is what the member is assigned plus meetings they accepted; "lab" is
 * the whole lab calendar. Events the member imported from another calendar are
 * left out so subscribing them back does not duplicate the source.
 */
export function feedItems({ memberId, scope, from, items, attendance }: FeedSource): Item[] {
  const attending = new Set(
    attendance
      .filter((row) => row.memberId === memberId && row.response === "yes")
      .map((row) => row.itemId),
  );
  return items.filter(
    (item) =>
      item.importedBy !== memberId &&
      lastItemDate(item) >= from &&
      (scope === "lab" || item.ownerId === memberId || attending.has(item.id)),
  );
}

export function feedCalendar(source: FeedSource, now = new Date()): string {
  const names = new Map(source.members.map((member) => [member.id, member.name]));
  // Calendar apps have no assignee field, so it leads the notes. Departing
  // members hand their items to the owner, so every owner is a lab member.
  const entries = feedItems(source).map((item) => ({
    ...item,
    description: [
      `${TYPE_LABELS[item.type]} · ${names.get(item.ownerId)!}`,
      item.description,
    ]
      .filter(Boolean)
      .join("\n\n"),
  }));
  return toCalendar(entries, {
    name: `${source.labName} · ${FEED_SCOPE_LABELS[source.scope]}`,
    now,
  });
}
