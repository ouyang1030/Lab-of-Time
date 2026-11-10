import { env } from "cloudflare:workers";
import ResearchApp from "./research-app";
// The Turnstile site key is runtime configuration, so this page renders per request.
export const dynamic = "force-dynamic";
export default function Home() {
  return <ResearchApp turnstileSiteKey={env.TURNSTILE_SITE_KEY} />;
}
