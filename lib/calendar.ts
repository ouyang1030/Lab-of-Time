import type { Item, View } from "./model";
import { lastItemDate, overlapsDates } from "./item-dates.ts";
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function parseDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}
export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
export function startOfWeek(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7));
}
export function monthDays(date: Date): Date[] {
  const first = startOfWeek(
    new Date(date.getFullYear(), date.getMonth(), 1, 12),
  );
  const count =
    Math.ceil(
      (((new Date(date.getFullYear(), date.getMonth(), 1).getDay() + 6) % 7) +
        new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()) /
        7,
    ) * 7;
  return Array.from({ length: count }, (_, index) => addDays(first, index));
}
export function periodRange(date: Date, view: View): [string, string] {
  if (view === "week") {
    const first = startOfWeek(date);
    return [dateKey(first), dateKey(addDays(first, 6))];
  }
  if (view === "year") {
    return [`${date.getFullYear()}-01-01`, `${date.getFullYear()}-12-31`];
  }
  const month =
    view === "quarter" ? Math.floor(date.getMonth() / 3) * 3 : date.getMonth();
  return [
    dateKey(new Date(date.getFullYear(), month, 1, 12)),
    dateKey(
      new Date(date.getFullYear(), month + (view === "quarter" ? 3 : 1), 0, 12),
    ),
  ];
}
export function navigateDate(date: Date, view: View, direction: number): Date {
  if (view === "week") return addDays(date, direction * 7);
  if (view === "year")
    return new Date(date.getFullYear() + direction, 0, 1, 12);
  return new Date(
    date.getFullYear(),
    date.getMonth() + direction * (view === "quarter" ? 3 : 1),
    1,
    12,
  );
}
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(parseDate(value).getTime()) &&
    dateKey(parseDate(value)) === value
  );
}

export type SlotItem = {
  item: Item;
  isMultiDay: boolean;
  connectLeft: boolean;
  connectRight: boolean;
  isRowStart: boolean;
};

export function layoutWeekRow(
  weekDays: Date[],
  items: Item[],
  isWeekView = false,
): (SlotItem | null)[][] {
  const dayKeys = weekDays.map((d) => dateKey(d));
  const weekStart = dayKeys[0];
  const weekEnd = dayKeys[6];

  const weekItems = items.filter((item) => overlapsDates(item, weekStart, weekEnd));

  const multiDayItems = weekItems
    .filter((item) => lastItemDate(item) > item.date)
    .sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      const aSpan = lastItemDate(a).localeCompare(a.date);
      const bSpan = lastItemDate(b).localeCompare(b.date);
      if (bSpan !== aSpan) return bSpan - aSpan;
      return a.time.localeCompare(b.time);
    });

  const singleDayItems = weekItems
    .filter((item) => lastItemDate(item) === item.date)
    .sort((a, b) => a.time.localeCompare(b.time));

  const daySlots: (SlotItem | null)[][] = Array.from({ length: 7 }, () => []);

  for (const item of multiDayItems) {
    const itemStart = item.date;
    const itemEnd = lastItemDate(item);

    let startCol = 0;
    while (startCol < 7 && dayKeys[startCol] < itemStart) startCol++;
    let endCol = 6;
    while (endCol >= 0 && dayKeys[endCol] > itemEnd) endCol--;

    if (startCol > endCol || startCol >= 7 || endCol < 0) continue;

    let slot = 0;
    while (true) {
      let available = true;
      for (let c = startCol; c <= endCol; c++) {
        if (daySlots[c][slot] !== undefined && daySlots[c][slot] !== null) {
          available = false;
          break;
        }
      }
      if (available) break;
      slot++;
    }

    for (let c = startCol; c <= endCol; c++) {
      while (daySlots[c].length < slot) {
        daySlots[c].push(null);
      }

      const key = dayKeys[c];
      const hasPrev = key > item.date;
      const hasNext = key < itemEnd;

      const connectLeft = hasPrev && c > 0;
      const connectRight = hasNext && c < 6;
      const isRowStart = c === 0;

      daySlots[c][slot] = {
        item,
        isMultiDay: true,
        connectLeft,
        connectRight,
        isRowStart,
      };
    }
  }

  if (!isWeekView) {
    for (let c = 0; c < 7; c++) {
      const dayKey = dayKeys[c];
      const daySingles = singleDayItems.filter((item) => item.date === dayKey);

      for (const item of daySingles) {
        let slot = 0;
        while (daySlots[c][slot] !== undefined && daySlots[c][slot] !== null) {
          slot++;
        }
        while (daySlots[c].length < slot) {
          daySlots[c].push(null);
        }
        daySlots[c][slot] = {
          item,
          isMultiDay: false,
          connectLeft: false,
          connectRight: false,
          isRowStart: false,
        };
      }
    }
  }

  for (let c = 0; c < 7; c++) {
    while (daySlots[c].length > 0 && daySlots[c][daySlots[c].length - 1] === null) {
      daySlots[c].pop();
    }
  }

  return daySlots;
}
