/**
 * Deterministic pseudo-random number generator (sfc32) with string seeding.
 * Every procedural system in the game derives from one of these so that
 * a given seed reproduces the same initial world.
 */
export class RNG {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string | number) {
    const s = typeof seed === 'number' ? String(seed) : seed;
    const h = RNG.hash(s);
    this.a = h[0];
    this.b = h[1];
    this.c = h[2];
    this.d = h[3];
    for (let i = 0; i < 12; i++) this.next();
  }

  /** cyrb128 string hash → four 32-bit seeds */
  static hash(str: string): [number, number, number, number] {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  }

  /** Uniform float in [0, 1) */
  next(): number {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  float(min = 0, max = 1): number { return min + (max - min) * this.next(); }
  int(min: number, max: number): number { return Math.floor(this.float(min, max + 1)); }
  bool(p = 0.5): boolean { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  pickWeighted<T>(arr: readonly T[], weight: (t: T) => number): T {
    let total = 0;
    for (const t of arr) total += Math.max(0, weight(t));
    if (total <= 0) return this.pick(arr);
    let r = this.next() * total;
    for (const t of arr) {
      r -= Math.max(0, weight(t));
      if (r <= 0) return t;
    }
    return arr[arr.length - 1];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  sample<T>(arr: readonly T[], n: number): T[] {
    const copy = arr.slice();
    this.shuffle(copy);
    return copy.slice(0, n);
  }
  /** Approximately normal distribution using Box-Muller */
  gauss(mean = 0, sd = 1): number {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return mean + sd * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
  /** Derive a child generator (for independent subsystems) */
  fork(label: string): RNG { return new RNG(`${label}:${Math.floor(this.next() * 1e9)}`); }
  /** Snapshot state for save files */
  state(): [number, number, number, number] { return [this.a, this.b, this.c, this.d]; }
  static fromState(s: [number, number, number, number]): RNG {
    const r = new RNG('x');
    r.a = s[0]; r.b = s[1]; r.c = s[2]; r.d = s[3];
    return r;
  }
}

/** Simple 2D value noise + fBm for terrain generation (deterministic from seed). */
export class Noise2D {
  private perm: Uint8Array;
  constructor(seed: string) {
    const rng = new RNG(seed + ':noise');
    const p = new Uint8Array(512);
    const base = Array.from({ length: 256 }, (_, i) => i);
    rng.shuffle(base);
    for (let i = 0; i < 512; i++) p[i] = base[i & 255];
    this.perm = p;
  }
  private grad(hash: number, x: number, y: number): number {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
  }
  private fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
  private lerp(a: number, b: number, t: number): number { return a + t * (b - a); }
  /** Perlin-style gradient noise in roughly [-1, 1] */
  noise(x: number, y: number): number {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = this.fade(x), v = this.fade(y);
    const p = this.perm;
    const A = p[X] + Y, B = p[X + 1] + Y;
    return this.lerp(
      this.lerp(this.grad(p[A], x, y), this.grad(p[B], x - 1, y), u),
      this.lerp(this.grad(p[A + 1], x, y - 1), this.grad(p[B + 1], x - 1, y - 1), u),
      v,
    ) * 0.5;
  }
  fbm(x: number, y: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
