import test from "node:test";
import assert from "node:assert/strict";
import { feedCalendar, feedItems } from "../lib/calendar-feed.ts";
import { parseCalendar } from "../lib/import-calendar.ts";

const base = {
  type: "task", ownerId: "me", date: "2026-12-01", time: "09:00", endTime: "10:00", endDate: "", allDay: false,
  sourceName: "", importBatch: "", importedBy: "", cycle: "week", status: "todo", priority: "normal",
  description: "", location: "", url: "", seriesId: "", repeatEvery: "", repeatUntil: "", version: 1,
};
const item = (id, fields = {}) => ({ ...base, id, title: id, ...fields });
const items = [
  item("my-task"),
  item("their-task", { ownerId: "alex" }),
  item("accepted-meeting", { type: "meeting", ownerId: "alex" }),
  item("declined-meeting", { type: "meeting", ownerId: "alex" }),
  item("my-import", { type: "meeting", importedBy: "me", sourceName: "Google" }),
  item("their-import", { type: "meeting", ownerId: "alex", importedBy: "alex", sourceName: "Seminars" }),
  item("too-old", { date: "2026-08-01" }),
  // An all-day end is exclusive: this one's last day is 2026-08-31, the first included date.
  item("ends-on-window-start", { allDay: true, date: "2026-08-30", endDate: "2026-09-01" }),
];
const source = {
  memberId: "me", scope: "mine", labName: "Biomechanics Lab", from: "2026-08-31", items,
  attendance: [
    { itemId: "accepted-meeting", memberId: "me", response: "yes" },
    { itemId: "declined-meeting", memberId: "me", response: "no" },
    { itemId: "their-task", memberId: "alex", response: "yes" },
  ],
  members: [{ id: "me", name: "Mia" }, { id: "alex", name: "Alex" }],
};
const ids = (scope) => feedItems({ ...source, scope }).map((entry) => entry.id);

test("My items feed holds assigned items and accepted meetings only", () => {
  assert.deepEqual(ids("mine"), ["my-task", "accepted-meeting", "ends-on-window-start"]);
});

test("Whole lab feed holds every lab item except the member's own imports and old items", () => {
  assert.deepEqual(ids("lab"), ["my-task", "their-task", "accepted-meeting", "declined-meeting", "their-import", "ends-on-window-start"]);
});

test("Feed names the lab and scope and leads each note with type and assignee", () => {
  const calendar = feedCalendar({ ...source, scope: "lab", items: [item("their-task", { ownerId: "alex", description: "Draft\nsection" })] });
  const lines = calendar.split("\r\n");
  assert.ok(lines.includes("X-WR-CALNAME:Biomechanics Lab · Whole lab"));
  assert.ok(lines.includes("DESCRIPTION:Task · Alex\\n\\nDraft\\nsection"));
  assert.ok(lines.includes("REFRESH-INTERVAL;VALUE=DURATION:PT1H"));
  assert.ok(lines.includes("SEQUENCE:1"));
  assert.ok(lines.indexOf("END:VTIMEZONE") < lines.indexOf("BEGIN:VEVENT"));
});

test("Feed times survive a round trip through its own VTIMEZONE in summer and winter", () => {
  const calendar = feedCalendar({
    ...source,
    from: "2026-01-01",
    items: [
      item("summer", { type: "meeting", date: "2026-07-01", time: "14:00", endTime: "15:30" }),
      item("winter", { type: "meeting", date: "2026-12-01", time: "14:00", endTime: "15:30" }),
      // Clocks go back at 03:00 on 2026-10-25; this meeting spans the change.
      item("dst-end", { type: "meeting", date: "2026-10-25", time: "01:30", endTime: "04:00" }),
      item("conference", { allDay: true, date: "2026-11-10", endDate: "2026-11-13" }),
    ],
  });
  const parsed = parseCalendar(calendar, { from: "2026-01-01", to: "2026-12-31" });
  assert.deepEqual(parsed.warnings, []);
  const byTitle = Object.fromEntries(parsed.events.map((event) => [event.title, event]));
  for (const title of ["summer", "winter"]) {
    assert.equal(byTitle[title].time, "14:00");
    assert.equal(byTitle[title].endTime, "15:30");
  }
  assert.equal(byTitle["dst-end"].time, "01:30");
  assert.equal(byTitle["dst-end"].endTime, "04:00");
  assert.equal(byTitle.conference.allDay, true);
  assert.equal(byTitle.conference.endDate, "2026-11-13");
});
