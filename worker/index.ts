import handler from "vinext/server/fetch-handler";
import { getDb } from "../db";
import { syncDueSubscriptions } from "../lib/calendar-subscriptions";
import { logSecurityEvent } from "../lib/security-log";

// Accounts outside every lab are removed after this long without signing in.
const IDLE_ACCOUNT_MS = 700 * 24 * 60 * 60 * 1000;
// vinext's RSC bootstrap scripts are inline and carry per-request data, so they
// cannot be hashed; drop 'unsafe-inline' once vinext supports script nonces.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function applySecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  if (new URL(request.url).protocol === "https:") {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const worker = {
  async fetch(
    request: Request,
    env: Cloudflare.Env,
    ctx: ExecutionContext,
  ) {
    const response = await handler.fetch(request, env, ctx);
    return applySecurityHeaders(response, request);
  },

  async scheduled(
    event: ScheduledEvent,
    env: Cloudflare.Env,
    ctx: ExecutionContext,
  ) {
    // Scheduled crons:
    // - Every 12 hours ("0 */12 * * *"): poll and sync due calendar subscriptions.
    // - Daily at 03:00 ("0 3 * * *"): purge expired sessions, rate limits, reset tokens, and idle accounts.
    const tasks: Promise<unknown>[] = [syncDueSubscriptions(getDb())];
    if (event.cron === "0 3 * * *") {
      const now = Date.now();
      tasks.push(
        env.DB.batch([
          env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
          env.DB.prepare("DELETE FROM auth_limits WHERE reset_at <= ?").bind(now),
          env.DB.prepare(
            "DELETE FROM password_resets WHERE expires_at <= ?",
          ).bind(now),
          // Live sessions refresh last_sign_in_at, so idle accounts have none left.
          env.DB.prepare(
            "DELETE FROM accounts WHERE last_sign_in_at <= ? AND id NOT IN (SELECT id FROM members)",
          ).bind(now - IDLE_ACCOUNT_MS),
        ]).then((results) =>
          logSecurityEvent("idle_accounts_purged", { count: results[3].meta.changes }),
        ),
      );
    }
    ctx.waitUntil(Promise.all(tasks));
  },
};

export default worker;
