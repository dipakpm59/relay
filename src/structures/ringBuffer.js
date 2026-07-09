/**
 * RingBuffer — hand-built fixed-capacity circular buffer with O(1) push.
 *
 * The chat-world twin of Trimly's LRU cache: an in-memory structure sitting
 * in front of MySQL on the hot path. One buffer per active room holds the
 * last N messages, so opening a room serves recent history straight from
 * memory — MySQL is only touched for OLDER history.
 *
 * Why a ring buffer here (vs the LRU cache in the URL shortener)?
 *   - Chat wants the NEWEST N items: bounded memory, oldest silently
 *     overwritten. A circular array does that in O(1) with zero pointer
 *     bookkeeping.
 *   - Redirects wanted the most REUSED keys out of an unbounded key space —
 *     that's recency-of-ACCESS, which needs the LRU's map + linked list.
 *
 * Implementation: a pre-allocated array + a write index. push() writes at
 * (start + size) % capacity, overwriting the oldest slot when full.
 * last(n) reads the most recent n items in chronological order.
 *
 * This module is intentionally pure (no imports) so node:test can unit-test
 * it in complete isolation. App wiring lives in the message service.
 */
class RingBuffer {
  constructor(capacity = 200) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error('RingBuffer capacity must be a positive integer');
    }
    this.capacity = capacity;
    this.slots = new Array(capacity);
    this.start = 0;   // index of the OLDEST item
    this.size = 0;    // how many slots are filled (≤ capacity)

    // instrumentation (surfaced on the admin dashboard)
    this.pushes = 0;
    this.overwrites = 0;
  }

  /** O(1). Append an item; silently overwrites the oldest when full. */
  push(item) {
    const writeAt = (this.start + this.size) % this.capacity;
    if (this.size === this.capacity) {
      // full: the slot being written IS the oldest → advance start
      this.slots[writeAt] = item;
      this.start = (this.start + 1) % this.capacity;
      this.overwrites++;
    } else {
      this.slots[writeAt] = item;
      this.size++;
    }
    this.pushes++;
  }

  /** Most recent `n` items in CHRONOLOGICAL order (oldest → newest). */
  last(n = this.size) {
    const count = Math.max(0, Math.min(n, this.size));
    const out = new Array(count);
    for (let i = 0; i < count; i++) {
      const idx = (this.start + (this.size - count) + i) % this.capacity;
      out[i] = this.slots[idx];
    }
    return out;
  }

  /** Everything currently held, oldest → newest. */
  toArray() {
    return this.last(this.size);
  }

  /**
   * Find an item by predicate (used to flag a message as removed/restored
   * inside the buffer). O(size), and size is small by design (≤ capacity).
   */
  find(predicate) {
    for (let i = 0; i < this.size; i++) {
      const item = this.slots[(this.start + i) % this.capacity];
      if (predicate(item)) return item;
    }
    return undefined;
  }

  clear() {
    this.slots = new Array(this.capacity);
    this.start = 0;
    this.size = 0;
  }

  get isFull() {
    return this.size === this.capacity;
  }

  stats() {
    return {
      size: this.size,
      capacity: this.capacity,
      pushes: this.pushes,
      overwrites: this.overwrites,
      fillRatio: +(this.size / this.capacity).toFixed(4),
    };
  }
}

module.exports = RingBuffer;
