// rng.js — deterministic seeded randomness for Verano Bay.
// The whole city, its traffic colours and its ambient life derive from one
// seed, so every visit builds the same world and the headless tests can
// reproduce any scene exactly.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  // Float in [min, max).
  range(min, max) {
    return min + this.next() * (max - min);
  }
  // Integer in [min, max] inclusive.
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }
  chance(p) {
    return this.next() < p;
  }
  // Signed jitter around 0: [-amount, amount).
  jitter(amount) {
    return (this.next() * 2 - 1) * amount;
  }
}
