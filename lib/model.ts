import type { RepeatEvery } from "./repeat";

export type View = "week" | "month" | "quarter" | "year";
export type ItemType = "task" | "meeting" | "milestone";
export type Role = "owner" | "admin" | "member";
export const MEMBER_COLORS = {
  blue: "Royal blue",
  emerald: "Green",
  amber: "Ochre",
  rose: "Burgundy",
  purple: "Purple",
  cyan: "Cyan",
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  lime: "Lime",
  teal: "Teal",
  sky: "Powder blue",
  indigo: "Dusty indigo",
  violet: "Lavender",
  fuchsia: "Magenta",
  pink: "Blush",
  slate: "Charcoal",
  stone: "Warm gray",
  brown: "Brown",
  navy: "Navy",
  forest: "Forest",
  sand: "Sand",
} as const;
export type MemberColor = keyof typeof MEMBER_COLORS;
export type Member = {
  id: string;
  name: string;
  role: Role;
  email: string;
  color: MemberColor;
  active: boolean;
};
export type Item = {
  id: string;
  title: string;
  type: ItemType;
  ownerId: string;
  date: string;
  time: string;
  endTime: string;
  /** Empty means the item ends on `date`; exclusive for all-day items. */
  endDate: string;
  allDay: boolean;
  /** Import fields are empty for items created in the app. */
  sourceName: string;
  importBatch: string;
  importedBy: string;
  cycle: View;
  status: "todo" | "doing" | "done";
  priority: "normal" | "high";
  description: string;
  location: string;
  url: string;
  /** Empty for items that do not repeat. */
  seriesId: string;
  repeatEvery: RepeatEvery | "";
  repeatUntil: string;
  version: number;
};
export type Rsvp = { itemId: string; memberId: string; response: "yes" | "no" };
export type Snapshot = {
  hasWorkspace: boolean;
  user: { userId: string; displayName: string; email: string } | null;
  group: { id: string; name: string; inviteCode: string | null } | null;
  members: Member[];
  items: Item[];
  attendance: Rsvp[];
  subscriptions: CalendarSubscription[];
};
/** Sends one workspace command; resolves true once the returned snapshot is applied. */
export type Mutate = (
  command: Record<string, unknown>,
  message?: string,
) => Promise<boolean>;
export type CalendarSubscription = {
  id: string;
  name: string;
  host: string;
  lastSyncAt: number;
  lastOk: boolean;
  lastMessage: string;
};
export const TYPE_LABELS = {
  task: "Task",
  meeting: "Meeting",
  milestone: "Milestone",
};
export const STATUS_LABELS = {
  todo: "To do",
  doing: "In progress",
  done: "Done",
};
export const CYCLE_LABELS = {
  week: "Weekly",
  month: "Monthly",
  quarter: "Quarterly",
  year: "Yearly",
};
export const ROLE_LABELS = { owner: "Owner", admin: "Admin", member: "Member" };
export function canEdit(
  member: Pick<Member, "id" | "role" | "active">,
  item: Pick<Item, "ownerId">,
) {
  return (
    member.active && (member.role !== "member" || item.ownerId === member.id)
  );
}
