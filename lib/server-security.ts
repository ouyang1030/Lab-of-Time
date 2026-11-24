// Hashing and rate-limit counters shared by the API routes.
import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema";

export async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Counts one attempt in a fixed window and returns the window's total. Keys are hashed because some hold emails. */
export async function countAttempt(db: DrizzleD1Database<typeof schema>, key: string, windowMs: number) {
  const now = Date.now();
  const row = await db.get<{ attempts: number }>(
    sql`INSERT INTO auth_limits (key,attempts,reset_at) VALUES (${await sha256Hex(key)},1,${now + windowMs}) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<=${now} THEN 1 ELSE attempts+1 END, reset_at=CASE WHEN reset_at<=${now} THEN ${now + windowMs} ELSE reset_at END RETURNING attempts`,
  );
  return row!.attempts;
}
