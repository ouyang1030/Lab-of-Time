import test from "node:test";
import assert from "node:assert/strict";
import {
  repeatDates,
  shiftDate,
  daysBetween,
  MAX_REPEAT_ITEMS,
} from "../lib/repeat.ts";

test("weekly repeat includes the end date and crosses the year", () => {
  assert.deepEqual(repeatDates("2026-12-21", "week", "2027-01-04"), [
    "2026-12-21",
    "2026-12-28",
    "2027-01-04",
  ]);
});
test("biweekly and daily steps", () => {
  assert.deepEqual(repeatDates("2026-11-10", "biweek", "2026-12-10"), [
    "2026-11-10",
    "2026-11-24",
    "2026-12-08",
  ]);
  assert.equal(repeatDates("2026-02-27", "day", "2026-03-02").length, 4);
});
test("monthly repeat skips months without the start day", () => {
  assert.deepEqual(repeatDates("2026-01-31", "month", "2026-05-31"), [
    "2026-01-31",
    "2026-03-31",
    "2026-05-31",
  ]);
});
test("yearly repeat on Feb 29 only lands on leap years", () => {
  assert.deepEqual(repeatDates("2028-02-29", "year", "2033-01-01"), [
    "2028-02-29",
    "2032-02-29",
  ]);
});
test("end before start yields nothing; oversized series is detectable", () => {
  assert.deepEqual(repeatDates("2026-11-10", "week", "2026-11-09"), []);
  assert.equal(
    repeatDates("2026-01-01", "day", "2030-01-01").length,
    MAX_REPEAT_ITEMS + 1,
  );
});
test("date shifting across month ends", () => {
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(daysBetween("2026-02-27", "2026-03-02"), 3);
});
