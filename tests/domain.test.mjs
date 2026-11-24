import test from "node:test";
import assert from "node:assert/strict";
import {
  dateKey,
  parseDate,
  startOfWeek,
  monthDays,
  periodRange,
  navigateDate,
  validDate,
  addDays,
  layoutWeekRow,
} from "../lib/calendar.ts";
import { canEdit } from "../lib/model.ts";
import { toCalendar } from "../lib/ics.ts";

test("Monday weeks span year boundaries without dropping dates", () => {
  assert.equal(dateKey(startOfWeek(parseDate("2027-01-03"))), "2026-12-28");
  assert.deepEqual(periodRange(parseDate("2027-01-03"), "week"), [
    "2026-12-28",
    "2027-01-03",
  ]);
});
test("Month grid covers leap days and complete Monday–Sunday weeks", () => {
  const days = monthDays(parseDate("2024-02-29"));
  assert.equal(days[0].getDay(), 1);
  assert.equal(days.at(-1).getDay(), 0);
  assert.equal(days.length % 7, 0);
  assert.equal(days.filter((day) => day.getMonth() === 1).length, 29);
});
test("Month navigation from 31st never skips a month; quarters cross years", () => {
  assert.equal(
    dateKey(navigateDate(parseDate("2026-01-31"), "month", 1)),
    "2026-02-01",
  );
  assert.equal(
    dateKey(navigateDate(parseDate("2026-11-09"), "quarter", 1)),
    "2027-02-01",
  );
  assert.deepEqual(periodRange(parseDate("2027-02-01"), "quarter"), [
    "2027-01-01",
    "2027-03-31",
  ]);
  assert.deepEqual(periodRange(parseDate("2026-11-10"), "year"), [
    "2026-01-01",
    "2026-12-31",
  ]);
  assert.equal(
    dateKey(navigateDate(parseDate("2026-11-10"), "year", 1)),
    "2027-01-01",
  );
});
test("External date validation rejects normalized invalid dates", () => {
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2026-13-01"), false);
  assert.equal(validDate("2026-11-31"), false);
});
test("Members edit their own work, administrators edit group work, suspended users edit nothing", () => {
  const item = { ownerId: "alice" };
  assert.equal(
    canEdit({ id: "alice", role: "member", active: true }, item),
    true,
  );
  assert.equal(
    canEdit({ id: "bob", role: "member", active: true }, item),
    false,
  );
  assert.equal(canEdit({ id: "bob", role: "admin", active: true }, item), true);
  assert.equal(
    canEdit({ id: "bob", role: "owner", active: false }, item),
    false,
  );
});
test("ICS preserves timezone, escapes text, and folds Unicode at octet boundaries", () => {
  const calendar = toCalendar([
    {
      id: "one",
      title: "科研讨论，方法;结果",
      description: "第一行\n第二行" + "研究".repeat(60),
      location: "302",
      date: "2026-11-09",
      time: "14:00",
      endTime: "15:00",
      type: "meeting",
      version: 1,
    },
  ]);
  assert.match(calendar, /DTSTART;TZID=Europe\/Vienna:20261109T140000/);
  assert.match(calendar, /DTEND;TZID=Europe\/Vienna:20261109T150000/);
  assert.match(calendar, /方法\\;结果/);
  assert.match(calendar, /第一行\\n第二行/);
  for (const line of calendar.split("\r\n"))
    assert.ok(Buffer.byteLength(line) <= 75);
});

test("cross-day item tags connect across consecutive days in consistent tracks", () => {
  // Week from Mon 2026-11-09 to Sun 2026-11-15
  const monday = parseDate("2026-11-09");
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const multiDayItem = {
    id: "conf",
    title: "Conference",
    date: "2026-11-10", // Tue (col 1)
    endDate: "2026-11-13", // Fri (col 4, exclusive for all-day -> through 2026-11-12 Thu, or inclusive timed)
    allDay: false,
    time: "09:00",
    endTime: "17:00",
    type: "meeting",
    status: "todo",
    priority: "normal",
    ownerId: "owner",
    description: "",
    location: "Hall A",
    cycle: "week",
    version: 1,
  };

  const singleDayMon = {
    id: "prep",
    title: "Prep",
    date: "2026-11-09", // Mon (col 0)
    time: "10:00",
    endTime: "11:00",
    type: "task",
    status: "todo",
    priority: "normal",
    ownerId: "owner",
    description: "",
    location: "",
    cycle: "week",
    version: 1,
  };

  const slots = layoutWeekRow(week, [singleDayMon, multiDayItem], false);

  // Mon (col 0): Prep is at slot 0
  assert.equal(slots[0][0]?.item.id, "prep");
  assert.equal(slots[0][0]?.isMultiDay, false);
  assert.equal(slots[0][0]?.connectLeft, false);
  assert.equal(slots[0][0]?.connectRight, false);

  // Tue (col 1): Conference starts -> slot 0 (lowest free across Tue..Fri)
  const tue = slots[1][0];
  assert.ok(tue);
  assert.equal(tue.item.id, "conf");
  assert.equal(tue.isMultiDay, true);
  assert.equal(tue.connectLeft, false); // start of event
  assert.equal(tue.connectRight, true); // connects to Wed

  // Wed (col 2): Conference middle -> slot 0
  const wed = slots[2][0];
  assert.ok(wed);
  assert.equal(wed.item.id, "conf");
  assert.equal(wed.connectLeft, true); // connects from Tue
  assert.equal(wed.connectRight, true); // connects to Thu

  // Thu (col 3): Conference middle -> slot 0
  const thu = slots[3][0];
  assert.ok(thu);
  assert.equal(thu.item.id, "conf");
  assert.equal(thu.connectLeft, true);
  assert.equal(thu.connectRight, true);

  // Fri (col 4): Conference ends -> slot 0
  const fri = slots[4][0];
  assert.ok(fri);
  assert.equal(fri.item.id, "conf");
  assert.equal(fri.connectLeft, true);
  assert.equal(fri.connectRight, false); // end of event

  // Sat (col 5): No events
  assert.equal(slots[5].length, 0);
});

test("parallel multi-day events preserve vertical slot alignment with spacers", () => {
  const monday = parseDate("2026-11-09");
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  // Event A: Mon-Wed (col 0..2)
  const itemA = {
    id: "a",
    title: "Event A",
    date: "2026-11-09",
    endDate: "2026-11-11",
    time: "09:00",
    endTime: "10:00",
    type: "task",
    status: "todo",
    priority: "normal",
    ownerId: "owner",
    description: "",
    location: "",
    cycle: "week",
    version: 1,
  };

  // Event B: Tue-Thu (col 1..3) -> overlaps with A on Tue and Wed, so must take slot 1
  const itemB = {
    id: "b",
    title: "Event B",
    date: "2026-11-10",
    endDate: "2026-11-12",
    time: "10:00",
    endTime: "11:00",
    type: "meeting",
    status: "todo",
    priority: "normal",
    ownerId: "owner",
    description: "",
    location: "",
    cycle: "week",
    version: 1,
  };

  const slots = layoutWeekRow(week, [itemA, itemB], false);

  // Tue (col 1): slot 0 is Event A, slot 1 is Event B
  assert.equal(slots[1][0]?.item.id, "a");
  assert.equal(slots[1][1]?.item.id, "b");

  // Wed (col 2): slot 0 is Event A, slot 1 is Event B
  assert.equal(slots[2][0]?.item.id, "a");
  assert.equal(slots[2][1]?.item.id, "b");

  // Thu (col 3): Event A has ended. Slot 1 is Event B.
  // Slot 0 has a spacer (null) so Event B remains in slot 1 and stays aligned!
  assert.equal(slots[3][0], null);
  assert.equal(slots[3][1]?.item.id, "b");
  assert.equal(slots[3][1]?.connectLeft, true);
  assert.equal(slots[3][1]?.connectRight, false);
});

test("ICS export keeps every text value on its own content line", () => {
  const item = {
    id: "i1", title: "Review\rBEGIN:VALARM", type: "task", ownerId: "m1",
    date: "2026-11-10", time: "09:00", endTime: "10:00", cycle: "week",
    status: "todo", priority: "normal", description: "a\r\nb\nc", location: "", url: "", version: 1,
  };
  const lines = toCalendar([item]).split("\r\n");
  assert.ok(lines.includes("SUMMARY:Review\\nBEGIN:VALARM"));
  assert.ok(lines.includes("DESCRIPTION:a\\nb\\nc"));
  assert.ok(!lines.some((line) => line.startsWith("BEGIN:VALARM")));
});
