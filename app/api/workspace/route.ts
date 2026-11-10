import { parseCalendar } from "@/lib/import-calendar";
import { CalendarUrlError, fetchCalendarText, normalizeCalendarUrl } from "@/lib/calendar-url";
import { importedItemId, sourceDataFor } from "@/lib/calendar-merge";
import { CalendarFeedError, syncSubscription } from "@/lib/calendar-subscriptions";
import { hash, compare } from "bcryptjs";
import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import { z, ZodError } from "zod";
import { getDb } from "@/db";
import { groups, members, items, attendance, accounts, sessions, passwordResets, calendarSubscriptions } from "@/db/schema";
import { MEMBER_COLORS, type MemberColor, canEdit } from "@/lib/model";
import { validDate } from "@/lib/calendar";
import { REPEAT_LABELS, MAX_REPEAT_ITEMS, repeatDates, daysBetween, shiftDate, type RepeatEvery } from "@/lib/repeat";
import { clientNetwork } from "@/lib/client-network";
import { logSecurityEvent } from "@/lib/security-log";
import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

const SESSION_COOKIE = "lot_member";
// A 2 MB ICS upload grows when JSON escapes its line breaks.
const MAX_BODY_BYTES = 3_000_000;
const MAX_LAB_ITEMS = 10_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const shortText = z.string().trim().min(1).max(100);
const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address")
  .max(254);
// Links are rendered and exported to ICS, so only plain web addresses are stored.
const webUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => v === "" || (/^https?:\/\/\S+$/i.test(v) && URL.canParse(v)),
    "URL must start with http:// or https://",
  );
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const memberColor = z.enum(Object.keys(MEMBER_COLORS) as [MemberColor, ...MemberColor[]]);
const itemSchema = z
  .object({
    id: z.string().optional(),
    title: shortText,
    type: z.enum(["task", "meeting", "milestone"]),
    ownerId: z.string().min(1),
    date: z.string().refine(validDate, "Please select a valid date"),
    time,
    endTime: time,
    endDate: z.string().refine(v=>v === "" || validDate(v)).default(""),
    allDay: z.boolean().default(false),
    cycle: z.enum(["week", "month", "quarter", "year"]),
    status: z.enum(["todo", "doing", "done"]),
    priority: z.enum(["normal", "high"]),
    description: z.string().max(5000),
    location: z.string().max(200),
    url: webUrl.default(""),
    version: z.number().int().positive().optional(),
  })
  .refine((item) => item.allDay ? item.endDate > item.date : ((item.endDate || item.date) >= item.date && (item.type !== "meeting" || `${item.endDate || item.date}${item.endTime}` >= `${item.date}${item.time}`)), {
    message: "End time must be after start time",
  });

const password = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .refine(
    (v) => new TextEncoder().encode(v).length <= 72,
    "Password must be at most 72 UTF-8 bytes",
  );
const turnstileToken = z
  .string({ required_error: "Complete the human verification" })
  .min(1, "Complete the human verification")
  .max(2048);
const importOptions = { from: z.string().refine(validDate), to: z.string().refine(validDate), sourceName: shortText };
const requestSchema = z.discriminatedUnion("action", [
 z.object({action:z.literal("previewCalendar"),...importOptions,text:z.string().max(2000000).optional(),url:z.string().max(4096).optional()}),
 z.object({action:z.literal("importCalendar"),...importOptions,text:z.string().max(2000000),keys:z.array(z.string()).max(1000)}),
 z.object({action:z.literal("undoCalendarImport"),batch:z.string().uuid()}),
 z.object({action:z.literal("subscribeCalendar"),url:z.string().max(4096),sourceName:shortText}),
 z.object({action:z.literal("syncSubscription"),id:z.string().uuid()}),
 z.object({action:z.literal("unsubscribeCalendar"),id:z.string().uuid(),removeEvents:z.boolean()}),
 z.object({action:z.literal("register"),email,password,displayName:shortText,turnstileToken}),
 z.object({action:z.literal("login"),email,password:z.string().min(1).max(200),turnstileToken}),
 z.object({action:z.literal("transferOwnership"),id:z.string()}),
  z.object({ action: z.literal("issueReset"), id: z.string() }),
  z.object({
    action: z.literal("resetPassword"),
    email,
    code: z.string().trim().min(1).max(100),
    password,
    turnstileToken,
  }),
  z.object({
    action: z.literal("changePassword"),
    current: z.string().min(1).max(200),
    password,
  }),
  z.object({
    action: z.literal("deleteAccount"),
    current: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal("createGroup"),
    name: shortText,
    displayName: shortText,
    color: memberColor,
  }),
  z.object({
    action: z.literal("joinGroup"),
    code: z
      .string({ required_error: "Enter an invite code to join a lab" })
      .trim()
      .min(1, "Enter an invite code to join a lab")
      .max(100),
    displayName: shortText,
    color: memberColor,
  }),
  z.object({ action: z.literal("signOut") }),
  z.object({
    action: z.literal("saveItem"),
    item: itemSchema,
    repeat: z
      .object({
        every: z.enum(Object.keys(REPEAT_LABELS) as [RepeatEvery, ...RepeatEvery[]]),
        until: z.string().refine(validDate, "Please select a valid repeat end date"),
      })
      // Omitted keeps the stored repeat; null sets it to Never.
      .nullable()
      .optional(),
  }),
  z.object({
    action: z.literal("deleteItem"),
    id: z.string(),
    version: z.number().int(),
  }),
  z.object({
    action: z.literal("rsvp"),
    id: z.string(),
    response: z.enum(["yes", "no"]),
  }),
  z.object({
    action: z.literal("profile"),
    name: shortText,
    // Omitted keeps the current sign-in email.
    email: email.optional(),
    color: memberColor,
    current: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal("role"),
    id: z.string(),
    role: z.enum(["admin", "member"]),
  }),
  z.object({ action: z.literal("deactivate"), id: z.string() }),
  z.object({ action: z.literal("removeMember"), id: z.string().min(1) }),
  z.object({ action: z.literal("leaveGroup") }),
  z.object({ action: z.literal("rotateInvite") }),
  z.object({ action: z.literal("renameGroup"), name: shortText }),
  // The owner retypes the lab name to confirm.
  z.object({ action: z.literal("dissolveGroup"), name: z.string().max(100) }),
]);

type Input = z.infer<typeof requestSchema>;
type Action<Name extends Input["action"]> = Extract<Input, { action: Name }>;
type LabMember = typeof members.$inferSelect;

function sessionToken(request: Request) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1) ?? ""
  );
}
async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function sessionAccountId(request: Request): Promise<string | null> {
  const token = sessionToken(request);
  if (!token) return null;
  const session = await getDb()
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, await sha256Hex(token)))
    .get();
  return session && session.expiresAt > Date.now() ? session.accountId : null;
}
/** A null token clears the cookie. */
function sessionCookie(token: string | null, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return token
    ? `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${(7 * DAY) / 1000}; HttpOnly; SameSite=Lax${secure}`
    : `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}
async function newSession(accountId: string, request: Request) {
  const db = getDb();
  const token = crypto.randomUUID() + crypto.randomUUID();
  const now = Date.now();
  await db.batch([
    db.insert(sessions).values({ tokenHash: await sha256Hex(token), accountId, expiresAt: now + 7 * DAY }),
    db.update(accounts).set({ lastSignInAt: now }).where(eq(accounts.id, accountId)),
  ]);
  return sessionCookie(token, request);
}

const RESET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newResetCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(bytes, (b) => RESET_ALPHABET[b % RESET_ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}
function normalizeResetCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
const network = (request: Request) =>
  clientNetwork(request.headers.get("cf-connecting-ip") ?? "local");

type Limit = readonly [key: string, max: number, windowMs: number];
/** Fixed-window counters; the key prefix before ":" names the limit in logs. Keys are hashed because some hold emails. */
async function consumeLimits(request: Request, limits: Limit[]) {
  const now = Date.now();
  for (const [key, max, windowMs] of limits) {
    const row = await getDb().get<{ attempts: number }>(
      sql`INSERT INTO auth_limits (key,attempts,reset_at) VALUES (${await sha256Hex(key)},1,${now + windowMs}) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<=${now} THEN 1 ELSE attempts+1 END, reset_at=CASE WHEN reset_at<=${now} THEN ${now + windowMs} ELSE reset_at END RETURNING attempts`,
    );
    if (row!.attempts > max) {
      logSecurityEvent("rate_limited", { limit: key.slice(0, key.indexOf(":")), network: network(request) });
      throw new HttpError(429, "Too many attempts. Please try again later.");
    }
  }
}

/** Cloudflare Turnstile server-side check; runs before any bcrypt work. */
async function verifyHuman(token: string, request: Request) {
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: request.headers.get("cf-connecting-ip") ?? "",
    }),
  });
  const result = (await response.json()) as { success: boolean; "error-codes": string[] };
  if (result.success) return;
  logSecurityEvent("turnstile_failed", { errors: result["error-codes"], network: network(request) });
  throw new HttpError(403, "Human verification failed. Please try again.");
}

/** Removes a lab with its items, responses, feeds and memberships; accounts and sessions stay. */
function labDeletion(groupId: string) {
  const db = getDb();
  return [
    db.delete(attendance).where(sql`${attendance.itemId} IN (SELECT id FROM items WHERE group_id=${groupId})`),
    db.delete(items).where(eq(items.groupId, groupId)),
    db.delete(calendarSubscriptions).where(eq(calendarSubscriptions.groupId, groupId)),
    db.delete(attendance).where(sql`${attendance.memberId} IN (SELECT id FROM members WHERE group_id=${groupId})`),
    db.delete(members).where(eq(members.groupId, groupId)),
    db.delete(groups).where(eq(groups.id, groupId)),
  ] as const;
}

/** Hand over shared work and remove only the membership, in one D1 transaction. */
async function leaveMembership(input: Action<"removeMember" | "leaveGroup">, me: LabMember) {
  const removing = input.action === "removeMember";
  if (removing && me.role !== "owner")
    throw new HttpError(403, "Only the owner can remove members");
  if (!removing && me.role === "owner")
    throw new HttpError(403, "Transfer ownership or dissolve the lab before leaving");
  const db = getDb();
  const target = removing
    ? await db.select().from(members).where(and(eq(members.id, input.id), eq(members.groupId, me.groupId))).get()
    : me;
  if (!target) throw new HttpError(404, "Member not found in this lab");
  if (target.role === "owner") throw new HttpError(403, "The lab owner cannot be removed");
  const owner = await db.select().from(members).where(and(eq(members.groupId, me.groupId), eq(members.role, "owner"), eq(members.active, true))).get();
  if (!owner) throw new HttpError(409, "Lab owner unavailable. Refresh and try again.");

  // Recheck authority inside the batch so a concurrent transfer cannot remove
  // the new owner or let a former owner remove someone. Delete membership last.
  const permitted = sql`EXISTS (SELECT 1 FROM members o JOIN members t ON t.group_id=o.group_id
    WHERE o.id=${owner.id} AND o.group_id=${me.groupId} AND o.role='owner' AND o.active=1
    AND t.id=${target.id} AND t.role!='owner'
    AND ${removing ? sql`o.id=${me.id}` : sql`t.id=${me.id} AND t.active=1`})`;
  const results = await db.batch([
    db.update(items).set({ ownerId: owner.id, version: sql`${items.version} + 1` })
      .where(and(eq(items.groupId, me.groupId), eq(items.ownerId, target.id), permitted)),
    db.delete(attendance).where(and(eq(attendance.memberId, target.id), permitted)),
    db.delete(calendarSubscriptions).where(and(eq(calendarSubscriptions.memberId, target.id), eq(calendarSubscriptions.groupId, me.groupId), permitted)),
    // A reset issued by the former lab must no longer grant access to this account.
    db.delete(passwordResets).where(and(eq(passwordResets.accountId, target.id), permitted)),
    db.delete(members).where(and(eq(members.id, target.id), eq(members.groupId, me.groupId), permitted)).returning({ id: members.id }),
  ]);
  if (!results[4].length)
    throw new HttpError(409, "Lab membership changed. Refresh and try again.");
  logSecurityEvent(removing ? "member_removed" : "member_left", { by: me.id, target: target.id, lab: me.groupId });
  return jsonResponse(await buildSnapshot(me.id));
}

async function assertLabRoom(groupId: string, adding: number) {
  if ((await getDb().$count(items, eq(items.groupId, groupId))) + adding > MAX_LAB_ITEMS)
    throw new HttpError(400, `A lab can hold at most ${MAX_LAB_ITEMS} items. Delete old items first.`);
}

const jsonResponse = (
  data: unknown,
  status = 200,
  cookie?: string,
): Response => {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (cookie) headers["Set-Cookie"] = cookie;
  return Response.json(data, { status, headers });
};

const SIGNED_OUT_SNAPSHOT = {
  hasWorkspace: false,
  user: null,
  group: null,
  members: [],
  items: [],
  attendance: [],
  subscriptions: [],
};

/** Everything the signed-in account may see; `accountId` comes from a verified session. */
async function buildSnapshot(accountId: string | null) {
  if (!accountId) return SIGNED_OUT_SNAPSHOT;
  const db = getDb();
  const [account, me] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.id, accountId)).get(),
    db.select().from(members).where(eq(members.id, accountId)).get(),
  ]);
  const email = account!.email;
  if (!me?.active)
    return {
      ...SIGNED_OUT_SNAPSHOT,
      user: { userId: accountId, displayName: account!.name, email },
    };
  const [group, team, entries, responses, feeds] = await Promise.all([
    db.select().from(groups).where(eq(groups.id, me.groupId)).get(),
    db
      .select({
        id: members.id,
        name: members.name,
        role: members.role,
        color: members.color,
        active: members.active,
        // Members that predate accounts kept their contact email in `research`.
        email: sql<string>`coalesce(${accounts.email}, ${members.research})`,
      })
      .from(members)
      .leftJoin(accounts, eq(members.id, accounts.id))
      .where(eq(members.groupId, me.groupId)),
    db.select().from(items).where(eq(items.groupId, me.groupId)),
    db
      .select({
        itemId: attendance.itemId,
        memberId: attendance.memberId,
        response: attendance.response,
      })
      .from(attendance)
      .innerJoin(items, eq(attendance.itemId, items.id))
      .where(eq(items.groupId, me.groupId)),
    // Feed URLs can be secret links, so only their owner sees subscriptions.
    db.select().from(calendarSubscriptions).where(eq(calendarSubscriptions.memberId, me.id)),
  ]);
  return {
    hasWorkspace: true,
    user: { userId: me.id, displayName: me.name, email },
    group: {
      ...group!,
      inviteCode: me.role === "member" ? null : group!.inviteCode,
    },
    members: team,
    // Sync bases stay server-side; JSON drops undefined fields.
    items: entries.map((item) => ({ ...item, sourceData: undefined })),
    attendance: responses,
    subscriptions: feeds.map(({ id, name, url, lastSyncAt, lastOk, lastMessage }) => ({ id, name, host: new URL(url).hostname, lastSyncAt, lastOk, lastMessage })),
  };
}

function errorResponse(error: unknown) {
  if (error instanceof HttpError)
    return jsonResponse({ error: error.message }, error.status);
  if (error instanceof ZodError)
    return jsonResponse({ error: error.issues[0].message }, 400);
  if (error instanceof SyntaxError)
    return jsonResponse({ error: "Invalid request format" }, 400);
  // Its messages describe the member's own URL and are written for them.
  if (error instanceof CalendarUrlError)
    return jsonResponse({ error: error.message }, 400);
  console.error("Workspace request failed", error);
  return jsonResponse({ error: "Request failed. Please try again." }, 500);
}

const signedIn = async (accountId: string, request: Request) =>
  jsonResponse(await buildSnapshot(accountId), 200, await newSession(accountId, request));

async function signIn(
  input: Action<"register" | "login" | "resetPassword">,
  request: Request,
) {
  const db = getDb();
  const net = network(request);
  // Registration is limited per network and site-wide; sign-in per email+network so others cannot lock an account.
  await consumeLimits(
    request,
    input.action === "register"
      ? [["register:" + net, 10, HOUR], ["register-day:" + net, 30, DAY], ["register-all:", 100, HOUR]]
      : [[`${input.action}:${input.email}|${net}`, 10, 15 * MINUTE], [`${input.action}-network:${net}`, 50, 15 * MINUTE]],
  );
  await verifyHuman(input.turnstileToken, request);
  const account = await db.select().from(accounts).where(eq(accounts.email, input.email)).get();
  if (input.action === "register") {
    if (account) throw new HttpError(409, "Unable to register this email. Try signing in.");
    const id = crypto.randomUUID();
    await db.insert(accounts).values({
      id,
      email: input.email,
      name: input.displayName,
      passwordHash: await hash(input.password, 12),
    });
    logSecurityEvent("register", { account: id, network: net });
    return signedIn(id, request);
  }
  if (input.action === "resetPassword") {
    const invalid = new HttpError(400, "Invalid or expired reset code");
    if (!account) throw invalid;
    const reset = await db
      .select()
      .from(passwordResets)
      .where(
        and(
          eq(passwordResets.tokenHash, await sha256Hex(normalizeResetCode(input.code))),
          eq(passwordResets.accountId, account.id),
        ),
      )
      .get();
    if (!reset || reset.expiresAt <= Date.now()) throw invalid;
    await db.batch([
      db.update(accounts).set({ passwordHash: await hash(input.password, 12) }).where(eq(accounts.id, account.id)),
      db.delete(passwordResets).where(eq(passwordResets.accountId, account.id)),
      db.delete(sessions).where(eq(sessions.accountId, account.id)),
    ]);
    logSecurityEvent("password_reset", { account: account.id, network: net });
    return signedIn(account.id, request);
  }
  if (!account || !(await compare(input.password, account.passwordHash))) {
    logSecurityEvent("login_failed", { account: account?.id, network: net });
    throw new HttpError(401, "Invalid email or password");
  }
  return signedIn(account.id, request);
}

/** Both actions re-authenticate with the current password. */
async function manageAccount(
  input: Action<"changePassword" | "deleteAccount">,
  accountId: string,
  member: LabMember | undefined,
  request: Request,
) {
  const db = getDb();
  const account = (await db.select().from(accounts).where(eq(accounts.id, accountId)).get())!;
  if (!(await compare(input.current, account.passwordHash)))
    throw new HttpError(401, "Current password is incorrect");
  if (input.action === "changePassword") {
    await db.batch([
      db.update(accounts).set({ passwordHash: await hash(input.password, 12) }).where(eq(accounts.id, account.id)),
      db.delete(sessions).where(eq(sessions.accountId, account.id)),
      db.delete(passwordResets).where(eq(passwordResets.accountId, account.id)),
    ]);
    logSecurityEvent("password_changed", { account: account.id });
    return signedIn(account.id, request);
  }
  const statements = [];
  if (member?.role === "owner") {
    const active = await db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.groupId, member.groupId), eq(members.active, true)));
    if (active.length > 1)
      throw new HttpError(409, "Transfer ownership to another member before deleting your account.");
    statements.push(...labDeletion(member.groupId));
  } else if (member) {
    statements.push(
      db.delete(attendance).where(eq(attendance.memberId, account.id)),
      db.delete(attendance).where(sql`${attendance.itemId} IN (SELECT id FROM items WHERE owner_id=${account.id})`),
      db.delete(items).where(eq(items.ownerId, account.id)),
      db.delete(calendarSubscriptions).where(eq(calendarSubscriptions.memberId, account.id)),
      db.delete(members).where(eq(members.id, account.id)),
    );
  }
  statements.push(
    db.delete(sessions).where(eq(sessions.accountId, account.id)),
    db.delete(passwordResets).where(eq(passwordResets.accountId, account.id)),
    db.delete(accounts).where(eq(accounts.id, account.id)),
  );
  await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
  logSecurityEvent("account_deleted", { account: account.id });
  return jsonResponse(await buildSnapshot(null), 200, sessionCookie(null, request));
}

/** An account belongs to at most one lab; its member row shares the account id. */
async function enterLab(
  input: Action<"createGroup" | "joinGroup">,
  accountId: string,
  member: LabMember | undefined,
) {
  if (member?.active)
    throw new HttpError(409, "You are already in a group. Please refresh.");
  if (member)
    throw new HttpError(403, "Membership inactive. Contact the group owner.");
  const db = getDb();
  if (input.action === "createGroup") {
    const groupId = crypto.randomUUID();
    await db.batch([
      db.insert(groups).values({
        id: groupId,
        name: input.name,
        inviteCode: crypto.randomUUID().replaceAll("-", ""),
      }),
      db.insert(members).values({
        id: accountId,
        groupId,
        name: input.displayName,
        color: input.color,
        role: "owner",
      }),
    ]);
  } else {
    const group = await db.select().from(groups).where(eq(groups.inviteCode, input.code)).get();
    if (!group) throw new HttpError(404, "Invalid invite code");
    await db.insert(members).values({
      id: accountId,
      groupId: group.id,
      name: input.displayName,
      color: input.color,
      role: "member",
    });
  }
  return jsonResponse(await buildSnapshot(accountId));
}

async function manageSubscription(
  input: Action<"subscribeCalendar" | "syncSubscription" | "unsubscribeCalendar">,
  me: LabMember,
  request: Request,
) {
  const db = getDb();
  const withNotice = async (notice: string) =>
    jsonResponse({ ...(await buildSnapshot(me.id)), notice });
  if (input.action === "subscribeCalendar") {
    await consumeLimits(request, [["calendar-url:" + me.id, 10, HOUR]]);
    const url = normalizeCalendarUrl(input.url).toString();
    const mine = await db.select({ name: calendarSubscriptions.name }).from(calendarSubscriptions).where(eq(calendarSubscriptions.memberId, me.id));
    if (mine.some((row) => row.name === input.sourceName)) throw new HttpError(409, "You already subscribe to a calendar with this name");
    if (mine.length >= 10) throw new HttpError(400, "Subscribe to at most 10 calendars");
    const subscription = { id: crypto.randomUUID(), groupId: me.groupId, memberId: me.id, name: input.sourceName, url, createdAt: Date.now(), lastSyncAt: 0, lastOk: true, lastMessage: "" };
    await db.insert(calendarSubscriptions).values(subscription);
    try {
      return await withNotice(`Subscribed to ${input.sourceName}: ${await syncSubscription(db, subscription)}`);
    } catch (error) {
      // Keep the subscription; its stored error explains the failure and the scheduled sync retries.
      if (!(error instanceof CalendarFeedError)) throw error;
      return withNotice(`Subscribed, but the first sync failed: ${error.message}`);
    }
  }
  const subscription = await db.select().from(calendarSubscriptions).where(and(eq(calendarSubscriptions.id, input.id), eq(calendarSubscriptions.memberId, me.id))).get();
  if (!subscription) throw new HttpError(404, "Subscription not found");
  if (input.action === "syncSubscription") {
    if (Date.now() - subscription.lastSyncAt < MINUTE) throw new HttpError(429, "This calendar was synced less than a minute ago");
    try {
      return await withNotice(`${subscription.name}: ${await syncSubscription(db, subscription)}`);
    } catch (error) {
      if (!(error instanceof CalendarFeedError)) throw error;
      throw new HttpError(400, `Sync failed: ${error.message}`);
    }
  }
  const unsubscribe = db.delete(calendarSubscriptions).where(eq(calendarSubscriptions.id, subscription.id));
  // Removal mirrors batch undo: edited, reassigned or RSVP'd meetings stay.
  const removal = db.delete(items).where(and(
    eq(items.groupId, me.groupId), eq(items.importedBy, me.id), eq(items.ownerId, me.id), eq(items.sourceName, subscription.name),
    sql`${items.sourceData} != '' AND json_extract(${items.sourceData}, '$.fields.title') = ${items.title}
      AND json_extract(${items.sourceData}, '$.fields.date') = ${items.date} AND json_extract(${items.sourceData}, '$.fields.endDate') = ${items.endDate}
      AND json_extract(${items.sourceData}, '$.fields.allDay') = ${items.allDay} AND json_extract(${items.sourceData}, '$.fields.time') = ${items.time} AND json_extract(${items.sourceData}, '$.fields.endTime') = ${items.endTime}
      AND json_extract(${items.sourceData}, '$.fields.description') = ${items.description} AND json_extract(${items.sourceData}, '$.fields.location') = ${items.location}
      AND NOT EXISTS (SELECT 1 FROM attendance WHERE attendance.item_id = ${items.id})`,
  ));
  await db.batch(input.removeEvents ? [unsubscribe, removal] : [unsubscribe]);
  return withNotice(input.removeEvents ? `Stopped syncing ${subscription.name} and removed its unedited meetings` : `Stopped syncing ${subscription.name}; its meetings remain`);
}

async function importCalendar(
  input: Action<"previewCalendar" | "importCalendar">,
  me: LabMember,
  request: Request,
) {
  const db = getDb();
  let calendarText = input.text;
  if (input.action === "previewCalendar" && input.url) {
    await consumeLimits(request, [["calendar-url:" + me.id, 10, HOUR]]);
    calendarText = await fetchCalendarText(input.url);
  }
  if (!calendarText) throw new HttpError(400, "Choose a file or enter an ICS URL");
  let parsed;
  try {
    parsed = parseCalendar(calendarText, { from: input.from, to: input.to });
  } catch (error) {
    // The parser only fails on the calendar content the member supplied.
    throw new HttpError(400, error instanceof Error ? error.message : "Invalid calendar");
  }
  const existing = await db.select({ id: items.id, sourceName: items.sourceName }).from(items).where(eq(items.groupId, me.groupId));
  const ids = new Set(existing.map((row) => row.id));
  // Imports that predate calendar names keep their original ids, which left the name out.
  const legacyIds = new Set(existing.filter((row) => !row.sourceName).map((row) => row.id));
  const events = await Promise.all(parsed.events.map(async (event) => {
    const legacyId = "ics-" + (await sha256Hex(JSON.stringify([me.groupId, me.id, event.key])));
    return { ...event, id: legacyIds.has(legacyId) ? legacyId : await importedItemId(me.groupId, me.id, input.sourceName, event.key) };
  }));
  if (input.action === "previewCalendar")
    return jsonResponse({ text: calendarText, events: events.map((event) => ({ ...event, duplicate: ids.has(event.id) })), warnings: parsed.warnings });
  const selected = new Set(input.keys);
  const unique = new Map(events.filter((event) => selected.has(event.key) && !ids.has(event.id)).map((event) => [event.id, event]));
  if (unique.size > 100) throw new HttpError(400, "Import at most 100 events at a time");
  await assertLabRoom(me.groupId, unique.size);
  const batch = crypto.randomUUID();
  const inserts = [...unique.values()].map((event) => db.insert(items).values({ id: event.id, title: event.title, date: event.date, endDate: event.endDate, allDay: event.allDay, sourceName: input.sourceName, sourceData: sourceDataFor(event), importBatch: batch, importedBy: me.id, time: event.time, endTime: event.endTime, description: event.description, location: event.location, groupId: me.groupId, ownerId: me.id, type: "meeting" as const, cycle: "week" as const, status: "todo" as const, priority: "normal" as const, version: 1 }).onConflictDoNothing().returning({ id: items.id }));
  const saved = inserts.length ? await db.batch(inserts as [typeof inserts[number], ...typeof inserts[number][]]) : [];
  const count = saved.reduce((sum, rows) => sum + rows.length, 0);
  return jsonResponse({ ...(await buildSnapshot(me.id)), notice: `Imported ${count} meetings; ${selected.size - count} skipped.` });
}

/** Creates or updates an item and its repeat series. Returns a notice when a series changed. */
async function saveItem(input: Action<"saveItem">, me: LabMember) {
  const db = getDb();
  const { id, version, ...fields } = input.item;
  const assignee = await db
    .select()
    .from(members)
    .where(
      and(
        eq(members.id, fields.ownerId),
        eq(members.groupId, me.groupId),
        eq(members.active, true),
      ),
    )
    .get();
  if (!assignee)
    throw new HttpError(400, "Assignee must be an active group member");
  if (me.role === "member" && fields.ownerId !== me.id)
    throw new HttpError(403, "Members can only assign items to themselves");
  const existing = id
    ? await db
        .select()
        .from(items)
        .where(and(eq(items.id, id), eq(items.groupId, me.groupId)))
        .get()
    : undefined;
  if (id && !existing)
    throw new HttpError(404, "Item was deleted. Please refresh.");
  if (existing && !canEdit(me, existing))
    throw new HttpError(403, "Only the assignee or an admin can edit this item");
  const repeat = input.repeat ?? null;
  // A repeat is an overriding setting: only a changed rule rebuilds the
  // series, so ordinary edits and status toggles touch just this item.
  const rebuild =
    !existing ||
    (input.repeat !== undefined &&
      (existing.repeatEvery !== (repeat?.every ?? "") ||
        existing.repeatUntil !== (repeat?.until ?? "")));
  const dates = rebuild && repeat
    ? repeatDates(fields.date, repeat.every, repeat.until)
    : [fields.date];
  if (!dates.length)
    throw new HttpError(400, "Repeat must end on or after the start date");
  if (dates.length > MAX_REPEAT_ITEMS)
    throw new HttpError(
      400,
      `Repeat would create more than ${MAX_REPEAT_ITEMS} items. Choose an earlier end date.`,
    );
  // The saved item is the first occurrence; every later date is a new item.
  const newDates = existing ? dates.slice(1) : dates;
  if (newDates.length) await assertLabRoom(me.groupId, newDates.length);
  const series = {
    seriesId: repeat ? existing?.seriesId || crypto.randomUUID() : "",
    repeatEvery: repeat?.every ?? ("" as const),
    repeatUntil: repeat?.until ?? "",
  };
  if (existing) {
    const changed = await db
      .update(items)
      .set({
        ...fields,
        ...(rebuild ? series : {}),
        version: sql`${items.version} + 1`,
      })
      .where(and(eq(items.id, existing.id), eq(items.version, version ?? 0)))
      .returning();
    if (!changed.length)
      throw new HttpError(
        409,
        "Item was updated by another member. Refresh and try again.",
      );
  }
  const inserts = newDates.map((date) =>
    db.insert(items).values({
      ...fields,
      ...series,
      date,
      endDate: fields.endDate
        ? shiftDate(fields.endDate, daysBetween(fields.date, date))
        : "",
      id: crypto.randomUUID(),
      groupId: me.groupId,
    }),
  );
  let replaced = 0;
  if (rebuild && existing?.seriesId) {
    // Like "this and following events": later occurrences of the old rule
    // are replaced; earlier ones keep their rule, now ending before this item.
    const sameSeries = and(
      eq(items.groupId, me.groupId),
      eq(items.seriesId, existing.seriesId),
      ne(items.id, existing.id),
      me.role === "member" ? eq(items.ownerId, me.id) : undefined,
    );
    const [removed] = await db.batch([
      db
        .delete(items)
        .where(and(sameSeries, gt(items.date, existing.date)))
        .returning({ id: items.id }),
      db
        .update(items)
        .set({
          repeatUntil: shiftDate(existing.date, -1),
          version: sql`${items.version} + 1`,
        })
        .where(and(sameSeries, lt(items.date, existing.date))),
      ...inserts,
    ]);
    replaced = removed.length;
  } else if (inserts.length) {
    await db.batch(
      inserts as [(typeof inserts)[number], ...(typeof inserts)[number][]],
    );
  }
  if (replaced)
    return newDates.length
      ? `Repeat updated: replaced ${replaced} later items with ${newDates.length}`
      : `Repeat updated: removed ${replaced} later items`;
  return dates.length > 1 ? `Created ${newDates.length} repeating items` : "";
}

export async function GET(request: Request) {
  try {
    return jsonResponse(await buildSnapshot(await sessionAccountId(request)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new HttpError(403, "Invalid request origin");
    // Browsers send Content-Length for these JSON bodies; a missing one is rejected too.
    const length = request.headers.get("content-length");
    if (length === null || !(Number(length) <= MAX_BODY_BYTES))
      throw new HttpError(413, "Request is too large");
    const input = requestSchema.parse(await request.json());
    if (input.action === "register" || input.action === "login" || input.action === "resetPassword")
      return await signIn(input, request);
    const db = getDb();
    if (input.action === "signOut") {
      await db.delete(sessions).where(eq(sessions.tokenHash, await sha256Hex(sessionToken(request))));
      return jsonResponse(await buildSnapshot(null), 200, sessionCookie(null, request));
    }

    const accountId = await sessionAccountId(request);
    if (!accountId) throw new HttpError(401, "Please sign in first");
    await consumeLimits(request, [["writes:" + accountId, 60, MINUTE]]);
    const member = await db.select().from(members).where(eq(members.id, accountId)).get();
    if (input.action === "changePassword" || input.action === "deleteAccount")
      return await manageAccount(input, accountId, member, request);
    if (input.action === "createGroup" || input.action === "joinGroup")
      return await enterLab(input, accountId, member);

    // Every action below belongs to the member's own lab.
    if (!member?.active)
      throw new HttpError(403, "Create or join a research group first");
    const me = member;
    if (input.action === "removeMember" || input.action === "leaveGroup")
      return await leaveMembership(input, me);
    if (input.action === "subscribeCalendar" || input.action === "syncSubscription" || input.action === "unsubscribeCalendar")
      return await manageSubscription(input, me, request);
    if (input.action === "previewCalendar" || input.action === "importCalendar")
      return await importCalendar(input, me, request);
    if (input.action === "undoCalendarImport") {
      const removed = await db
        .delete(items)
        .where(
          and(
            eq(items.groupId, me.groupId),
            eq(items.importBatch, input.batch),
            eq(items.importedBy, me.id),
            eq(items.ownerId, me.id),
            eq(items.version, 1),
            sql`NOT EXISTS (SELECT 1 FROM attendance WHERE attendance.item_id = items.id)`,
          ),
        )
        .returning({ id: items.id });
      return jsonResponse({ ...(await buildSnapshot(me.id)), notice: `Removed ${removed.length} meetings. Edited, reassigned or RSVP'd meetings were preserved.` });
    }

    if (input.action === "saveItem") {
      const notice = await saveItem(input, me);
      if (notice)
        return jsonResponse({ ...(await buildSnapshot(me.id)), notice });
    } else if (input.action === "deleteItem" || input.action === "rsvp") {
      const item = await db
        .select()
        .from(items)
        .where(and(eq(items.id, input.id), eq(items.groupId, me.groupId)))
        .get();
      if (!item) throw new HttpError(404, "Item not found");
      if (input.action === "deleteItem") {
        if (!canEdit(me, item))
          throw new HttpError(
            403,
            "You do not have permission to delete this item",
          );
        const changed = await db
          .delete(items)
          .where(and(eq(items.id, item.id), eq(items.version, input.version)))
          .returning();
        if (!changed.length)
          throw new HttpError(409, "Item was updated. Refresh and try again.");
      } else {
        if (item.type !== "meeting")
          throw new HttpError(400, "RSVP is only available for meetings");
        await db
          .insert(attendance)
          .values({
            itemId: item.id,
            memberId: me.id,
            response: input.response,
          })
          .onConflictDoUpdate({
            target: [attendance.itemId, attendance.memberId],
            set: { response: input.response },
          });
      }
    } else if (input.action === "profile") {
      const account = (await db.select().from(accounts).where(eq(accounts.id, me.id)).get())!;
      const email = input.email ?? account.email;
      if (email !== account.email) {
        // The password comes first so this cannot be used to probe which emails are registered.
        if (!(await compare(input.current ?? "", account.passwordHash)))
          throw new HttpError(401, "Enter your current password to change your email");
        const taken = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.email, email))
          .get();
        if (taken)
          throw new HttpError(409, "Email is already in use by another account");
        logSecurityEvent("email_changed", { account: me.id });
      }
      await db.batch([
        db.update(accounts).set({ email, name: input.name }).where(eq(accounts.id, me.id)),
        db.update(members).set({ name: input.name, color: input.color }).where(eq(members.id, me.id)),
      ]);
    } else if (input.action === "transferOwnership") {
      if (me.role !== "owner")
        throw new HttpError(403, "Only the owner can transfer ownership");
      const changed = await db.run(sql`WITH permitted AS MATERIALIZED (SELECT o.id AS old_id,t.id AS new_id FROM members o JOIN members t ON t.group_id=o.group_id WHERE o.id=${me.id} AND o.group_id=${me.groupId} AND o.role='owner' AND o.active=1 AND t.id=${input.id} AND t.active=1 AND t.role!='owner' AND EXISTS (SELECT 1 FROM accounts a WHERE a.id=t.id)) UPDATE members SET role=CASE WHEN id=${input.id} THEN 'owner' ELSE 'admin' END WHERE id IN (SELECT old_id FROM permitted UNION ALL SELECT new_id FROM permitted)`);
      if (changed.meta.changes !== 2)
        throw new HttpError(409, "Ownership changed or recipient is unavailable. Refresh and retry.");
      logSecurityEvent("ownership_transferred", { by: me.id, to: input.id });
    } else if (input.action === "issueReset") {
      if (me.role !== "owner")
        throw new HttpError(403, "Only the group owner can issue password reset codes");
      const target = await db
        .select({ id: members.id })
        .from(members)
        .innerJoin(accounts, eq(accounts.id, members.id))
        .where(and(eq(members.id, input.id), eq(members.groupId, me.groupId)))
        .get();
      if (!target || target.id === me.id)
        throw new HttpError(400, "Choose another registered member of this lab");
      const code = newResetCode();
      await db.batch([
        db.delete(passwordResets).where(eq(passwordResets.accountId, target.id)),
        db.insert(passwordResets).values({
          tokenHash: await sha256Hex(normalizeResetCode(code)),
          accountId: target.id,
          expiresAt: Date.now() + DAY,
        }),
      ]);
      logSecurityEvent("reset_issued", { by: me.id, target: target.id });
      return jsonResponse({ ...(await buildSnapshot(me.id)), resetCode: code });
    } else if (input.action === "rotateInvite") {
      if (me.role === "member")
        throw new HttpError(403, "Only admins can rotate the invite code");
      await db
        .update(groups)
        .set({ inviteCode: crypto.randomUUID().replaceAll("-", "") })
        .where(eq(groups.id, me.groupId));
      logSecurityEvent("invite_rotated", { by: me.id });
    } else if (input.action === "renameGroup") {
      if (me.role !== "owner")
        throw new HttpError(403, "Only the owner can rename the lab");
      await db
        .update(groups)
        .set({ name: input.name })
        .where(eq(groups.id, me.groupId));
    } else if (input.action === "dissolveGroup") {
      if (me.role !== "owner")
        throw new HttpError(403, "Only the owner can dissolve the lab");
      const group = await db.select().from(groups).where(eq(groups.id, me.groupId)).get();
      if (input.name.trim() !== group!.name)
        throw new HttpError(400, "Type the lab name exactly to confirm");
      await db.batch(labDeletion(me.groupId));
      logSecurityEvent("lab_dissolved", { by: me.id, lab: me.groupId });
    } else {
      if (me.role !== "owner")
        throw new HttpError(403, "Only the group owner can manage members");
      const target = await db
        .select()
        .from(members)
        .where(and(eq(members.id, input.id), eq(members.groupId, me.groupId)))
        .get();
      if (!target || target.role === "owner")
        throw new HttpError(400, "Cannot modify the group owner");
      await db
        .update(members)
        .set(
          input.action === "role"
            ? { role: input.role, active: true }
            : { active: false },
        )
        .where(eq(members.id, target.id));
      logSecurityEvent(input.action === "role" ? "role_changed" : "member_deactivated", {
        by: me.id,
        target: target.id,
        ...(input.action === "role" ? { role: input.role } : {}),
      });
    }
    return jsonResponse(await buildSnapshot(me.id));
  } catch (error) {
    return errorResponse(error);
  }
}
