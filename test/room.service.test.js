process.env.BASE_URL = 'http://test.local';

const test = require('node:test');
const assert = require('node:assert/strict');
const { patch, restoreAll } = require('./helpers');

const roomModel = require('../src/models/room.model');
const roomMemberModel = require('../src/models/roomMember.model');
const roomService = require('../src/services/room.service');

const alice = { id: 1, name: 'Alice', role: 'user' };

test.afterEach(restoreAll);

test('rejects a too-short or too-long room name', async () => {
  await assert.rejects(roomService.createRoom(alice, 'ab'), /3–50/);
  await assert.rejects(roomService.createRoom(alice, 'x'.repeat(51)), /3–50/);
});

test('creating a room makes the creator its owner member with an invite link', async () => {
  patch(roomModel, 'create', async () => 12);
  let membership;
  patch(roomMemberModel, 'add', async (m) => { membership = m; });

  const room = await roomService.createRoom(alice, '  Study Group  ');
  assert.equal(room.name, 'Study Group');
  assert.deepEqual(membership, { roomId: 12, userId: 1, role: 'owner' });
  assert.match(room.inviteCode, /^[A-Za-z0-9]{10}$/);
  assert.equal(room.inviteUrl, `http://test.local/join/${room.inviteCode}`);
});

test('assertMember: non-members are refused, admins pass, archived rooms are gone', async () => {
  patch(roomModel, 'findById', async () => ({ id: 7, is_archived: 0 }));
  patch(roomMemberModel, 'find', async () => null);
  await assert.rejects(roomService.assertMember(7, alice), /not a member/i);

  const admin = { id: 5, name: 'Root', role: 'admin' };
  const out = await roomService.assertMember(7, admin);
  assert.equal(out.membership.role, 'admin');

  patch(roomModel, 'findById', async () => ({ id: 7, is_archived: 1 }));
  await assert.rejects(roomService.assertMember(7, admin), /archived/i);
});

test('joining by invite validates the code and refuses archived rooms', async () => {
  await assert.rejects(roomService.joinByInvite(alice, 'bad code!'), /invite/i);

  patch(roomModel, 'findByInviteCode', async () => null);
  await assert.rejects(roomService.joinByInvite(alice, 'abcdef1234'), /invite/i);

  patch(roomModel, 'findByInviteCode', async () => ({ id: 3, name: 'Lounge', is_archived: 1 }));
  await assert.rejects(roomService.joinByInvite(alice, 'abcdef1234'), /archived/i);

  patch(roomModel, 'findByInviteCode', async () => ({ id: 3, name: 'Lounge', is_archived: 0 }));
  let added;
  patch(roomMemberModel, 'add', async (m) => { added = m; });
  const room = await roomService.joinByInvite(alice, 'abcdef1234');
  assert.equal(room.name, 'Lounge');
  assert.deepEqual(added, { roomId: 3, userId: 1, role: 'member' });
});

test('owners cannot leave their own room', async () => {
  patch(roomMemberModel, 'find', async () => ({ role: 'owner' }));
  await assert.rejects(roomService.leaveRoom(alice, 7), /archive it instead/i);
});

test('members can leave', async () => {
  patch(roomMemberModel, 'find', async () => ({ role: 'member' }));
  let removed;
  patch(roomMemberModel, 'remove', async (roomId, userId) => { removed = [roomId, userId]; });
  await roomService.leaveRoom(alice, 7);
  assert.deepEqual(removed, [7, 1]);
});

test('only the owner (or an admin) can rename or archive', async () => {
  patch(roomModel, 'findById', async () => ({ id: 7, owner_id: 42, is_archived: 0 }));
  await assert.rejects(roomService.rename(alice, 7, 'New Name'), /owner/i);
  await assert.rejects(roomService.setArchived(alice, 7, true), /owner/i);

  let renamed;
  patch(roomModel, 'rename', async (_id, name) => { renamed = name; });
  await roomService.rename({ id: 5, role: 'admin' }, 7, '  Renamed  ');
  assert.equal(renamed, 'Renamed');
});
