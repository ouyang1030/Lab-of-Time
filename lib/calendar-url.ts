// Fetches public ICS feeds (Google, Outlook, iCloud/macOS Calendar, university
// calendars…) while refusing private networks: every hop's host is validated
// and resolved through DNS-over-HTTPS before the request is sent.
export const CALENDAR_MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

export class CalendarUrlError extends Error {}

/** Normalizes webcal(s) links and rejects URLs that cannot be public HTTPS feeds. */
export function normalizeCalendarUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim().replace(/^webcals?:/i, "https:"));
  } catch {
    throw new CalendarUrlError("Enter a valid calendar URL");
  }
  if (url.protocol !== "https:")
    throw new CalendarUrlError("Calendar URLs must use HTTPS or webcal");
  if (url.username || url.password)
    throw new CalendarUrlError("Calendar URLs must not contain credentials");
  if (url.port && url.port !== "443")
    throw new CalendarUrlError("Calendar URLs must use the default HTTPS port");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    host.startsWith("[") ||
    /^\d+(\.\d+){3}$/.test(host) ||
    !host.includes(".") ||
    /(^|\.)(localhost|local|internal|intranet|lan|home|corp|arpa)$/.test(host)
  )
    throw new CalendarUrlError("Calendar URLs must use a public host name");
  url.hash = "";
  return url;
}

/** True for loopback, private, link-local, CGNAT, multicast and reserved ranges. */
export function isPrivateAddress(address: string): boolean {
  const v4 = address.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = address.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  return (
    v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) ||
    v6.startsWith("ff") || v6.startsWith("64:ff9b:") || v6.startsWith("2001:db8")
  );
}

type Fetcher = typeof fetch;

async function assertPublicHost(host: string, fetcher: Fetcher) {
  const answers: string[] = [];
  for (const type of ["A", "AAAA"]) {
    const response = await fetcher(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
      { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) throw new CalendarUrlError("Could not resolve calendar host");
    const result = (await response.json()) as { Answer?: { type: number; data: string }[] };
    for (const record of result.Answer ?? [])
      if (record.type === 1 || record.type === 28) answers.push(record.data);
  }
  if (!answers.length) throw new CalendarUrlError("Calendar host does not resolve");
  if (answers.some(isPrivateAddress))
    throw new CalendarUrlError("Calendar host resolves to a private network");
}

/** Downloads an ICS feed, following at most three validated redirects. */
export async function fetchCalendarText(input: string, fetcher: Fetcher = fetch): Promise<string> {
  let url = normalizeCalendarUrl(input);
  for (let hop = 0; ; hop++) {
    await assertPublicHost(url.hostname, fetcher);
    const response = await fetcher(url, {
      redirect: "manual",
      headers: { accept: "text/calendar, text/plain;q=0.8, */*;q=0.1", "user-agent": "LabOfTime-CalendarSync/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      if (hop >= MAX_REDIRECTS) throw new CalendarUrlError("Calendar URL redirects too many times");
      url = normalizeCalendarUrl(new URL(location, url).toString());
      continue;
    }
    if (response.status === 401 || response.status === 403)
      throw new CalendarUrlError("Calendar URL requires sign-in; use a public or secret ICS link");
    if (!response.ok || !response.body)
      throw new CalendarUrlError(`Could not read calendar URL (HTTP ${response.status})`);
    const declared = Number(response.headers.get("content-length"));
    if (declared > CALENDAR_MAX_BYTES) throw new CalendarUrlError("Calendar exceeds the 2 MB limit");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let length = 0, text = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > CALENDAR_MAX_BYTES) throw new CalendarUrlError("Calendar exceeds the 2 MB limit");
        text += decoder.decode(value, { stream: true });
      }
      return text + decoder.decode();
    } finally {
      await reader.cancel();
    }
  }
}

