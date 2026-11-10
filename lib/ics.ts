import type { Item } from "./model";
const escapeText = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
export function toCalendar(items: Item[], now = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lab of Time//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-TIMEZONE:Europe/Vienna",
  ];
  for (const item of items) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id}@lab-of-time`,
      `DTSTAMP:${stamp}`,
    );
    if (item.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${item.date.replaceAll("-", "")}`, `DTEND;VALUE=DATE:${(item.endDate || item.date).replaceAll("-", "")}`);
    } else {
      lines.push(`DTSTART;TZID=Europe/Vienna:${item.date.replaceAll("-", "")}T${item.time.replace(":", "")}00`);
      if (item.type === "meeting") lines.push(`DTEND;TZID=Europe/Vienna:${(item.endDate || item.date).replaceAll("-", "")}T${item.endTime.replace(":", "")}00`);
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
          const bytes = new TextEncoder().encode(char).length;
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
