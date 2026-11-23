import assert from 'node:assert/strict';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local tests only');
const run = crypto.randomUUID();
const ip = `2001:db8:${Math.floor(Math.random() * 0xffff).toString(16)}:${Math.floor(Math.random() * 0xffff).toString(16)}::1`;
const password = 'Membership-test-password-2026';
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

const owner = {}, member = {}, outside = {};
for (const [client, name] of [[owner, 'Owner'], [member, 'Departing'], [outside, 'Outside']]) {
  client.email = `membership-${name}-${run}@example.test`;
  client.id = (await req(client, { action: 'register', ...human, email: client.email, password, displayName: name })).user.userId;
}
const lab = (await req(owner, { action: 'createGroup', name: 'Membership test', displayName: 'Owner', color: 'blue' })).group;
const otherLab = (await req(outside, { action: 'createGroup', name: 'Unrelated lab', displayName: 'Outside', color: 'blue' })).group;
const join = (client, group = lab) => req(client, { action: 'joinGroup', code: group.inviteCode, displayName: 'Departing', color: 'red' });
await join(member);
await req({}, { action: 'leaveGroup' }, 401);
await req(member, { action: 'removeMember', id: owner.id }, 403);
await req(owner, { action: 'leaveGroup' }, 403);
await req(owner, { action: 'removeMember', id: owner.id }, 403);
await req(owner, { action: 'removeMember', id: outside.id }, 404);
await req(owner, { action: 'removeMember', id: 'missing-member' }, 404);

const fields = { title: 'Shared work', type: 'task', ownerId: member.id, date: '2026-12-31', time: '09:00', endTime: '10:00', cycle: 'week', status: 'todo', priority: 'normal', description: 'Keep this work', location: '' };
for (const [type, status] of [['task', 'todo'], ['task', 'done'], ['meeting', 'todo'], ['milestone', 'doing']])
  await req(member, { action: 'saveItem', item: { ...fields, type, status, title: `${type}-${status}` } });
const before = await req(member);
const meeting = before.items.find(item => item.type === 'meeting');
await req(owner, { action: 'rsvp', id: meeting.id, response: 'yes' });
await req(member, { action: 'rsvp', id: meeting.id, response: 'yes' });
await req(member, { action: 'rsvp', id: meeting.id, response: null });
assert.deepEqual((await req(member)).attendance, [{ itemId: meeting.id, memberId: owner.id, response: 'yes' }]);
await req(member, { action: 'rsvp', id: meeting.id, response: 'yes' });
// A deliberately unresolvable feed is persisted with a failed-sync status.
// This exercises real subscription cleanup without depending on an external ICS fixture.
const subscribed = await req(member, { action: 'subscribeCalendar', sourceName: 'Departure feed', url: 'https://membership-test.invalid/calendar.ics' });
assert.equal(subscribed.subscriptions.length, 1);
const oldFeed = subscribed.subscriptions[0].id;
const reset = (await req(owner, { action: 'issueReset', id: member.id })).resetCode;

const removed = await req(owner, { action: 'removeMember', id: member.id });
assert.equal(removed.members.some(row => row.id === member.id), false);
assert.equal(removed.items.length, before.items.length);
for (const original of before.items) {
  assert.deepEqual(removed.items.find(item => item.id === original.id), { ...original, ownerId: owner.id, version: original.version + 1 });
}
assert.deepEqual(removed.attendance, [{ itemId: meeting.id, memberId: owner.id, response: 'yes' }]);
assert.equal((await req(outside)).group.id, otherLab.id);
const unassigned = await req(member);
assert.equal(unassigned.user.userId, member.id);
assert.equal(unassigned.hasWorkspace, false);
assert.equal(unassigned.group, null);
for (const key of ['items', 'members', 'attendance', 'subscriptions']) assert.deepEqual(unassigned[key], []);
await req(member, { action: 'saveItem', item: fields }, 403);
await req({}, { action: 'resetPassword', ...human, email: member.email, code: reset, password }, 400);
await req(member, { action: 'login', ...human, email: member.email, password });
const joinedElsewhere = await join(member, otherLab);
assert.equal(joinedElsewhere.group.id, otherLab.id);
assert.deepEqual(joinedElsewhere.subscriptions, []);
await req(member, { action: 'syncSubscription', id: oldFeed }, 404);

// Ordinary members and admins can leave; their account/session survives refresh.
await req(member, { action: 'leaveGroup' });
await join(member);
await req(member, { action: 'saveItem', item: { ...fields, title: 'Voluntary handover' } });
await req(member, { action: 'rsvp', id: meeting.id, response: 'no' });
await req(member, { action: 'subscribeCalendar', sourceName: 'Departure feed', url: 'https://membership-test.invalid/calendar.ics' });
await req(owner, { action: 'role', id: member.id, role: 'admin' });
await req(member, { action: 'removeMember', id: owner.id }, 403);
const left = await req(member, { action: 'leaveGroup' });
assert.equal(left.hasWorkspace, false);
assert.equal(left.user.userId, member.id);
assert.equal((await req(member)).hasWorkspace, false);
const handedOver = await req(owner);
assert.ok(handedOver.items.every(item => item.ownerId === owner.id));
assert.equal(handedOver.items.find(item => item.title === 'Voluntary handover').version, 2);
assert.equal(handedOver.attendance.some(row => row.memberId === member.id), false);
// A stale editor must not overwrite the reassignment.
await req(owner, { action: 'saveItem', item: { ...before.items[0], ownerId: owner.id } }, 409);
await join(member);
assert.deepEqual((await req(member)).subscriptions, []);
await req(owner, { action: 'deactivate', id: member.id });
await req(owner, { action: 'removeMember', id: member.id });
assert.equal((await req(member, { action: 'createGroup', name: 'Fresh start', displayName: 'Departing', color: 'red' })).hasWorkspace, true);

// Clean up only the accounts and labs created by this run.
for (const client of [owner, member, outside]) await req(client, { action: 'deleteAccount', current: password });
console.log(`${checks} membership API checks passed: removal, leaving, role guards, isolation, item handover, reset revocation, RSVP/feed cleanup, retained accounts and rejoining.`);
