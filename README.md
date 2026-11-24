# <img src="public/logo.png" alt="" height="36" align="top"> Lab of Time

Shared research calendar for a lab: tasks, meetings and milestones on weekly, monthly, quarterly and yearly cycles. Runs on Cloudflare Workers with D1.

## Features

- **Calendar**: week, month, quarter and year views (Monday-start, Europe/Vienna time), filters by member and type, search, hover previews, one-click completion.
- **Items**: Mac Calendar–style editor with location, all-day and multi-day dates, repeats (daily to yearly, up to 100 items; changing the rule replaces the later occurrences instead of adding to them), cycle, status, priority, assignee, notes and a URL.
- **Meetings**: time ranges and Attend / Decline responses.
- **Import & subscribe**: ICS files or public HTTPS / `webcal://` feeds (Google, Outlook, Apple, university calendars). Subscriptions sync every 12 hours or on demand, keep local edits, and can be undone per batch.
- **Subscribe & export**: each member can create one secret subscription link (`https://…/api/calendar/<token>.ics`, or `webcal://` for Apple Calendar) for Google Calendar, Apple Calendar or Outlook, showing either *My items* (assigned items and accepted meetings) or the *Whole lab*. The scope can be changed without changing the link. Feeds cover items from the past 90 days onward and leave out events the member imported from other calendars, so those do not appear twice. Calendar apps decide how often they refresh (Google can take up to a day), and subscriptions are read-only. The current period, with filters applied, can still be downloaded as `lab-of-time.ics`.
- **Labs & roles**: email/password accounts; after signing up, a user creates a lab or joins one with an invite code.

| Role | Can |
| --- | --- |
| Owner | Everything an Admin can except leaving, plus renaming the lab (double-click its name in the top bar), member roles, activation, reset codes, ownership transfer, member removal and dissolving the lab (right-click the Owner badge on their own member card) |
| Admin | Edit all lab items, manage invite codes, leave the lab |
| Member | Edit own items, view the lab schedule, RSVP, leave the lab |

Member cards keep role and activation controls in the footer; the **···** menu contains reset codes, ownership transfer and removal. Removing or leaving a lab keeps the account and transfers all owned items (including completed work) to the owner in one transaction. Meeting responses, calendar subscriptions and outstanding lab-issued reset codes are removed. Departed members can create or join another lab. Owners must transfer ownership or dissolve the lab before leaving.

## Local development

Requires Node.js ≥ 22.13. Create `.dev.vars` (git-ignored) with Cloudflare's Turnstile test keys, which accept only the dummy token `XXXX.DUMMY.TOKEN.XXXX`:

```sh
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

```sh
npm ci
npm run build && npm run cf:d1:migrate:local   # first run and after new migrations
npm run dev -- --hostname 127.0.0.1 --port 5173
```

`npm run check` runs the type check, lint, unit tests and integration tests. Integration tests need the dev server, `.dev.vars` and internet access (Turnstile's siteverify is called even with test keys). Each run registers about 18 accounts, so more than five runs an hour hit the site-wide sign-up limit.

## Deployment

One-time setup:

```sh
npx wrangler login
npx wrangler d1 create lab-of-time-db
npm run build
npx wrangler secret put TURNSTILE_SITE_KEY --config dist/server/wrangler.json
npx wrangler secret put TURNSTILE_SECRET_KEY --config dist/server/wrangler.json
```

The Turnstile keys come from a managed-mode widget for the production hostname (Cloudflare dashboard → Turnstile).

Each release:

```sh
CLOUDFLARE_D1_ID=<database-id> npm run build
npm run cf:d1:migrate      # applies pending drizzle/*.sql migrations
npx wrangler deploy --config dist/server/wrangler.json
```

Run migrations before deploying code that depends on them. Roll back with `npx wrangler rollback`.

## Security

- Sessions are random tokens stored as SHA-256 hashes, valid for seven days, in HttpOnly, Secure, SameSite=Lax cookies. Passwords: 12+ characters, bcrypt cost 12.
- Sign-up, sign-in and password reset require Cloudflare Turnstile, checked before any bcrypt work.
- Rate limits use fixed windows keyed by IPv4 address or IPv6 /64:
  - Sign-up: 10 per hour and 30 per day per network, and 100 per hour site-wide.
  - Sign-in and reset: 10 per email per network and 50 per network, per 15 minutes.
  - Signed-in members: 60 write requests per minute.
  - Calendar feeds: 10 per hour.
  - Subscription links: 60 fetches per hour per link.
- Requests are capped at 3 MB (a declared `Content-Length` is required) and labs at 10,000 items. Changing the sign-in email requires the current password.
- Item URLs must be single-line `http(s)` addresses; exported ICS text is escaped.
- Every query is scoped to the member's lab. Anonymous responses contain no lab data.
- Password recovery uses Owner-issued, single-use reset codes valid for 24 hours.
- Ownership transfer is atomic; the former Owner becomes Admin.
- Feed URLs are checked hop by hop against private networks (2 MB, 3 redirects).
- Subscription links carry a 256-bit random token that is shown once and stored only as a SHA-256 hash. A link is served only while its member is active in the lab that issued it. Creating a new link retires the old one, and leaving, removal, account deletion and dissolving the lab delete it.
- Response headers include an enforced CSP plus HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy and Permissions-Policy. Inline scripts stay allowed until vinext supports nonces.
- A daily cron purges expired sessions, rate-limit windows and reset codes, and deletes accounts that have no lab and have not signed in for 700 days.
- Security events are logged as JSON with account IDs and client networks, never emails or passwords.
