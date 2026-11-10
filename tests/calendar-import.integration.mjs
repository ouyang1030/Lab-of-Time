import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local tests only');
let checks=0;const run=crypto.randomUUID();
const human={turnstileToken:'XXXX.DUMMY.TOKEN.XXXX'}; // accepted by the Turnstile test secret in .dev.vars
// Each client gets a documentation-range IPv6 /64 so runs do not share rate-limit budgets.
const testNetwork=()=>`2001:db8:${Math.floor(Math.random()*0xffff).toString(16)}:${Math.floor(Math.random()*0xffff).toString(16)}::`;
const runIp=testNetwork()+'1';

async function req(client,body,status=200){
 const response=await fetch(base+'/api/workspace',{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json','cf-connecting-ip':runIp,...(client.cookie?{Cookie:client.cookie}:{})},body:body?JSON.stringify(body):undefined});
 const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));checks++;
 if(response.headers.get('set-cookie'))client.cookie=response.headers.get('set-cookie').split(';')[0];return data;
}
const a={},b={},other={};
for(const [client,name] of [[a,'Import owner'],[b,'Import member'],[other,'Other lab']]){
 const state=await req(client,{action:'register',...human,email:`${name.replaceAll(' ','-')}-${run}@example.test`,password:'Calendar-test-password-2026',displayName:name});client.id=state.user.userId;
}
const group=await req(a,{action:'createGroup',name:'Calendar import verification',displayName:'Import owner',color:'blue'});
await req(b,{action:'joinGroup',code:group.group.inviteCode,displayName:'Import member',color:'red'});
await req(other,{action:'createGroup',name:'Other lab',displayName:'Other lab',color:'blue'});
const text=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:all-day\r\nSUMMARY:Conference\r\nDTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261113\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:repeated\r\nSUMMARY:Weekly research\r\nDTSTART;TZID=Europe/Vienna:20261110T090000\r\nDTEND;TZID=Europe/Vienna:20261110T100000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:overnight\r\nSUMMARY:Overnight experiment\r\nDTSTART:20261110T230000\r\nDTEND:20261111T020000\r\nEND:VEVENT\r\nEND:VCALENDAR`;
const options={sourceName:'Research calendar',from:'2026-11-01',to:'2026-11-30'};
await req({}, {action:'previewCalendar',text,...options},401);
await req(b,{action:'previewCalendar',url:'http://127.0.0.1/private',...options},400);
await req(b,{action:'previewCalendar',url:'https://calendar.google.com.attacker.test/calendar.ics',...options},400);
const preview=await req(b,{action:'previewCalendar',text,...options});assert.equal(preview.events.length,5);assert.equal(preview.warnings.length,0);
const command={action:'importCalendar',text,keys:preview.events.map(e=>e.key),...options};
const saved=await req(b,command);assert.equal(saved.items.length,5);assert.ok(saved.items.every(i=>i.ownerId===b.id));
assert.equal((await req(b,command)).items.length,5);assert.equal((await req(b)).items.length,5);assert.equal((await req(other)).items.length,0);
const after=await req(b,{action:'previewCalendar',text,...options});assert.ok(after.events.every(e=>e.duplicate));
const batch=saved.items[0].importBatch;
assert.equal((await req(other,{action:'undoCalendarImport',batch})).items.length,0);assert.equal((await req(b)).items.length,5);
assert.equal((await req(a,{action:'undoCalendarImport',batch})).items.length,5);
const edited=saved.items.find(i=>i.allDay);await req(b,{action:'saveItem',item:{...edited,title:'Edited conference'}});
const responded=saved.items.find(i=>i.title==='Overnight experiment');await req(a,{action:'rsvp',id:responded.id,response:'yes'});
const undone=await req(b,{action:'undoCalendarImport',batch});assert.equal(undone.items.length,2);assert.match(undone.notice,/Removed 3/);
assert.equal(undone.items.find(i=>i.id===edited.id).endDate,'2026-11-13');
assert.equal((await req(b,{action:'undoCalendarImport',batch})).items.length,2);
const independent=await req(b,{...command,sourceName:'Different calendar'});assert.equal(independent.items.length,7);
const invalid={...independent.items[0],endDate:'2026-01-01'};await req(b,{action:'saveItem',item:invalid},400);

// Subscription API validations
await req(b,{action:'subscribeCalendar',url:'http://127.0.0.1/feed.ics',sourceName:'Private host'},400);
await req(b,{action:'subscribeCalendar',url:'https://intranet/feed.ics',sourceName:'Intranet'},400);
assert.ok(Array.isArray((await req(b)).subscriptions));
await req(b,{action:'syncSubscription',id:'00000000-0000-0000-0000-000000000000'},404);
await req(b,{action:'unsubscribeCalendar',id:'00000000-0000-0000-0000-000000000000',removeEvents:false},404);

console.log(`${checks} calendar import and subscription API checks passed: dates, repeats, persistence, duplicate imports, source isolation, permissions, subscriptions, and protected undo.`);
