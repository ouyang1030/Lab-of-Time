import ICAL from 'ical.js';
import { validDate } from './calendar.ts';
import { overlapsDates } from './item-dates.ts';
export type ImportedEvent = { key: string; uid: string; title: string; date: string; endDate: string; allDay: boolean; time: string; endTime: string; description: string; location: string };
export type ImportRange = {from:string;to:string};
export function defaultImportRange(now = new Date()): ImportRange {
  const from = new Date(now), to = new Date(now);
  from.setUTCMonth(from.getUTCMonth()-1); to.setUTCFullYear(to.getUTCFullYear()+1);
  return {from:from.toISOString().slice(0,10),to:to.toISOString().slice(0,10)};
}
function registerTimezone(id: string) {
  if (ICAL.TimezoneService.has(id)) return;
  // Intl supplies IANA zones when a provider omits VTIMEZONE.
  const formatter = new Intl.DateTimeFormat('en-CA',{timeZone:id,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const zone = new ICAL.Timezone({tzid:id});
  zone.utcOffset = (time: ICAL.Time) => {
    const wall = Date.UTC(time.year,time.month-1,time.day,time.hour,time.minute,time.second);
    const display = (instant:number) => {
      const parts = formatter.formatToParts(new Date(instant));
      const p = (key:string) => Number(parts.find(p=>p.type===key)!.value);
      return Date.UTC(p('year'),p('month')-1,p('day'),p('hour'),p('minute'),p('second'));
    };
    const offsets = new Set([-86400000,0,86400000].map(delta=>display(wall+delta)-(wall+delta)));
    const candidates = [...offsets].map(offset=>wall-offset).filter(instant=>display(instant)===wall);
    // RFC 5545 uses the first occurrence when clocks repeat a local time.
    if(candidates.length) return (wall-Math.min(...candidates))/1000;
    throw new Error(`Nonexistent local time in ${id}`);
  };
  ICAL.TimezoneService.register(zone,id);
}
const formatter = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function format(value: ICAL.Time) {
  if(value.isDate) return {date:value.toString().slice(0,10),time:'00:00'};
  if(value.zone.tzid==='floating') return {date:value.toString().slice(0,10),time:value.toString().slice(11,16)};
  const parts = formatter.formatToParts(value.toJSDate());
  const p = (name:string) => parts.find(p=>p.type===name)!.value;
  return {date:`${p('year')}-${p('month')}-${p('day')}`,time:`${p('hour')}:${p('minute')}`};
}
/** `incomplete` lists UIDs whose events could not be fully read; sync must not treat them as deleted. */
export function parseCalendar(text: string, range = defaultImportRange()): { events: ImportedEvent[]; warnings: string[]; incomplete: string[] } {
  if (!validDate(range.from)||!validDate(range.to)||range.from>range.to||Date.parse(range.to)-Date.parse(range.from)>366*3*86400000) throw new Error('Choose a valid date range of at most three years');
  if (new TextEncoder().encode(text).length > 2_000_000) throw new Error('Calendar exceeds the 2 MB limit');
  ICAL.TimezoneService.reset();
  try {
    const root = new ICAL.Component(ICAL.parse(text));
    if (root.name !== 'vcalendar') throw new Error('Please provide an iCalendar (.ics) file');
    for (const zone of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(new ICAL.Timezone(zone),String(zone.getFirstPropertyValue('tzid')));
    const events = new Map<string,ImportedEvent>(), warnings: string[] = [], incomplete = new Set<string>();
    const components = root.getAllSubcomponents('vevent');
    if (components.length > 5000) throw new Error('Calendar exceeds the 5,000 event limit');
    const invalid = new Set<ICAL.Component>();
    for(const c of components) {
      try {
        for(const property of c.getAllProperties()) {
          const id = property.getParameter('tzid');
          if(typeof id==='string') registerTimezone(id);
        }
      } catch {invalid.add(c);incomplete.add(String(c.getFirstPropertyValue('uid')||''));warnings.push(`${c.getFirstPropertyValue('summary') || 'Event'}: Unknown timezone`);}
    }
    const masters = components.filter(c=>!c.hasProperty('recurrence-id'));
    let iterations=0;
    for (const component of masters) {
      if(invalid.has(component)) continue;
      const title = String(component.getFirstPropertyValue('summary') || 'Untitled event');
      const priorKeys = new Set(events.keys());
      const uid=String(component.getFirstPropertyValue('uid') || '');
      try {
        const exceptions=components.filter(c=>c.hasProperty('recurrence-id')&&String(c.getFirstPropertyValue('uid'))===uid);
        if(exceptions.some(c=>invalid.has(c))) throw new Error('Series contains an invalid timezone');
        const event=new ICAL.Event(component,{exceptions});
        const emit=(entry:ICAL.Event,start:ICAL.Time,end:ICAL.Time,instance='')=>{
          if(entry.component.getFirstPropertyValue('status')==='CANCELLED') return;
          if(!start||!end) throw new Error('Missing start or end');
          const a=format(start),b=format(end);
          if(!validDate(a.date)||!validDate(b.date)||start.isDate!==end.isDate) throw new Error('Invalid event dates');
          if(`${b.date}${b.time}`<`${a.date}${a.time}` || (start.isDate && b.date<=a.date)) throw new Error('Invalid end date');
          const name=String(entry.component.getFirstPropertyValue('summary')||title);
          const description=String(entry.component.getFirstPropertyValue('description')||'');
          const location=String(entry.component.getFirstPropertyValue('location')||'');
          if(name.length>100||description.length>5000||location.length>200) throw new Error('Text exceeds schedule field limits');
          const key=instance ? JSON.stringify([uid || JSON.stringify([name,a,b,location]),instance]) : uid || JSON.stringify([name,a,b,location]);
          const result={key,uid,title:name,...a,endDate:b.date,endTime:b.time,allDay:start.isDate,description,location};
          if(overlapsDates(result,range.from,range.to)) events.set(key,result);
          if(events.size>1000) throw new Error('More than 1,000 occurrences; choose a smaller date range');
        };
        if(event.isRecurring()) {
          const frequencies=Object.keys(event.getRecurrenceTypes());
          if(frequencies.some(f=>['SECONDLY','MINUTELY','HOURLY'].includes(f))) throw new Error('Sub-daily recurrence is not supported');
          const iterator=event.iterator();
          let next:ICAL.Time|null;
          while((next=iterator.next())) {
            if(++iterations>50000) throw new Error('Recurrence expansion limit reached; shorten the source series');
            // Exceptions are emitted separately, including occurrences moved into the selected range.
            if(format(next).date>range.to) break;
            if(exceptions.some(c=>String(c.getFirstPropertyValue('recurrence-id'))===next!.toString())) continue;
            const occurrence=event.getOccurrenceDetails(next);
            emit(occurrence.item,occurrence.startDate,occurrence.endDate,next.toString());
          }
          for(const c of exceptions) {
            const exception=new ICAL.Event(c);
            if(exception.modifiesFuture()) throw new Error('THISANDFUTURE exceptions are not supported');
            emit(exception,exception.startDate,exception.endDate,exception.recurrenceId.toString());
          }
        } else emit(event,event.startDate,event.endDate);
      } catch(error) {
        // Never present an incomplete series as a successful expansion.
        for(const key of events.keys()) if(!priorKeys.has(key)) events.delete(key);
        incomplete.add(uid);
        warnings.push(`${title}: ${error instanceof Error?error.message:'Invalid event'}`);
      }
    }
    for(const c of components.filter(c=>c.hasProperty('recurrence-id'))) if(!masters.some(m=>m.getFirstPropertyValue('uid')===c.getFirstPropertyValue('uid'))) warnings.push(`${c.getFirstPropertyValue('summary')||'Event'}: Recurrence master missing`);
    if(!components.length) warnings.push('No events found');
    return {events:[...events.values()].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)),warnings,incomplete:[...incomplete]};
  } finally {ICAL.TimezoneService.reset();}
}
