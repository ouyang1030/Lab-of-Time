declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    TURNSTILE_SITE_KEY: string;
    TURNSTILE_SECRET_KEY: string;
  }
}
