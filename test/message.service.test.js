process.env.BUFFER_CAPACITY = '3';       // tiny buffer → wrap-around is testable
process.env.DAILY_MESSAGE_LIMIT = '2';
process.env.MESSAGE_MAX_LENGTH = '50';

const test = require('node:test');
const assert = require('node:assert/strict');
const { patch, restoreAll } = require('./helpers');

const messageModel = require('../src/models/message.model');
const roomService = require('../src/services/room.service');
const messageService = require('../src/services/message.service');

const alice = { id: 1, name: 'Alice', role: 'user' };

function allowMembership() {
  patch(roomService, 'assertMember', async () => ({ room: { id: 7 }, membership: { role: 'member' } }));
}

test.afterEach(() => {
  restoreAll();
  messageService._resetForTests();
});

test('rejects an empty or whitespace-only message', async () => {
  allowMembership();
  await assert.rejects(messageService.postMessage(alice, 7, ''), /empty/i);
  await assert.rejects(messageService.postMessage(alice, 7, '    '), /empty/i);
});

test('rejects a message over the max length', async () => {
  allowMembership();
  await assert.rejects(messageService.postMessage(alice, 7, 'x'.repeat(51)), /too long/i);
});

test('sanitizes HTML out of the body (WS path never sees Express middleware)', async () => {
  allowMembership();
  patch(messageModel, 'countTodayByUser', async () => 0);
  patch(messageModel, 'recentForRoom', async () => []);
  patch(messageModel, 'create', async () => 101);

  const { message } = await messageService.postMessage(
    alice, 7, 'hi <script>alert(1)</script> there'
  );
  assert.ok(!message.body.includes('<script>'));
  assert.match(message.body, /hi/);
});

test('membership is required — the shared room guard is consulted', async () => {
  patch(roomService, 'assertMember', async () => {
    const err = new Error('You are not a member of this room.');
    err.isOperational = true;
    err.statusCode = 403;
    throw err;
  });
  await assert.rejects(messageService.postMessage(alice, 7, 'hello'), /not a member/i);
});

test('daily limit: seeded once from the DB, then counted in memory', async () => {
  allowMembership();
  let dbCounts = 0;
  patch(messageModel, 'countTodayByUser', async () => { dbCounts++; return 1; }); // 1 already sent today
  patch(messageModel, 'recentForRoom', async () => []);
  patch(messageModel, 'create', async () => 1);

  await messageService.postMessage(alice, 7, 'second of the day'); // 2/2 → ok
  await assert.rejects(messageService.postMessage(alice, 7, 'third'), /daily/i);
  assert.equal(dbCounts, 1); // the COUNT query ran exactly once
});

test('write-behind: message returns before the INSERT, id backfills after', async () => {
  allowMembership();
  patch(messageModel, 'countTodayByUser', async () => 0);
  patch(messageModel, 'recentForRoom', async () => []);
  let resolveInsert;
  patch(messageModel, 'create', () => new Promise((res) => { resolveInsert = res; }));

  const { message, persisted } = await messageService.postMessage(alice, 7, 'hello');
  assert.equal(message.id, null);        // broadcastable NOW, insert still in flight
  assert.equal(message.body, 'hello');

  resolveInsert(555);                    // the INSERT completes
  await persisted;
  assert.equal(message.id, 555);         // same object the buffer holds got the id
});

test('cold buffer hydrates from MySQL exactly once, then serves from memory', async () => {
  allowMembership();
  let dbReads = 0;
  patch(messageModel, 'recentForRoom', async () => {
    dbReads++;
    return [
      { id: 1, room_id: 7, user_id: 2, user_name: 'Bob', body: 'old 1', is_deleted: 0, created_at: new Date() },
      { id: 2, room_id: 7, user_id: 2, user_name: 'Bob', body: 'old 2', is_deleted: 0, created_at: new Date() },
    ];
  });

  const first = await messageService.getRecent(alice, 7);
  const second = await messageService.getRecent(alice, 7);
  assert.equal(first.length, 2);
  assert.deepEqual(second.map((m) => m.body), ['old 1', 'old 2']);
  assert.equal(dbReads, 1); // second read never touched MySQL
});

test('buffer wraps: only the newest N messages are kept (capacity 3)', async () => {
  allowMembership();
  patch(messageModel, 'countTodayByUser', async () => -100); // effectively unlimited
  patch(messageModel, 'recentForRoom', async () => []);
  patch(messageModel, 'create', async () => 1);

  for (const text of ['m1', 'm2', 'm3', 'm4', 'm5']) {
    await messageService.postMessage(alice, 7, text);
  }
  const recent = await messageService.getRecent(alice, 7);
  assert.deepEqual(recent.map((m) => m.body), ['m3', 'm4', 'm5']);
});

test('moderation permissions: author and admin may remove; strangers may not', async () => {
  const row = { id: 9, room_id: 7, user_id: 1, body: 'x', is_deleted: 0 };
  patch(messageModel, 'findById', async () => ({ ...row }));
  const roomModel = require('../src/models/room.model');
  patch(roomModel, 'findById', async () => ({ id: 7, owner_id: 42 }));
  let setArgs;
  patch(messageModel, 'setDeleted', async (id, del) => { setArgs = [id, del]; });

  // stranger (not author, not owner, not admin)
  await assert.rejects(
    messageService.removeMessage({ id: 99, name: 'Eve', role: 'user' }, 9),
    /cannot moderate/i
  );
  // author
  await messageService.removeMessage(alice, 9);
  assert.deepEqual(setArgs, [9, true]);
  // admin restore
  await messageService.restoreMessage({ id: 5, name: 'Root', role: 'admin' }, 9);
  assert.deepEqual(setArgs, [9, false]);
});

test('restore is NOT allowed for the author (owners/admins only)', async () => {
  patch(messageModel, 'findById', async () => ({ id: 9, room_id: 7, user_id: 1, is_deleted: 1 }));
  const roomModel = require('../src/models/room.model');
  patch(roomModel, 'findById', async () => ({ id: 7, owner_id: 42 }));
  await assert.rejects(messageService.restoreMessage(alice, 9), /cannot moderate/i);
});

test('removing a message flags the buffered copy in place', async () => {
  allowMembership();
  patch(messageModel, 'countTodayByUser', async () => 0);
  patch(messageModel, 'recentForRoom', async () => []);
  patch(messageModel, 'create', async () => 777);

  const { message, persisted } = await messageService.postMessage(alice, 7, 'delete me');
  await persisted; // id = 777 now in the buffer

  patch(messageModel, 'findById', async () => ({ id: 777, room_id: 7, user_id: 1, is_deleted: 0 }));
  const roomModel = require('../src/models/room.model');
  patch(roomModel, 'findById', async () => ({ id: 7, owner_id: 42 }));
  patch(messageModel, 'setDeleted', async () => {});

  await messageService.removeMessage(alice, 777);
  assert.equal(message.removed, true); // the buffer object itself was flagged

  const recent = await messageService.getRecent(alice, 7);
  assert.equal(recent.find((m) => m.id === 777).removed, true);
});
