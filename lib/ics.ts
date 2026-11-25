import type { Item } from "./model";
const escapeText = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
// Outlook and some other clients ignore a TZID without its definition; these are the EU rules in force since 1996.
const VIENNA_TIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Vienna",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];
const utf8Length = (char: string) => {
  const code = char.codePointAt(0)!;
  return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
};
export function toCalendar(
  items: Item[],
  { name = "Lab of Time", now = new Date() }: { name?: string; now?: Date } = {},
): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lab of Time//Calendar//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-TIMEZONE:Europe/Vienna",
    // Polling hints for subscribed calendars; imported files ignore them.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...VIENNA_TIMEZONE,
  ];
  for (const item of items) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id}@lab-of-time`,
      `DTSTAMP:${stamp}`,
      // Every saved change bumps the version, so clients replace older copies.
      `SEQUENCE:${item.version}`,
    );
    if (item.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${item.date.replaceAll("-", "")}`, `DTEND;VALUE=DATE:${(item.endDate || item.date).replaceAll("-", "")}`);
    } else {
      const startDate = item.type === "milestone" ? item.endDate || item.date : item.date;
      lines.push(`DTSTART;TZID=Europe/Vienna:${startDate.replaceAll("-", "")}T${item.time.replace(":", "")}00`);
      if (item.type !== "milestone" && item.endTime && (item.date !== (item.endDate || item.date) || item.time !== item.endTime)) lines.push(`DTEND;TZID=Europe/Vienna:${(item.endDate || item.date).replaceAll("-", "")}T${item.endTime.replace(":", "")}00`);
    }
    lines.push(
      `SUMMARY:${escapeText(item.title)}`,
      `DESCRIPTION:${escapeText(item.description)}`,
      `LOCATION:${escapeText(item.location)}`,
    );
    if (item.url) lines.push(`URL:${item.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  // Fold by UTF-8 octets, preserving complete Unicode characters.
  return (
    lines
      .map((line) => {
        const parts: string[] = [];
        let part = "";
        let length = 0;
        for (const char of line) {
          const bytes = utf8Length(char);
          if (length + bytes > 73) {
            parts.push(part);
            part = " ";
            length = 1;
          }
          part += char;
          length += bytes;
        }
        parts.push(part);
        return parts.join("\r\n");
      })
      .join("\r\n") + "\r\n"
  );
}
export function exportCalendar(items: Item[]) {
  const url = URL.createObjectURL(
    new Blob([toCalendar(items)], { type: "text/calendar;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "lab-of-time.ics";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
