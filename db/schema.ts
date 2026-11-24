import { FEED_SCOPES, MEMBER_COLORS, type MemberColor } from "../lib/model";
import type { RepeatEvery } from "../lib/repeat";
import {
  integer,
  sqliteTable,
  text,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
});
export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  groupId: text("group_id")
    .notNull()
    .references(() => groups.id),
  name: text("name").notNull(),
  role: text("role", { enum: ["owner", "admin", "member"] }).notNull(),
  research: text("research").notNull().default(""),
  color: text("color", {
    enum: Object.keys(MEMBER_COLORS) as [MemberColor, ...MemberColor[]],
  })
    .notNull()
    .default("blue"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});
export const items = sqliteTable("items", {
  id: text("id").primaryKey(),
  groupId: text("group_id")
    .notNull()
    .references(() => groups.id),
  title: text("title").notNull(),
  type: text("type", { enum: ["task", "meeting", "milestone"] }).notNull(),
  ownerId: text("owner_id").notNull(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  endTime: text("end_time").notNull(),
  endDate: text("end_date").notNull().default(""),
  allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
  sourceName: text("source_name").notNull().default(""),
  importBatch: text("import_batch").notNull().default(""),
  importedBy: text("imported_by").notNull().default(""),
  sourceData: text("source_data").notNull().default(""),
  cycle: text("cycle", {
    enum: ["week", "month", "quarter", "year"],
  }).notNull(),
  status: text("status", { enum: ["todo", "doing", "done"] }).notNull(),
  priority: text("priority", { enum: ["normal", "high"] }).notNull(),
  description: text("description").notNull(),
  location: text("location").notNull(),
  url: text("url").notNull().default(""),
  // Occurrences created by one repeat share a series; "" means a single item.
  seriesId: text("series_id").notNull().default(""),
  repeatEvery: text("repeat_every").$type<RepeatEvery | "">().notNull().default(""),
  repeatUntil: text("repeat_until").notNull().default(""),
  version: integer("version").notNull().default(1),
},
  // Every lab query, including the 30-second snapshot poll, filters by lab.
  (table) => [index("items_group_id").on(table.groupId)],
);
export const attendance = sqliteTable(
  "attendance",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    response: text("response", { enum: ["yes", "no"] }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.memberId] })],
);

export const accounts = sqliteTable("accounts", {
 id: text("id").primaryKey(), email: text("email").notNull().unique(), passwordHash: text("password_hash").notNull(), name: text("name").notNull(),
 // Idle-account cleanup counts from here; set on every new session.
 lastSignInAt: integer("last_sign_in_at").notNull().default(0),
});
export const sessions = sqliteTable("sessions", {
 tokenHash: text("token_hash").primaryKey(), accountId: text("account_id").notNull().references(()=>accounts.id), expiresAt: integer("expires_at").notNull(),
});
export const authLimits = sqliteTable("auth_limits", {
 key: text("key").primaryKey(), attempts: integer("attempts").notNull(), resetAt: integer("reset_at").notNull(),
});
export const passwordResets = sqliteTable("password_resets", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
});
export const calendarSubscriptions = sqliteTable(
  "calendar_subscriptions",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    name: text("name").notNull(),
    url: text("url").notNull(),
    createdAt: integer("created_at").notNull(),
    lastSyncAt: integer("last_sync_at").notNull().default(0),
    lastOk: integer("last_ok", { mode: "boolean" }).notNull().default(true),
    lastMessage: text("last_message").notNull().default(""),
  },
  (table) => [uniqueIndex("calendar_subscriptions_member_name").on(table.memberId, table.name)],
);
/** One secret subscription link per member; only the token's SHA-256 is stored. */
export const calendarFeeds = sqliteTable("calendar_feeds", {
  memberId: text("member_id")
    .primaryKey()
    .references(() => members.id),
  groupId: text("group_id")
    .notNull()
    .references(() => groups.id),
  tokenHash: text("token_hash").notNull().unique(),
  scope: text("scope", { enum: FEED_SCOPES }).notNull(),
  createdAt: integer("created_at").notNull(),
});
