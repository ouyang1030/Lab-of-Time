import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local tests only');
const run=crypto.randomUUID();let checks=0;
const human={turnstileToken:'XXXX.DUMMY.TOKEN.XXXX'}; // accepted by the Turnstile test secret in .dev.vars
// Each client gets a documentation-range IPv6 /64 so runs do not share rate-limit budgets.
const testNetwork=()=>`2001:db8:${Math.floor(Math.random()*0xffff).toString(16)}:${Math.floor(Math.random()*0xffff).toString(16)}::`;
const runIp=testNetwork()+'1';

async function req(client, body, expected=200, extra={}){
 const r=await fetch(base+'/api/workspace',{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json','cf-connecting-ip':client.ip??runIp,...(client.cookie?{Cookie:client.cookie}:{}),...extra},body:body?JSON.stringify(body):undefined});
 const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));checks++;
 const cookie=r.headers.get('set-cookie');if(cookie)client.cookie=cookie.split(';')[0];return data;
}
const a={},b={},c={},anon={};const password='Local-test-password-2026';
assert.equal((await req(anon)).members.length,0);
assert.equal((await req(anon,null,200,{'x-lot-member-id':'local_seedy',Cookie:'lot_member=local_seedy'})).user,null);
for(const [client,name] of [[a,'Owner'],[b,'Member'],[c,'Outside']]){client.email=`${name}-${run}@example.test`;const state=await req(client,{action:'register',...human,email:client.email,password,displayName:name});client.id=state.user.userId;assert.equal(state.group,null);}
await req(a,{action:'joinGroup',displayName:'Owner',color:'blue'},400);
await req(a,{action:'joinGroup',code:'invalid',displayName:'Owner',color:'blue'},404);
const lab=await req(a,{action:'createGroup',name:'Isolation test '+run,displayName:'Owner',color:'blue'});
await req(b,{action:'joinGroup',code:lab.group.inviteCode,displayName:'Member',color:'red'});
await req(c,{action:'createGroup',name:'Other '+run,displayName:'Outside',color:'navy'});
// Only the owner renames the lab; members see the new name.
await req(b,{action:'renameGroup',name:'Hijacked'},403);
await req(a,{action:'renameGroup',name:'   '},400);
assert.equal((await req(a,{action:'renameGroup',name:'Renamed lab '+run})).group.name,'Renamed lab '+run);
assert.equal((await req(b)).group.name,'Renamed lab '+run);assert.equal((await req(c)).group.name,'Other '+run);
const item={title:'Private research',type:'task',ownerId:a.id,date:'2026-11-10',time:'09:00',endTime:'10:00',cycle:'week',status:'todo',priority:'normal',description:'',location:''};
const created=await req(a,{action:'saveItem',item});const saved=created.items[0];
assert.equal((await req(b)).items.length,1);assert.equal((await req(c)).items.length,0);
await req(c,{action:'saveItem',item:{...saved,ownerId:c.id}},404);
// Item links are limited to single-line web addresses: they are rendered as links and exported to ICS.
await req(a,{action:'saveItem',item:{...item,url:'javascript:alert(1)'}},400);
await req(a,{action:'saveItem',item:{...item,url:'https://example.test/a\r\nBEGIN:VEVENT'}},400);
assert.equal((await req(a,{action:'saveItem',item:{...saved,url:'https://example.test/paper'}})).items[0].url,'https://example.test/paper');
// Repeat: a new item creates the whole series; an existing item stays the first occurrence and gains the later dates.
const series=await req(c,{action:'saveItem',item:{...item,ownerId:c.id,title:'Series'},repeat:{every:'week',until:'2026-11-24'}});
assert.equal(series.notice,'Created 3 repeating items');assert.deepEqual(series.items.map(i=>i.date).sort(),['2026-11-10','2026-11-17','2026-11-24']);
const single=(await req(c,{action:'saveItem',item:{...item,ownerId:c.id,title:'Later',date:'2026-12-01'}})).items.find(i=>i.title==='Later');
await req(c,{action:'saveItem',item:{...single,version:9},repeat:{every:'week',until:'2026-12-15'}},409);
const extended=await req(c,{action:'saveItem',item:{...single,priority:'high'},repeat:{every:'week',until:'2026-12-15'}});
const later=extended.items.filter(i=>i.title==='Later');
assert.equal(extended.notice,'Created 2 repeating items');assert.deepEqual(later.map(i=>i.date).sort(),['2026-12-01','2026-12-08','2026-12-15']);
assert.ok(later.every(i=>i.priority==='high'));assert.equal(later.find(i=>i.id===single.id).version,2);
// Repeat overrides instead of stacking: a new rule replaces the later occurrences.
const titled=(state,title)=>state.items.filter(i=>i.title===title).sort((x,y)=>x.date.localeCompare(y.date));
let anchor=later.find(i=>i.id===single.id);
const daily=await req(c,{action:'saveItem',item:anchor,repeat:{every:'day',until:'2026-12-04'}});
assert.equal(daily.notice,'Repeat updated: replaced 2 later items with 3');
assert.deepEqual(titled(daily,'Later').map(i=>i.date),['2026-12-01','2026-12-02','2026-12-03','2026-12-04']);
assert.ok(titled(daily,'Later').every(i=>i.repeatEvery==='day'&&i.repeatUntil==='2026-12-04'&&i.seriesId===titled(daily,'Later')[0].seriesId));
// Applying the same rule again, or toggling status without a repeat, leaves the series alone.
anchor=titled(daily,'Later')[0];
const same=await req(c,{action:'saveItem',item:{...anchor,status:'doing'},repeat:{every:'day',until:'2026-12-04'}});
assert.equal(same.notice,undefined);assert.equal(titled(same,'Later').length,4);
anchor=titled(same,'Later')[0];
assert.equal(titled(await req(c,{action:'saveItem',item:{...anchor,status:'done'}}),'Later').length,4);
// Changing from a middle occurrence keeps the earlier ones and ends their rule the day before.
const middle=titled(await req(c),'Later')[2];
const split=await req(c,{action:'saveItem',item:middle,repeat:{every:'week',until:'2026-12-10'}});
assert.deepEqual(titled(split,'Later').map(i=>[i.date,i.repeatEvery,i.repeatUntil]),[['2026-12-01','day','2026-12-02'],['2026-12-02','day','2026-12-02'],['2026-12-03','week','2026-12-10'],['2026-12-10','week','2026-12-10']]);
// Never removes the later occurrences of the first item's rule, including the newer ones.
const first=titled(split,'Later')[0];
const never=await req(c,{action:'saveItem',item:first,repeat:null});
assert.equal(never.notice,'Repeat updated: removed 3 later items');
assert.deepEqual(titled(never,'Later').map(i=>[i.date,i.repeatEvery,i.seriesId]),[['2026-12-01','','']]);
await req(b,{action:'transferOwnership',id:a.id},403);
await req(a,{action:'transferOwnership',id:c.id},409);
await req(a,{action:'transferOwnership',id:a.id},409);
const transferred=await req(a,{action:'transferOwnership',id:b.id});
assert.equal(transferred.members.filter(m=>m.role==='owner').length,1);
assert.equal(transferred.members.find(m=>m.id===b.id).role,'owner');assert.equal(transferred.members.find(m=>m.id===a.id).role,'admin');
await req(a,{action:'role',id:b.id,role:'member'},403);
await req(b,{action:'transferOwnership',id:a.id});
const stolenCookie=a.cookie;await req(a,{action:'signOut'});assert.equal((await req({cookie:stolenCookie})).user,null);
await req(a,{action:'login',...human,email:a.email,password:'wrong'},401);
const login=await req(a,{action:'login',...human,email:a.email,password});assert.equal(login.group.id,lab.group.id);

// Password recovery & Account self-service tests
await req(b, {action: 'issueReset', id: a.id}, 403);
const issued = await req(a, {action: 'issueReset', id: b.id});
assert.ok(issued.resetCode);
const newPass = 'Brand-new-password-2026';
await req(anon, {action: 'resetPassword',...human, email: b.email, code: 'INVALID-CODE', password: newPass}, 400);
const resetRes = await req(anon, {action: 'resetPassword',...human, email: b.email, code: issued.resetCode, password: newPass});
assert.equal(resetRes.user.userId, b.id);
await req(b, {action: 'login',...human, email: b.email, password}, 401);
const reLogin = await req(b, {action: 'login',...human, email: b.email, password: newPass});
assert.equal(reLogin.user.userId, b.id);
const changedPass = 'Changed-pass-again-2026';
await req(b, {action: 'changePassword', current: 'wrong-pass', password: changedPass}, 401);
await req(b, {action: 'changePassword', current: newPass, password: changedPass});
// Dissolving: only the owner, with the exact lab name; every member returns to having no lab.
await req(b,{action:'dissolveGroup',name:'Renamed lab '+run},403);
await req(a,{action:'dissolveGroup',name:'Renamed lab'},400);
const dissolved=await req(a,{action:'dissolveGroup',name:'Renamed lab '+run});
assert.equal(dissolved.hasWorkspace,false);assert.equal(dissolved.group,null);assert.equal(dissolved.user.userId,a.id);
const left=await req(b);assert.equal(left.group,null);assert.equal(left.user.userId,b.id);
await req(b,{action:'saveItem',item},403);
assert.equal((await req(c)).group.name,'Other '+run);
// Former members keep their accounts and can start over.
const relab=await req(a,{action:'createGroup',name:'Second lab '+run,displayName:'Owner',color:'blue'});
assert.equal(relab.items.length,0);
await req(b,{action:'joinGroup',code:relab.group.inviteCode,displayName:'Member',color:'red'});
await req(a, {action: 'deleteAccount', current: password}, 409);
await req(b, {action: 'deleteAccount', current: changedPass});
assert.equal((await req(a)).members.filter(m => m.id === b.id).length, 0);
await req(c, {action: 'deleteAccount', current: password});
assert.equal((await req(c)).user, null);

// Abuse protections
await req({},{action:'register',email:`no-token-${run}@example.test`,password,displayName:'No token'},400);
const burst=testNetwork();
const newAccount=(client,label,status=200)=>req(client,{action:'register',...human,email:`${label}-${crypto.randomUUID().slice(0,8)}@example.test`,password,displayName:label},status);
// Every address in one /64 shares the budget of 10 registrations per hour.
for(let host=1;host<=10;host++)await newAccount({ip:burst+host.toString(16)},'burst');
await newAccount({ip:burst+'ff'},'burst',429);
// Failed sign-ins from another network cannot lock the owner out.
const attacker={ip:testNetwork()+'1'};
for(let i=0;i<10;i++)await req(attacker,{action:'login',...human,email:a.email,password:'wrong-password-guess'},401);
await req(attacker,{action:'login',...human,email:a.email,password},429);
await req(a,{action:'login',...human,email:a.email,password});
const busyEmail=`busy-${run}@example.test`;
const busy={ip:testNetwork()+'1'};await req(busy,{action:'register',...human,email:busyEmail,password,displayName:'Busy'});
// Changing the sign-in email requires the current password.
const movedEmail=`moved-${run}@example.test`;
await req(a,{action:'profile',name:'Owner',email:movedEmail,color:'blue'},401);
await req(a,{action:'profile',name:'Owner',email:movedEmail,color:'blue',current:'wrong-password-guess'},401);
await req(a,{action:'profile',name:'Owner',email:movedEmail,color:'blue',current:password});
assert.equal((await req(a)).user.email,movedEmail);
await req(a,{action:'profile',name:'Owner',email:movedEmail,color:'red'});
await req(a,{action:'profile',name:'x'.repeat(3_100_000),color:'blue'},413);
// A body without a declared length cannot bypass the size cap.
const unsized=await fetch(base+'/api/workspace',{method:'POST',duplex:'half',headers:{Origin:base,'Content-Type':'application/json',Cookie:a.cookie},body:new Blob([JSON.stringify({action:'rotateInvite'})]).stream()});
assert.equal(unsized.status,413);checks++;
// Email changes are checked against the password before the address, so they cannot probe for accounts.
await req(a,{action:'profile',name:'Owner',email:busyEmail,color:'blue'},401);
await req(a,{action:'profile',name:'Owner',email:busyEmail,color:'blue',current:password},409);
await req(a,{action:'profile',name:'Owner',email:'not-an-email',color:'blue',current:password},400);
// Each signed-in member gets 60 requests per minute.
await req(busy,{action:'createGroup',name:'Busy lab',displayName:'Busy',color:'blue'});
for(let i=1;i<60;i++)await req(busy,{action:'profile',name:'Busy',color:'blue'});
await req(busy,{action:'profile',name:'Busy',color:'blue'},429);

console.log(`${checks} integration checks passed; tenant isolation, real accounts, revoked sessions, owner transfer, password resets, account self-service, Turnstile, rate limits and email-change re-authentication verified.`);
