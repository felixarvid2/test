'use strict';
// Seedad, deterministisk slumpgenerator (mulberry32). Samma seed ger samma sekvens.
//   const r = RNG(1234);  r.next(); r.int(1, 6); r.pick(arr); r.chance(0.3);
//   r.shuffle(arr); r.weighted(arr, x => x.vikt); r.fork('rum')  (egen deterministisk ström)
window.RNG = function RNG(seed) {
  if (seed === undefined || seed === null) seed = RNG.randomSeed();
  const key = String(seed);
  const s0 = (typeof seed === 'number' && Number.isInteger(seed)) ? (seed >>> 0) : RNG.hash(key);
  // blanda fröet så att angränsande seeds (1, 2, 3 ...) inte ger släktskap
  let a = RNG.hash('rng:' + s0);
  const self = {
    seed,
    next() { // flyttal i [0,1)
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(lo, hi) { return lo + Math.floor(self.next() * (hi - lo + 1)); }, // inklusive båda
    range(lo, hi) { return lo + self.next() * (hi - lo); },
    pick(arr) { return arr[Math.floor(self.next() * arr.length)]; },
    chance(p) { return self.next() < p; },
    shuffle(arr) { // Fisher–Yates, på plats
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(self.next() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
    weighted(arr, weightFn) { // väljer ett element proportionellt mot vikten; null om alla vikter är 0
      const w = weightFn || (x => (typeof x === 'number' ? x : 1));
      let total = 0;
      const ws = new Array(arr.length);
      for (let i = 0; i < arr.length; i++) { ws[i] = Math.max(0, w(arr[i], i)); total += ws[i]; }
      if (!(total > 0)) return null;
      let r = self.next() * total;
      for (let i = 0; i < arr.length; i++) { r -= ws[i]; if (r < 0) return arr[i]; }
      for (let i = arr.length - 1; i >= 0; i--) if (ws[i] > 0) return arr[i];
      return null;
    },
    fork(tag) { return RNG(RNG.hash(key + '|' + tag)); }, // oberoende av hur mycket som dragits ur den här
  };
  return self;
};

// FNV-1a + avalanche -> osignerat 32-bitars heltal
RNG.hash = function (str) {
  str = String(str);
  let h = 0x811C9DC5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16;
  return h >>> 0;
};

RNG.randomSeed = function () { // icke-deterministiskt frö för nya spel
  const c = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] : 0;
  return ((c ^ Math.floor(Math.random() * 4294967296) ^ Date.now()) >>> 0);
};
