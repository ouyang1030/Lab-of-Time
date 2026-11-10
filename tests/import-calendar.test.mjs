import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCalendar} from '../lib/import-calendar.ts';
import {overlapsDates,lastItemDate} from '../lib/item-dates.ts';
import {toCalendar} from '../lib/ics.ts';
const range={from:'2026-01-01',to:'2027-01-31'};
const calendar = (body) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:sample\r\nSUMMARY:Research meeting\r\n${body}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
const parse=(body, dates=range)=>parseCalendar(calendar(body),dates);
test('UTC and IANA zone times convert to Vienna through DST',()=>{
 for(const [month,hour] of [['01','11:00'],['07','12:00']]) {
  const result=parse(`DTSTART:2026${month}10T100000Z\r\nDTEND:2026${month}10T110000Z`);
  assert.equal(result.events[0].time,hour);assert.equal(result.events[0].key,'sample');
 }
 const result=parse('DTSTART;TZID=Europe/Vienna:20260322T100000\r\nDTEND;TZID=Europe/Vienna:20260322T110000\r\nRRULE:FREQ=WEEKLY;COUNT=3');
 assert.deepEqual(result.events.map(e=>e.time),['10:00','10:00','10:00']);
 assert.deepEqual(result.events.map(e=>e.date),['2026-03-22','2026-03-29','2026-04-05']);
});
test('all-day boundaries, cross-year spans and midnight ends are exclusive',()=>{
 const event=parse('DTSTART;VALUE=DATE:20261230\r\nDTEND;VALUE=DATE:20270103').events[0];
 assert.equal(event.allDay,true);assert.equal(lastItemDate(event),'2027-01-02');
 assert.ok(overlapsDates(event,'2027-01-01'));assert.ok(!overlapsDates(event,'2027-01-03'));
 const timed=parse('DTSTART:20261230T220000\r\nDTEND:20270101T000000').events[0];
 assert.equal(lastItemDate(timed),'2026-12-31');assert.ok(!overlapsDates(timed,'2027-01-01'));
 const single=parse('DTSTART;VALUE=DATE:20260110').events[0];assert.equal(single.endDate,'2026-01-11');
});
test('repeat rules respect EXDATE, RDATE and the selected window',()=>{
 const result=parse('DTSTART:20260110T100000\r\nDTEND:20260110T110000\r\nRRULE:FREQ=DAILY;COUNT=4\r\nEXDATE:20260111T100000\r\nRDATE:20260120T100000',{from:'2026-01-11',to:'2026-01-20'});
 assert.deepEqual(result.events.map(e=>e.date),['2026-01-12','2026-01-13','2026-01-20']);
 assert.equal(new Set(result.events.map(e=>e.key)).size,3);
});
test('single occurrence changes and cancellations use stable original keys',()=>{
 const master='DTSTART:20260110T100000\r\nDTEND:20260110T110000\r\nRRULE:FREQ=DAILY;COUNT=3';
 const text=calendar(master).replace('END:VCALENDAR', 'BEGIN:VEVENT\r\nUID:sample\r\nRECURRENCE-ID:20260111T100000\r\nDTSTART:20260115T120000\r\nDTEND:20260115T130000\r\nSUMMARY:Moved\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:sample\r\nRECURRENCE-ID:20260112T100000\r\nDTSTART:20260112T100000\r\nDTEND:20260112T110000\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR');
 const result=parseCalendar(text,range);assert.deepEqual(result.events.map(e=>e.date),['2026-01-10','2026-01-15']);
 assert.equal(JSON.parse(result.events[1].key)[1],'2026-01-11T10:00:00');
 assert.equal(parseCalendar(text,{from:'2026-01-15',to:'2026-01-15'}).events[0].title,'Moved');
});
test('unknown zones and unsupported series are explicitly reported',()=>{
 assert.match(parse('DTSTART;TZID=Unknown/Zone:20260110T100000\r\nDTEND;TZID=Unknown/Zone:20260110T110000').warnings[0],/timezone/);
 const result=parse('DTSTART:20260110T100000\r\nDTEND:20260110T110000\r\nRRULE:FREQ=SECONDLY');
 assert.equal(result.events.length,0);assert.equal(result.warnings.length,1);
});
test('floating times preserve local wall clock time',()=>{assert.equal(parse('DTSTART:20260110T100000\r\nDTEND:20260110T110000').events[0].time,'10:00');});
test('export and reimport preserve all-day and multi-day dates',()=>{
 for(const body of ['DTSTART;VALUE=DATE:20261230\r\nDTEND;VALUE=DATE:20270103','DTSTART:20261230T230000\r\nDTEND:20270101T020000']) {
  const event=parse(body).events[0];
  const back=parseCalendar(toCalendar([{...event,id:'export',type:'meeting'}]),range).events[0];
  for(const field of ['date','endDate','time','endTime','allDay']) assert.equal(back[field],event[field]);
 }
});
test('invalid format, range and oversized input fail',()=>{
 assert.throws(()=>parseCalendar('not a calendar'));assert.throws(()=>parseCalendar('x'.repeat(2000001)));
 assert.throws(()=>parseCalendar(calendar(''),{from:'2026-02-30',to:'2026-03-01'}));
});
test('ambiguous IANA times choose the first occurrence; DST gaps warn',()=>{
 const folded=parse('DTSTART;TZID=America/New_York:20261101T013000\r\nDTEND;TZID=America/New_York:20261101T014500');
 assert.equal(folded.events[0].time,'06:30');
 const gap=parse('DTSTART;TZID=Europe/Vienna:20260329T023000\r\nDTEND;TZID=Europe/Vienna:20260329T034500');
 assert.equal(gap.events.length,0);assert.match(gap.warnings[0],/Nonexistent/);
});
