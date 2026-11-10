import type { Item } from './model';
/** End dates are exclusive for all-day events; timed end instants are exclusive too. */
export function lastItemDate(item: Pick<Item, 'date'|'endDate'|'allDay'|'endTime'>): string {
  const end = item.endDate || item.date;
  if (end > item.date && (item.allDay || item.endTime === '00:00')) {
    const d = new Date(`${end}T12:00:00Z`); d.setUTCDate(d.getUTCDate()-1);
    return d.toISOString().slice(0,10);
  }
  return end;
}
export function overlapsDates(item: Pick<Item,'date'|'endDate'|'allDay'|'endTime'>, start: string, end = start) {
  return item.date <= end && lastItemDate(item) >= start;
}
export function itemTimeLabel(item: Pick<Item,'date'|'endDate'|'allDay'|'time'|'endTime'|'type'>) {
  if (item.allDay) return lastItemDate(item) > item.date ? `All day · through ${lastItemDate(item)}` : 'All day';
  if (item.type !== 'meeting') return item.time;
  return `${item.time} – ${item.endDate && item.endDate !== item.date ? item.endDate+' ' : ''}${item.endTime}`;
}
