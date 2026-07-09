const test = require('node:test');
const assert = require('node:assert/strict');
const RingBuffer = require('../src/structures/ringBuffer');

test('rejects invalid capacity', () => {
  assert.throws(() => new RingBuffer(0));
  assert.throws(() => new RingBuffer(-5));
  assert.throws(() => new RingBuffer(1.5));
});

test('push then last returns items in chronological order', () => {
  const b = new RingBuffer(5);
  b.push('a');
  b.push('b');
  b.push('c');
  assert.deepEqual(b.last(3), ['a', 'b', 'c']);
  assert.equal(b.size, 3);
});

test('last(n) with n smaller than size returns only the newest n', () => {
  const b = new RingBuffer(5);
  ['a', 'b', 'c', 'd'].forEach((x) => b.push(x));
  assert.deepEqual(b.last(2), ['c', 'd']);
});

test('last(n) with n larger than size returns everything without padding', () => {
  const b = new RingBuffer(5);
  b.push('a');
  assert.deepEqual(b.last(10), ['a']);
});

test('overwrites the OLDEST item when full (the defining ring behavior)', () => {
  const b = new RingBuffer(3);
  ['a', 'b', 'c'].forEach((x) => b.push(x));
  assert.equal(b.isFull, true);
  b.push('d'); // overwrites 'a'
  assert.deepEqual(b.toArray(), ['b', 'c', 'd']);
  assert.equal(b.size, 3);
  assert.equal(b.stats().overwrites, 1);
});

test('stays correct across many wrap-arounds', () => {
  const b = new RingBuffer(4);
  for (let i = 1; i <= 25; i++) b.push(i);
  assert.deepEqual(b.toArray(), [22, 23, 24, 25]);
  assert.equal(b.stats().pushes, 25);
  assert.equal(b.stats().overwrites, 21);
});

test('find locates an item currently in the buffer', () => {
  const b = new RingBuffer(3);
  b.push({ id: 1 });
  b.push({ id: 2 });
  b.push({ id: 3 });
  b.push({ id: 4 }); // id:1 has been overwritten
  assert.equal(b.find((m) => m.id === 3).id, 3);
  assert.equal(b.find((m) => m.id === 1), undefined);
});

test('mutating a found item is visible in later reads (removed-flag use case)', () => {
  const b = new RingBuffer(3);
  b.push({ id: 1, removed: false });
  b.find((m) => m.id === 1).removed = true;
  assert.equal(b.toArray()[0].removed, true);
});

test('clear empties the buffer but keeps capacity', () => {
  const b = new RingBuffer(3);
  b.push('a');
  b.clear();
  assert.equal(b.size, 0);
  assert.deepEqual(b.toArray(), []);
  b.push('z');
  assert.deepEqual(b.toArray(), ['z']);
});

test('fillRatio reports buffer usage', () => {
  const b = new RingBuffer(4);
  b.push('a');
  b.push('b');
  assert.equal(b.stats().fillRatio, 0.5);
});
