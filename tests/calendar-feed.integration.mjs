import assert from 'node:assert/strict';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local tests only');
const run = crypto.randomUUID();
const ip = `2001:db8:${Math.floor(Math.random() * 0xffff).toString(16)}:${Math.floor(Math.random() * 0xffff).toString(16)}::1`;
const password = 'Feed-test-password-2026';
const human = { turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' };
let checks = 0;

async function req(client, body, status = 200) {
  const response = await fetch(base + '/api/workspace', {
    method: body ? 'POST' : 'GET',
    headers: { Origin: base, 'Content-Type': 'application/json', 'cf-connecting-ip': ip, ...(client.cookie ? { Cookie: client.cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  checks++;
  const cookie = response.headers.get('set-cookie');
  if (cookie) client.cookie = cookie.split(';')[0];
  return data;
}
// Calendar apps send no cookie: the link alone must be enough, and nothing else.
async function feed(token, status = 200, path = `/api/calendar/${token}.ics`) {
  const response = await fetch(base + path);
  const text = await response.text();
  assert.equal(response.status, status, text.slice(0, 200));
  checks++;
  if (status !== 200) return [];
  assert.match(response.headers.get('content-type'), /^text\/calendar/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  return text.split('\r\n').filter(line => line.startsWith('SUMMARY:')).map(line => line.slice(8)).sort();
}
const dayOffset = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

const owner = {}, member = {};
for (const [client, name] of [[owner, 'Feed owner'], [member, 'Feed member']]) {
  client.email = `feed-${name.replace(' ', '-')}-${run}@example.test`;
  client.id = (await req(client, { action: 'register', ...human, email: client.email, password, displayName: name })).user.userId;
}
const lab = (await req(owner, { action: 'createGroup', name: 'Feed test lab', displayName: 'Feed owner', color: 'blue' })).group;
const join = () => req(member, { action: 'joinGroup', code: lab.inviteCode, displayName: 'Feed member', color: 'red' });
await join();

const fields = { type: 'task', date: dayOffset(7), time: '09:00', endTime: '10:00', cycle: 'week', status: 'todo', priority: 'normal', description: '', location: '' };
await req(member, { action: 'saveItem', item: { ...fields, title: 'Member task', ownerId: member.id } });
await req(member, { action: 'saveItem', item: { ...fields, title: 'Old task', ownerId: member.id, date: dayOffset(-200) } });
await req(owner, { action: 'saveItem', item: { ...fields, title: 'Owner task', ownerId: owner.id } });
for (const title of ['Lab meeting', 'Skipped meeting'])
  await req(owner, { action: 'saveItem', item: { ...fields, type: 'meeting', title, ownerId: owner.id } });
const meetings = (await req(member)).items.filter(item => item.type === 'meeting');
await req(member, { action: 'rsvp', id: meetings.find(item => item.title === 'Lab meeting').id, response: 'yes' });
await req(member, { action: 'rsvp', id: meetings.find(item => item.title === 'Skipped meeting').id, response: 'no' });

assert.equal((await req(member)).calendarFeed, null);
await req(member, { action: 'setCalendarFeedScope', scope: 'lab' }, 404);
await req({}, { action: 'createCalendarFeed', scope: 'mine' }, 401);
await req(member, { action: 'createCalendarFeed', scope: 'everything' }, 400);

const created = await req(member, { action: 'createCalendarFeed', scope: 'mine' });
const token = created.feedToken;
assert.match(token, /^[0-9a-f]{64}$/);
assert.equal(created.calendarFeed.scope, 'mine');
// The token is never repeated in later snapshots, and other members cannot see the link.
assert.equal(JSON.stringify(await req(member)).includes(token), false);
assert.equal((await req(owner)).calendarFeed, null);

assert.deepEqual(await feed(token), ['Lab meeting', 'Member task']);
await req(member, { action: 'setCalendarFeedScope', scope: 'lab' });
assert.deepEqual(await feed(token), ['Lab meeting', 'Member task', 'Owner task', 'Skipped meeting']);
await feed('0'.repeat(64), 404);
await feed(token, 404, `/api/calendar/${token}`);
await feed(token.toUpperCase(), 404);

// A new link keeps the scope choice of the request and retires the old one.
const replaced = (await req(member, { action: 'createCalendarFeed', scope: 'mine' })).feedToken;
await feed(token, 404);
assert.deepEqual(await feed(replaced), ['Lab meeting', 'Member task']);

// Inactive members' links stop serving until they are reactivated.
await req(owner, { action: 'deactivate', id: member.id });
await feed(replaced, 404);
await req(owner, { action: 'role', id: member.id, role: 'member' });
assert.deepEqual(await feed(replaced), ['Lab meeting', 'Member task']);

await req(member, { action: 'deleteCalendarFeed' });
assert.equal((await req(member)).calendarFeed, null);
await feed(replaced, 404);

// Removal revokes the link, and it does not follow the account into a later membership.
const beforeRemoval = (await req(member, { action: 'createCalendarFeed', scope: 'lab' })).feedToken;
await req(owner, { action: 'removeMember', id: member.id });
await feed(beforeRemoval, 404);
await join();
assert.equal((await req(member)).calendarFeed, null);
await feed(beforeRemoval, 404);

// Each link is limited to 60 fetches an hour.
const ownerToken = (await req(owner, { action: 'createCalendarFeed', scope: 'lab' })).feedToken;
let served = 0;
for (let i = 0; i < 60; i++) if ((await fetch(`${base}/api/calendar/${ownerToken}.ics`).then(r => r.body.cancel().then(() => r.status))) === 200) served++;
assert.equal(served, 60);
await feed(ownerToken, 429);

// Account deletion removes feeds before memberships (foreign keys), including the dissolving owner's.
const memberToken = (await req(member, { action: 'createCalendarFeed', scope: 'mine' })).feedToken;
await req(member, { action: 'deleteAccount', current: password });
await feed(memberToken, 404);
await req(owner, { action: 'deleteAccount', current: password });
await feed(ownerToken, 404);
console.log(`${checks} calendar feed checks passed: scopes, secret links, rotation, deactivation, removal, rate limit and account cleanup.`);
