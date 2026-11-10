import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCalendarUrl,isPrivateAddress,fetchCalendarText} from '../lib/calendar-url.ts';
import {planSync,sourceDataFor,importedItemId} from '../lib/calendar-merge.ts';

const ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR';
const dns=(map)=>(host,type)=>({Answer:(map[host]||[]).filter(a=>type==='A'?a.includes('.'):a.includes(':')).map(data=>({type:type==='A'?1:28,data}))});
function fakeFetch(answers,pages){
 const calls=[];
 const fetcher=async(input,init={})=>{
  const url=new URL(String(input));calls.push(url.toString());
  if(url.hostname==='cloudflare-dns.com') return Response.json(dns(answers)(url.searchParams.get('name'),url.searchParams.get('type')));
  assert.equal(init.redirect,'manual');
  const page=pages[url.toString()];if(!page) return new Response('missing',{status:404});
  return typeof page==='string'?new Response(page,{status:200}):new Response(null,{status:302,headers:{location:page.redirect}});
 };
 return {fetcher,calls};
}

test('calendar URLs accept public https/webcal feeds and reject private targets',()=>{
 assert.equal(normalizeCalendarUrl('webcal://p01-caldav.icloud.com/published/2/abc').toString(),'https://p01-caldav.icloud.com/published/2/abc');
 assert.equal(normalizeCalendarUrl('https://ucal.univie.ac.at/yZ4moovu#x').hostname,'ucal.univie.ac.at');
 for(const bad of ['http://example.com/a.ics','https://user:pw@example.com/a.ics','https://example.com:8443/a.ics','https://127.0.0.1/a.ics','https://[::1]/a.ics','https://localhost/a.ics','https://printer.local/a.ics','https://intranet/a.ics','ftp://example.com/a','not a url'])
  assert.throws(()=>normalizeCalendarUrl(bad),bad);
 for(const ip of ['10.0.0.1','127.0.0.1','169.254.169.254','172.20.1.1','192.168.1.1','100.64.0.1','0.0.0.0','::1','fd00::1','fe80::1','::ffff:10.0.0.1']) assert.ok(isPrivateAddress(ip),ip);
 for(const ip of ['131.130.70.8','8.8.8.8','2a00:1450::1']) assert.ok(!isPrivateAddress(ip),ip);
});

test('feed fetch validates DNS and every redirect hop',async()=>{
 const ok=fakeFetch({'ucal.univie.ac.at':['131.130.70.8'],'cdn.example.org':['93.184.216.34','2606:2800::1']},{'https://ucal.univie.ac.at/feed':{redirect:'https://cdn.example.org/feed.ics'},'https://cdn.example.org/feed.ics':ics});
 assert.equal(await fetchCalendarText('https://ucal.univie.ac.at/feed',ok.fetcher),ics);
 const rebind=fakeFetch({'evil.example.com':['10.1.2.3']},{});
 await assert.rejects(fetchCalendarText('https://evil.example.com/x.ics',rebind.fetcher),/private network/);
 assert.ok(!rebind.calls.some(u=>u.startsWith('https://evil.example.com')),'private host must never be requested');
 const hop=fakeFetch({'a.example.com':['93.184.216.34']},{'https://a.example.com/x':{redirect:'http://169.254.169.254/latest'}});
 await assert.rejects(fetchCalendarText('https://a.example.com/x',hop.fetcher),/HTTPS/);
 const big=fakeFetch({'a.example.com':['93.184.216.34']},{'https://a.example.com/big':'x'.repeat(2000001)});
 await assert.rejects(fetchCalendarText('https://a.example.com/big',big.fetcher),/2 MB/);
});

const range={from:'2026-11-01',to:'2027-11-01'};
const event=(over={})=>({key:'u1',uid:'u1',title:'Group meeting',date:'2026-11-12',endDate:'2026-11-12',allDay:false,time:'10:00',endTime:'11:00',description:'',location:'Room 1',...over});
const row=(source,over={})=>({id:'i1',ownerId:'m1',version:2,hasRsvp:false,sourceData:sourceDataFor(source),...source,...over});
const plan=(existing,incoming,incomplete=[])=>planSync({existing,incoming:incoming.map(e=>({id:'i'+e.key.slice(1),event:e})),incomplete,importerId:'m1',range});

test('three-way merge applies external changes and keeps local edits',()=>{
 const base=event();
 // External time change on an untouched meeting is applied.
 let p=plan([row(base)],[event({time:'14:00',endTime:'15:00'})]);
 assert.deepEqual(p.update[0].fields,{date:'2026-11-12',endDate:'2026-11-12',allDay:false,time:'14:00',endTime:'15:00'});
 // Local title edit survives while the external location change is merged in.
 p=plan([row(base,{title:'Renamed locally'})],[event({location:'Room 2'})]);
 assert.deepEqual(p.update[0].fields,{location:'Room 2'});assert.equal(p.preserved,0);
 // Both sides changed the schedule: local wins, conflict counted, base advances.
 p=plan([row(base,{time:'09:00'})],[event({time:'16:00',endTime:'17:00'})]);
 assert.deepEqual(p.update[0].fields,{});assert.equal(p.preserved,1);assert.match(p.update[0].sourceData,/16:00/);
 // No change at all writes nothing.
 assert.equal(plan([row(base)],[base]).update.length,0);
 // New events are inserted.
 assert.equal(plan([row(base)],[base,event({key:'u2',uid:'u2'})]).insert.length,1);
});

test('external deletions remove only untouched meetings from fully parsed series',()=>{
 const base=event(), other=event({key:'u2',uid:'u2'});
 assert.deepEqual(plan([row(base),row(other,{id:'i2'})],[other]).remove,[{id:'i1',version:2}]);
 assert.equal(plan([row(base,{title:'Edited'}),row(other,{id:'i2'})],[other]).remove.length,0);
 assert.equal(plan([row(base,{hasRsvp:true}),row(other,{id:'i2'})],[other]).remove.length,0);
 assert.equal(plan([row(base,{ownerId:'m2'}),row(other,{id:'i2'})],[other]).remove.length,0);
 assert.equal(plan([row(base),row(other,{id:'i2'})],[other],['u1']).remove.length,0,'failed series are not deletions');
 assert.equal(plan([row(base)],[]).remove.length,0,'empty feed never wipes meetings');
 assert.equal(plan([row(event({date:'2026-01-05',endDate:'2026-01-05'})),row(other,{id:'i2'})],[other]).remove.length,0,'outside window');
});

test('imported item IDs are stable per lab, member, calendar and event',async()=>{
 const a=await importedItemId('g','m','Uni','k');
 assert.equal(a,await importedItemId('g','m','Uni','k'));
 assert.notEqual(a,await importedItemId('g','m','Other','k'));
 assert.match(a,/^ics-[0-9a-f]{64}$/);
});

