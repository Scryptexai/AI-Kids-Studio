// Timeline of "Tiga Jenderal yang Menyadap Rajanya": shots timed to the voice (stories/tiga-jenderal/voice/words.json,
// frame = word start x 30), the light of each shot and the camera grammar of the reference study: continuous slow
// push-ins, symmetric smootherstep glides 18-40 f, hard cuts on big reframes, 7-frame flip kicks on punch words.
import type { LightName } from "./lights";
import { V3, HALL, HOLE, THRONE, TOMB, EASEL, TABLE, TABLE_H, COURIER_DESK, PATIH_DESK, HEARTH, DESK_H, FORT, WALL, RACK_X } from "./layout";
export type { V3 } from "./layout";

export const FPS = 30;
export const TOTAL = 2430;
export const D0 = 0; // ground height (build.ts houses stand on it)

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;

// ---------------- shots ----------------
export type Light = LightName;
export type ShotDef = { id: number; a: number; b: number; light: Light; tau: (t: number) => number; sunAz?: number; sunEl?: number };
const S = (id: number, a: number, b: number, light: Light, sun: { sunAz?: number; sunEl?: number } = {}): ShotDef => ({ id, a, b, light, tau: (t) => t, ...sun });
/** shot ids by name, so cast.ts can say who is in which shot */
export const SH = {
  hook: 1, tomb: 2, crown: 3, embrace: 4, cheer: 5, purge: 6, exile: 7, doubt: 8, shield: 9, oath: 10, sister: 11, troops: 12,
  plot: 13, kitchen: 14, bribe: 15, copy: 16, hole: 17, patih: 18, write: 19, maid: 20, courier: 21, speech: 22, restless: 23,
  riders: 24, trap: 25, caught: 26, summon: 27, wall: 28, king: 29, arya: 30, black: 31,
} as const;
export const SHOTS: ShotDef[] = [
  S(1, 0, 139, "night"),          // hook: three generals with their ears on the meeting wall
  S(2, 139, 190, "golden"),       // Raja Surya's tomb and portrait
  S(3, 190, 279, "day"),          // coronation of Raja Baskara
  S(4, 279, 408, "day"),          // Baskara's arm round Pangeran Arya
  S(5, 408, 472, "day"),          // the loyalists cheer (the three generals among them)
  S(6, 472, 686, "day"),          // Surya's old court replaced one by one
  S(7, 686, 772, "day"),          // son embraced, his father's men walked out
  S(8, 772, 841, "night"),        // the generals at their table
  S(9, 841, 877, "day"),          // Arya as a shield in front of the king
  S(10, 877, 966, "golden", { sunAz: 40 }), // Wiratama's oath at the tomb
  S(11, 966, 1027, "day"),        // Sekar reads her exiled brother's letter
  S(12, 1027, 1073, "day"),       // Bayu's troops marched off under a new commander
  S(13, 1073, 1222, "night"),     // the plan: two questions
  S(14, 1222, 1295, "day"),       // Sekar's maid in the palace kitchen
  S(15, 1295, 1339, "night", { sunEl: 12 }),     // Bayu bribes the courier
  S(16, 1339, 1392, "night", { sunEl: 10 }),     // the courier copies a royal letter
  S(17, 1392, 1521, "night"),     // Wiratama finds the loose brick
  S(18, 1521, 1622, "day"),       // Patih Kalang notices the leaks
  S(19, 1622, 1789, "night"),     // the false order, three versions
  S(20, 1789, 1820, "night"),     // version 1: whispered to the maid
  S(21, 1820, 1845, "night", { sunEl: 12 }),     // version 2: handed to the courier
  S(22, 1845, 1867, "day"),       // version 3: said in the meeting hall
  S(23, 1867, 1939, "night"),     // Bayu can't wait
  S(24, 1939, 1996, "night"),     // riders out of the gate, north
  S(25, 1996, 2068, "night"),     // the patih's finger on "north"
  S(26, 2068, 2104, "night", { sunEl: 12 }),     // the courier, caught
  S(27, 2104, 2197, "golden", { sunAz: -60, sunEl: 10 }), // dawn: the generals summoned
  S(28, 2197, 2249, "golden", { sunAz: 165, sunEl: 11 }), // the wall with the hole, from inside (morning)
  S(29, 2249, 2306, "golden", { sunAz: 160, sunEl: 11 }),  // Raja Baskara waits
  S(30, 2306, 2414, "golden", { sunAz: 160, sunEl: 11 }),  // ...and beside him, Pangeran Arya
  S(31, 2414, TOTAL, "golden", { sunAz: 160, sunEl: 11 }), // black
];
/** crossfades (frames) at time-of-day changes; a white 4-frame flash after the hook */
export const XFADE: Record<number, number> = { 10: 8, 27: 10 };
export const FLASH_AT = 139;
/** fade to black at the end */
export const BLACK_AT = 2396, BLACK_FULL = 2414;

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

/** the loose brick: in the wall until Wiratama works it out (shot 17), gone after; the hook (a flash-forward) has it out */
export const brickOut = (f: number) => {
  const id = shotAt(f).id;
  if (id === SH.hook) return 1;
  if (id < SH.hole) return 0;
  if (id > SH.hole) return 1;
  return smooth((f - 1452) / 26);
};

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mixCam = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mixCam(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const T = (f: number) => f / FPS;
/** push-in factor since f0: the subject grows ~rate per frame; `punch` raises it (8 f soft edges) for the first n frames */
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 35) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });
/** a framing that creeps in from frame f0 at `rate` (%/f), optional punch on the first n frames */
const H = (pos: V3, look: V3, fov: number, f0: number, rate = 0.0022, roll = 0, punch = 0, n = 35) =>
  (f: number) => dolly(pos, look, pushK(f, f0, rate, punch, n), { fov, roll });
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** horizontal half-width of the 9:16 frame per metre of distance, for a vertical fov */
const HALFW = (fov: number) => Math.tan((fov * Math.PI) / 360) * (9 / 16);
/** a lens that frames everyone at pts (feet points) side by side and centred, looking along dir (x, z), with `margin`
 *  metres of air beyond the outer shoulders (cards are ~0.3 m half-wide); camera `h` and look `lookH` above their feet */
const group = (pts: V3[], dir: [number, number], fov = 40, margin = 0.45, h = 1.6, lookH = 1.2) => {
  const n = pts.length, c = pts.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n, a[2] + p[2] / n] as V3, [0, 0, 0] as V3);
  const L = Math.hypot(dir[0], dir[1]), fx = dir[0] / L, fz = dir[1] / L, rx = -fz, rz = fx;
  const spread = Math.max(...pts.map((p) => Math.abs((p[0] - c[0]) * rx + (p[2] - c[2]) * rz)));
  const d = Math.max(2.2, (spread + 0.3 + margin) / HALFW(fov));
  return { pos: [c[0] - fx * d, c[1] + h, c[2] - fz * d] as V3, look: [c[0], c[1] + lookH, c[2]] as V3 };
};
const G = (pts: V3[], dir: [number, number], fov: number, f0: number, rate = 0.0008, roll = 0, margin = 0.45, h = 1.6, lookH = 1.2) => {
  const g = group(pts, dir, fov, margin, h, lookH);
  return H(g.pos, g.look, fov, f0, rate, roll);
};
const HT = HALL.top;

// where people stand (cast.ts reads the same points)
export const AT = {
  // hook / alley: profiles with an ear on the wall (x along the wall, just off its alley face)
  sekarWall: [-0.25, 0, 26.42] as V3, wiraWall: [2.35, 0, 26.42] as V3, bayuWall: [1.05, 0, 26.42] as V3,
  baskaraSteps: [0.4, HT, 13.35] as V3, aryaSteps: [-0.4, HT, 13.45] as V3,
  baskaraThrone: [THRONE[0], THRONE[1] + 0.52, THRONE[2] - 0.15] as V3,
  aryaThrone: [-1.3, HT, 23.75] as V3, kalangThrone: [1.3, HT, 23.75] as V3,
  wiraTomb: [TOMB[0] + 2.0, 0, TOMB[2] + 0.6] as V3, sekarTree: [-13.6, 0, -4.4] as V3, bayuRacks: [RACK_X - 1.4, 0, 6.4] as V3,
  maid: [HEARTH[0] + 0.91, 0, HEARTH[2] - 0.55] as V3, sekarKitchen: [HEARTH[0] + 2.1, 0, HEARTH[2] - 0.8] as V3,
  kalangKitchen: [HEARTH[0] + 2.1, 0, HEARTH[2] - 0.8] as V3,
  courier: [COURIER_DESK[0], 0, COURIER_DESK[2] + 0.75] as V3, bayuDesk: [COURIER_DESK[0] - 1.25, 0, COURIER_DESK[2] - 0.2] as V3,
  kalangDesk: [PATIH_DESK[0] - 0.75, 0, PATIH_DESK[2]] as V3,
  tableW: [TABLE[0], 0, TABLE[2] + 1.0] as V3, tableS: [TABLE[0] + 0.7, 0, TABLE[2] + 0.55] as V3, tableB: [TABLE[0] - 0.7, 0, TABLE[2] + 0.55] as V3,
  // the hall seen from the front: three courtiers far enough apart that a medium shot of one leaves the others out
  court: [[1.75, HT, 17.1], [0, HT, 17.0], [-1.75, HT, 17.1]] as V3[],
  baskaraExile: [0.1, HT, 13.7] as V3, aryaExile: [0.85, HT, 13.8] as V3,
  wiraHole: [1.6, 0, 26.42] as V3,
};

const KICKS: [number, number][] = [[863 / FPS, 1.1], [1606 / FPS, 0.8], [1979 / FPS, 0.7], [2229 / FPS, 0.9], [2094 / FPS, 0.7]];

const CAMS: Record<number, Key[]> = {
  // 1 hook: looking down the alley (the wall on screen right), on Wiratama's ear, pulling out to all three
  1: [
    { f: 0, s: H([7.9, 1.95, 27.8], [0.8, 1.3, 26.5], 42, 0, 0.0012, -0.02) },
  ],
  // 2 the tomb, portrait on its easel; creep in
  2: [{ f: 139, s: H([TOMB[0] + 5.2, 1.45, TOMB[2] - 3.6], [EASEL[0] - 0.6, 0.95, EASEL[2] + 0.2], 40, 139, 0.0028) }],
  // 3 coronation: high over the crowd to the pendopo, glide down to the steps
  3: [
    { f: 190, s: H([13, 6.2, -6], [0, 2.4, 13], 44, 190, 0.0015) },
    { f: 236, dur: 36, s: H([5.5, 2.6, 4.2], [0, 1.7, 13.3], 40, 236, 0.0022) },
  ],
  // 4 MS of the king and the prince on the steps; closer on "mengangkat", roll on "tangan kanannya"
  4: [
    { f: 279, s: G([AT.baskaraSteps, AT.aryaSteps], [0, 1], 42, 279, 0.0008, 0, 0.6) },
    { f: 282, dur: 24, s: G([AT.baskaraSteps, AT.aryaSteps], [0, 1], 40, 282, 0.0008, 0.03, 0.5) },
    { f: 378, dur: 22, s: G([AT.baskaraSteps, AT.aryaSteps], [0.05, 1], 40, 378, 0.0006, -0.02, 0.45) },
  ],
  // 5 from the steps down over the cheering crowd (the generals in the front row)
  5: [{ f: 408, s: H([0.4, 3.1, 13.2], [-0.2, 1.0, 3.0], 44, 408, 0.0012, 0.03) }],
  // 6 inside the hall, looking east at the row of courtiers; creeping truck along them
  // 6 the three courtiers: all three centred, then the lens visits each one as he is swapped ("Bendahara. Kepala
  // pengawal. Komandan pasukan."), then pulls back to the three new men
  6: [
    { f: 472, s: G([AT.court[0]], [0, 1], 40, 472, 0.0008, 0, 0.35) },
    { f: 602, dur: 18, s: G([AT.court[1]], [0, 1], 40, 602, 0.0008, 0, 0.35) },
    { f: 629, dur: 18, s: G([AT.court[2]], [0, 1], 40, 629, 0.0008, 0.03, 0.35) },
  ],
  // 7 from the top of the steps toward the gate: the embrace in the foreground, the old men walked out behind
  7: [{ f: 686, s: H([0.48, 1.9, 17.7], [0.48, 1.1, -10], 44, 686, 0.0002) }],
  // 8 night: the generals at their table
  8: [{ f: 772, s: H([TABLE[0], 2.1, TABLE[2] - 5.4], [TABLE[0], 1.15, TABLE[2] + 0.6], 44, 772, 0.001) }],
  // 9 the prince in front of the king; punch on "tameng"
  9: [{ f: 841, s: H([0.2, 1.6, 19.3], [0.15, 1.5, 23.0], 40, 841, 0.002, 0, 0.007, 30) }],
  // 10 golden: Wiratama at the tomb, hand on his heart
  10: [{ f: 873, s: H([TOMB[0] + 5.0, 1.5, TOMB[2] - 2.6], [TOMB[0] + 1.6, 1.25, TOMB[2] + 0.4], 40, 873, 0.0022) }],
  11: [{ f: 966, s: H([-12.0, 1.6, -7.0], [-13.6, 1.45, -4.4], 40, 966, 0.0028, 0.03) }],
  12: [{ f: 1027, s: G([AT.bayuRacks], [0.77, 0.64], 40, 1027, 0.0015, -0.03, 0.9) }],
  // 13 night: round the table; closer on "nasib pangeran", then on Bayu for "disingkirkan berikutnya"
  13: [
    { f: 1073, s: H([TABLE[0] - 0.9, 2.6, TABLE[2] - 5.2], [TABLE[0], 1.0, TABLE[2] + 0.6], 44, 1073, 0.001) },
    { f: 1120, cut: true, s: H([AT.tableW[0], 1.75, AT.tableW[2] - 2.2], [AT.tableW[0], 1.5, AT.tableW[2]], 34, 1120, 0.0012) },
    { f: 1170, cut: true, s: H([TABLE[0], 2.0, TABLE[2] - 5.3], [TABLE[0], 1.2, TABLE[2] + 0.6], 42, 1170, 0.0004, 0.025) },
  ],
  14: [{ f: 1222, s: G([AT.maid, AT.sekarKitchen], [0.15, 1], 40, 1222, 0.0008) }],
  15: [{ f: 1295, s: G([AT.courier, AT.bayuDesk], [-0.45, 1], 40, 1295, 0.0008) }],
  // 16 over the courier's desk: original and copy side by side, the candle
  16: [{ f: 1339, s: H([COURIER_DESK[0] - 0.2, 2.15, COURIER_DESK[2] - 1.45], [COURIER_DESK[0], DESK_H + 0.25, COURIER_DESK[2] + 0.15], 40, 1339, 0.003) }],
  // 17 night alley: Wiratama at the wall, push to the hole on "celah"
  17: [
    { f: 1392, s: H([5.9, 1.75, 29.25], [1.9, 1.3, 26.2], 40, 1392, 0.0012) },
    { f: 1462, cut: true, s: H([3.0, 1.55, 27.15], [HOLE[0], HOLE[1], HOLE[2]], 34, 1462, 0.003) },
  ],
  // 18 day: the patih beside the throne; punch on "bocor"
  18: [{ f: 1521, s: (f: number) => { const g = group([AT.baskaraThrone, AT.kalangThrone], [0, 1], 42, 0.5, 1.15, 0.9); return H(g.pos, g.look, 42, 1521, 0.0008, 0, 0.004, 30)(f); } }],
  // 19 night: the patih writing; down onto the map for "utara, selatan, timur"
  19: [
    { f: 1622, s: H([PATIH_DESK[0] + 3.0, 1.65, PATIH_DESK[2] - 1.2], [PATIH_DESK[0] - 0.4, 1.2, PATIH_DESK[2]], 40, 1622, 0.0022) },
    { f: 1700, cut: true, s: H([PATIH_DESK[0] + 0.9, 2.25, PATIH_DESK[2] - 0.1], [PATIH_DESK[0] - 0.05, DESK_H, PATIH_DESK[2] - 0.05], 40, 1700, 0.0018) },
  ],
  20: [{ f: 1789, s: G([AT.maid, AT.kalangKitchen], [0.15, 1], 38, 1789, 0.001) }],
  21: [{ f: 1820, s: G([AT.courier, AT.bayuDesk], [-0.45, 1], 38, 1820, 0.001) }],
  22: [{ f: 1845, s: H([0, 1.75, 11.8], [0, 1.4, 17.2], 42, 1845, 0.001) }],
  // 23 night: Bayu paces by the empty racks
  23: [{ f: 1867, s: H([14.0, 1.7, 7.0], [RACK_X - 1.2, 1.2, 7.3], 42, 1867, 0.001) }],
  // 24 riders: side-on outside the gate (they gallop screen right), then behind them up the road to the fortress
  24: [
    { f: 1939, s: H([9.5, 1.8, WALL.zS - 7], [0, 1.6, WALL.zS - 7], 44, 1939, 0.0015) },
    { f: 1970, cut: true, s: H([0.2, 1.9, WALL.zS + 3.5], [FORT[0], 6, FORT[2]], 34, 1970, 0.0015) }, // through the gate
  ],
  // 25 night: the map under the patih's hand
  25: [{ f: 1996, s: H([PATIH_DESK[0] + 1.6, 2.1, PATIH_DESK[2] - 0.6], [PATIH_DESK[0] - 0.3, 1.0, PATIH_DESK[2]], 40, 1996, 0.0022) }],
  26: [{ f: 2068, s: H([COURIER_DESK[0] - 1.6, 1.6, COURIER_DESK[2] - 1.9], [COURIER_DESK[0], 1.45, COURIER_DESK[2] + 0.75], 36, 2068, 0.0025, -0.035) }],
  // 27 dawn: the generals cross the plaza toward the hall, guards behind
  27: [{ f: 2098, s: H([0.2, 1.8, 11.6], [0, 1.25, 0], 40, 2098, 0.0008) }],
  // 28 inside the hall: the generals in front of the wall, push to the hole on "berlubang"
  28: [
    { f: 2197, s: H([0.7, 1.7, 21.0], [2.0, 1.45, 25.6], 42, 2197, 0.0018) },
    { f: 2215, dur: 26, s: H([2.05, 1.5, 23.6], [HOLE[0], HOLE[1], HALL.wallZ], 36, 2215, 0.003) },
  ],
  // 29 low angle on the seated king, creeping up toward him
  29: [{ f: 2249, s: H([0.15, 0.95, 20.4], add(THRONE, [0, 1.25, 0]), 40, 2249, 0.0028, 0.025) }],
  // 30 truck left from the king to the prince, then a slow push into his face on "Pangeran Arya"
  30: [
    { f: 2306, s: H([0.15, 0.95, 20.1], add(THRONE, [0, 1.25, 0]), 40, 2306, 0.0028, 0.025) },
    { f: 2318, cut: true, s: H([-1.25, 1.6, 20.9], [-1.3, 1.6, 23.75], 38, 2318, 0.0008) },
    { f: 2350, dur: 40, s: H([-1.27, 1.75, 21.35], [-1.3, 1.85, 23.75], 34, 2350, 0.0015) },
  ],
  31: [{ f: 2414, s: H([-1.27, 1.75, 21.45], [-1.3, 1.85, 23.75], 34, 2414, 0.001) }],
};

export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of KICKS) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(T(f));
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};

// ---------------- lens ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
const eyes = (p: V3): (() => V3) => () => [p[0], p[1] + 1.45, p[2]];
export const DOF: Dof[] = [
  { f: 0, cInf: 14, focus: eyes(AT.wiraWall) },
  { f: 52, dur: 40, cInf: 10, focus: eyes(AT.wiraWall) },
  { f: 139, cInf: 8 }, // tomb: focus = look (the portrait)
  { f: 190, cInf: 0 }, // coronation wide
  { f: 279, cInf: 12, focus: eyes(AT.baskaraSteps) },
  { f: 408, cInf: 6 }, // crowd
  { f: 472, cInf: 11 },
  { f: 686, cInf: 10, focus: eyes(AT.baskaraSteps) }, // the embrace in focus...
  { f: 735, dur: 18, cInf: 10, focus: () => [0.6, 1.4, -8] }, // ...rack to the men walked out
  { f: 772, cInf: 12, focus: eyes(AT.tableW) },
  { f: 841, cInf: 12, focus: eyes([0.1, HT, 22.7]) },
  { f: 873, cInf: 9, focus: eyes(AT.wiraTomb) },
  { f: 966, cInf: 13, focus: eyes(AT.sekarTree) },
  { f: 1027, cInf: 10, focus: eyes(AT.bayuRacks) },
  { f: 1073, cInf: 6 },
  { f: 1120, dur: 26, cInf: 12, focus: eyes(AT.tableW) },
  { f: 1170, cInf: 12, focus: eyes(AT.tableB) },
  { f: 1222, cInf: 10 },
  { f: 1295, cInf: 11 },
  { f: 1339, cInf: 13 }, // desk insert, focus = look
  { f: 1392, cInf: 8, focus: eyes(AT.wiraHole) },
  { f: 1462, dur: 30, cInf: 14, focus: () => [HOLE[0], HOLE[1], HALL.wallZ1] },
  { f: 1521, cInf: 12, focus: eyes(AT.kalangThrone) },
  { f: 1622, cInf: 11, focus: eyes(AT.kalangDesk) },
  { f: 1700, cInf: 12 },
  { f: 1789, cInf: 12 },
  { f: 1845, cInf: 8 },
  { f: 1867, cInf: 9 },
  { f: 1939, cInf: 0 },
  { f: 1996, cInf: 12 },
  { f: 2068, cInf: 13, focus: eyes(AT.courier) },
  { f: 2098, cInf: 6 },
  { f: 2197, cInf: 6 },
  { f: 2215, dur: 26, cInf: 13 },
  { f: 2249, cInf: 12, focus: eyes(AT.baskaraThrone) },
  { f: 2318, cInf: 14, focus: eyes(AT.aryaThrone) },
  { f: 2350, dur: 40, cInf: 16, focus: () => [AT.aryaThrone[0], AT.aryaThrone[1] + 1.6, AT.aryaThrone[2]] },
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};

/** near framing objects (Kenney GLB names, see build.ts prop()); shown only inside their own shot */
export type Fg = { a: number; b: number; kit: string; pos: V3; s?: number; yaw?: number };
export const FOREGROUND: Fg[] = [
  { a: 966, b: 1027, kit: "plant_bushDetailed", pos: [-12.7, 0, -5.6], s: 0.9, yaw: 0.3 },
  { a: 2098, b: 2197, kit: "plant_bushLarge", pos: [-1.9, 0, 7.4], s: 1.0, yaw: 0.6 },
];
