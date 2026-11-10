import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch } from '../lib/search.ts';
const members = [{ id: 'one', name: 'Ada Chen' }];
const item = { title: 'Motion capture', description: 'Pilot experiment analysis', location: 'Lab 302 https://meet.example.org/room', date: '2027-02-10', type: 'meeting', ownerId: 'one', status: 'todo', priority: 'high' };
test('Search trims whitespace, ignores case and finds a different month', () => {
  assert.equal(matchesSearch(item, members, '  MOTION  '), true);
  assert.equal(matchesSearch(item, members, '2027-02'), true);
});
test('Search words can span title, notes, owner, location and priority', () => {
  assert.equal(matchesSearch(item, members, 'Ada analysis 302 high'), true);
  assert.equal(matchesSearch(item, members, 'meet.example.org'), true);
  assert.equal(matchesSearch(item, members, 'missing'), false);
});
test('Empty input and normalized full-width characters behave consistently', () => {
  assert.equal(matchesSearch(item, members, '   '), true);
  assert.equal(matchesSearch(item, members, '３０２'), true);
});
