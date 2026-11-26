// Timeline of "Stopped by Thin Air". Shots are anchored to WORDS of the narration (stories/air-brake/voice/words.json):
// B(beat, word) finds a word inside one script line, so re-making words.json from the real recording re-times the film.
// Camera grammar follows references/motion-camera.md and the user's rule: every phrase's picture lands ON its word, one
// flying take per location (a `rail` of framings pinned to words), dips to black only where the place changes.
import type { LightName } from "./lights";
import WORDS from "../../../stories/air-brake/voice/words.json";
import { V3, SetName, at, O, RAIL_Y, LOCO, BOX, COACH, PLAT, PORTAL_E, CROSS_X, STOP_NOSE, PARK_NOSE, WAGON, BENCH, SHOP, SHOP_TRACK_Z, ODESK, DESK_H,
  offsetsOf, FREIGHT, TEST, SHOPTRAIN } from "./layout";
export type { V3 } from "./layout";

export const FPS = 30;
export const D0 = 0;
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;

// ---------------- words ----------------
type Word = { w: string; s: number; e: number; beat: number };
const words = WORDS as Word[];
const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
const find = (beat: number, text: string, k: number) => {
  const n = norm(text);
  let c = 0;
  for (const w of words) if (w.beat === beat && norm(w.w) === n && ++c === k) return w;
  throw new Error(`story.ts: word "${text}" #${k} not in line ${beat} of words.json`);
};
/** frame where the k-th occurrence of `text` inside script line `beat` begins / ends */
export const B = (beat: number, text: string, k = 1) => Math.round(find(beat, text, k).s * FPS);
export const BE = (beat: number, text: string, k = 1) => Math.round(find(beat, text, k).e * FPS);
/** compatibility with the template: the k-th occurrence anywhere */
export const W = (text: string, k = 1) => {
  const n = norm(text);
  let c = 0;
  for (const w of words) if (norm(w.w) === n && ++c === k) return Math.round(w.s * FPS);
  throw new Error(`story.ts: word "${text}" #${k} not in words.json`);
};
export const LEADF = 2;
/** mouth opening 0..1 while line `beat` is being spoken (about one flap per syllable, 0.17 s) */
export const talkAt = (beat: number, f: number) => {
  const t = f / FPS;
  for (const w of words) if (w.beat === beat && t >= w.s && t < w.e) { const n = Math.max(1, Math.round((w.e - w.s) / 0.17)); return Math.abs(Math.sin(Math.PI * ((t - w.s) / (w.e - w.s)) * n)); }
  return 0;
};
/** frames where each word of line `beat` starts (the talk drive keys head nods and tilts on them) */
export const wordFrames = (beat: number) => words.filter((w) => w.beat === beat).map((w) => Math.round(w.s * FPS));
export const VOICE_END = Math.round(words[words.length - 1].e * FPS);
/** cut on the hiss: no fade, so the short loops back to the hook */
export const TOTAL = VOICE_END + 10;
const L = (beat: number, text: string, k = 1) => B(beat, text, k) - LEADF;

// ---------------- story events (frames) ----------------
/** the hook: the first brakeman leaps the gap (lands on "men"), the whistle on "whistles", the second leap on "leap",
 *  cranking from "cranking", the slip on "ice", the third man's leap on "Not" and his cap flies off on "land" */
export const LEAP1 = L(1, "men") - 8, WHISTLE = L(2, "engineer") + 4, LEAP2 = L(2, "car") - 6, CRANK = L(2, "cranking"), SLIP = L(3, "ice");
export const LEAP3 = L(3, "Not") - 4, CAPFLY = L(3, "of");
/** George blows down the hose on "air" */
export const BLOW = L(5, "air"), HOSE_UP = L(5, "stop");
/** Vanderbilt: his whiskers flare on "wind", he points at the door on "fools" */
export const FLARE = L(7, "Stop"), POINT = L(7, "fools");
/** the NO letters pin up on "Railroad", "railroad", "says", "no" */
export const LETTERS = [L(8, "Railroad"), L(8, "after"), L(8, "railroad", 2), L(8, "says")];
/** the station: the pump on "pump", the lever on "lever", every shoe clamps on "once" */
export const PUMP = L(10, "steam"), LEVER1 = L(11, "lever"), CLAMP = L(11, "at");
/** the crossing: the horse plants its hooves on "stop", the train bursts out on "Out", Tate's eyes on "sees", the lever
 *  on "pulls", the stop on "stops", the bosses get up on "pick" */
export const PLANT = L(12, "stop"), BURST = L(13, "Out"), SEES = L(13, "engineer"), PULL = L(15, "pulls"), STOPF = L(16, "stops") + 6, PICK = L(17, "pick");
/** 1872: the valve flips on "flips", the needle and the shoe on "holds" */
export const FLIP = L(18, "flips"), HOLDS = L(18, "holds");
/** the hose parts on "Cut", the train is stopped by "itself" */
export const CUT = L(19, "Cut"), HALT = BE(19, "itself") + 4;
/** the callback: smug on "half", he blows at the model on "wind" */
export const SMUG = L(20, "half"), PUFF = L(20, "wind");

// ---------------- shots ----------------
export type Light = LightName;
export type ShotDef = { id: number; a: number; b: number; light: Light; tau: (t: number) => number; sunAz?: number; sunEl?: number; set: SetName };
const PLAN: [string, number, Light, SetName, { sunAz?: number; sunEl?: number }?][] = [
  ["hook", 0, "night", "line"],
  ["pitt", B(4, "Out") - 4, "day", "pitt", { sunAz: 140, sunEl: 40 }],
  ["george", B(5, "George") - 4, "day", "shop", { sunAz: 150, sunEl: 35 }],
  ["vandy", B(6, "He") - 4, "day", "office", { sunAz: 150, sunEl: 30 }],
  ["letters", B(8, "Railroad") - 4, "day", "shop", { sunAz: 150, sunEl: 35 }],
  ["station", B(9, "One") - 4, "day", "pitt", { sunAz: 150, sunEl: 42 }],
  ["wagon", B(12, "Meanwhile") - 4, "day", "pitt", { sunAz: 120, sunEl: 38 }],
  ["run", B(13, "Out") - 2, "day", "pitt", { sunAz: 140, sunEl: 40 }],
  ["bosses", B(17, "The") - 3, "day", "pitt", { sunAz: 150, sunEl: 40 }],
  ["flip", B(18, "Four") - 4, "day", "shop", { sunAz: 150, sunEl: 35 }],
  ["cut", B(19, "Cut") - 4, "day", "line", { sunAz: 140, sunEl: 30 }],
  ["half", B(20, "Vanderbilt") - 4, "golden", "office", { sunAz: 160, sunEl: 12 }],
  ["windout", B(21, "You") - 4, "golden", "line", { sunAz: 150, sunEl: 10 }],
];
export const SH = Object.fromEntries(PLAN.map(([n], i) => [n, i + 1])) as Record<string, number>;
export const SHOTS: ShotDef[] = PLAN.map(([, a, light, set, sun], i) => ({ id: i + 1, a, b: i + 1 < PLAN.length ? PLAN[i + 1][1] : TOTAL, light, set, tau: (t: number) => t, ...(sun ?? {}) }));
/** a white flash on the lever pull (the brakes bite) */
export const FLASH_AT = PULL + 1;
export const BLACK_AT = TOTAL + 100, BLACK_FULL = TOTAL + 120;
/** colour script: the 1868 hook at night, warm interiors, the last two lines a golden lift */
export const FLASHBACK: number[] = [], GOLD_FROM = SH.half;
/** the run and the bosses are hard cuts inside the Pittsburgh set (same place, big reframes) */
export const NODIP = [SH.run, SH.bosses];
/** every change of place is a cross dissolve of 12 f (the user asked for no black between sets) */
export const XFADE: Record<number, number> = Object.fromEntries(SHOTS.filter((s) => s.id > 1 && !NODIP.includes(s.id)).map((s) => [s.id, 12]));
export const blackoutAt = (_f: number) => 0;
/** light pool per shot (look_gap.md fix 1): world centre [x, y, z] + radius (m). The subject sits in it, the frame edges fall to ~0.55 */
export const POOL: Record<number, [number, number, number, number]> = {
  [SH.vandy]: [ODESK[0], 1.2, ODESK[2] + 0.9, 2.6], [SH.half]: [ODESK[0], 1.2, ODESK[2] + 0.6, 2.4],
};
export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};
const S0 = (n: string) => SHOTS[SH[n] - 1].a;
const S1 = (n: string) => SHOTS[SH[n] - 1].b;

// ---------------- trains (x of the nose, world) ----------------
export const OFF = { freight: offsetsOf(FREIGHT), test: offsetsOf(TEST), shop: offsetsOf(SHOPTRAIN) };
const T = (f: number) => f / FPS;
/** the night freight of the hook (7 m/s) and the 1872 day train (8 m/s, braking from "Cut", stopped by "itself") */
export const freightX = (id: number, f: number) => {
  if (id === SH.hook) return O.line[0] - 40 + 7 * T(f);
  const a = S0("cut"), v = 8, tb = (HALT - CUT) / FPS, x0 = O.line[0] + 30;
  const tc = (Math.min(f, CUT) - a) / FPS, u = clamp01((f - CUT) / (HALT - CUT));
  return x0 + v * tc + v * tb * (u - (u * u) / 2); // uniform braking: v(1 - u)
};
export const freightV = (id: number, f: number) => (freightX(id, f + 0.5) - freightX(id, f - 0.5)) * FPS;
/** the test train: parked at the platform; on the run it leaves the east portal on "Out", brakes on "pulls" and stops
 *  four feet from the wagon on "stops" */
export const testX = (id: number, f: number) => {
  if (id !== SH.wagon && id !== SH.run && id !== SH.bosses) return O.pitt[0] + PARK_NOSE;
  const D = STOP_NOSE - PORTAL_E, tc = (PULL - BURST) / FPS, tb = (STOPF - PULL) / FPS, v = D / (tc + tb / 2);
  const x0 = O.pitt[0] + PORTAL_E, tt = (Math.min(f, PULL) - BURST) / FPS, u = clamp01((f - PULL) / (STOPF - PULL));
  return x0 + v * tt + v * tb * (u - (u * u) / 2);
};
export const testV = (f: number) => (testX(SH.run, f + 0.5) - testX(SH.run, f - 0.5)) * FPS;
/** the yard train behind the workshop window (4 m/s) */
export const shopTrainX = (f: number) => O.shop[0] + 2 + 2.3 * T(f - S0("george"));
/** brake shoes: 0 off .. 1 on the treads */
export const brakeAt = (id: number, f: number) => {
  if (id === SH.hook) return f >= CRANK ? 0.6 : 0;
  if (id === SH.station) return smooth((f - CLAMP) / 3);
  if (id === SH.run || id === SH.bosses) return smooth((f - PULL) / 3);
  if (id === SH.cut) return smooth((f - CUT - 3) / 3);
  if (id === SH.windout) return 1;
  return 0;
};

// ---------------- marks ----------------
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const P = (s: SetName) => (x: number, y: number, z: number): V3 => at(s, x, y, z);
const ln = P("line"), pt = P("pitt"), sp = P("shop"), of = P("office");
/** roof-walk top of a boxcar, y (world) */
export const ROOF_Y = RAIL_Y + BOX.floor + BOX.h + 0.17;
/** the coach floor inside (world y) and the cab floor */
export const COACH_FLOOR = RAIL_Y + COACH.floor + 0.1, CAB_FLOOR = RAIL_Y + 1.16;
export const AT = {
  // the hook: brakemen in the freight's frame (x relative to the nose)
  boxC: OFF.freight.slice(2), // boxcar centres
  // the workshop: George before the bench, the letters on the wall left of the window, the rig, the gauge
  george: sp(-0.5, 0, BENCH[2] - O.shop[2] + 1.05),
  georgeFlip: sp(1.2, 0, BENCH[2] - O.shop[2] + 1.0),
  letters: [sp(-2.45, 2.25, SHOP.z0 + 0.03), sp(-1.8, 2.15, SHOP.z0 + 0.03), sp(-2.4, 1.45, SHOP.z0 + 0.03), sp(-1.75, 1.38, SHOP.z0 + 0.03)] as V3[],
  rig: add(BENCH, [1.85, 0.42, 0]), gauge: sp(3.15, 1.85, SHOP.z0 + 0.03),
  // the office: Vanderbilt behind the desk, George before it (screen left)
  vandy: of(0.2, 0, ODESK[2] - O.office[2] - 0.95),
  georgeOffice: of(-0.55, 0, ODESK[2] - O.office[2] + 1.05),
  coins: of(-0.55, DESK_H + 0.01, ODESK[2] - O.office[2] + 0.25),
  model: of(0.55, DESK_H + 0.12, ODESK[2] - O.office[2] + 0.15),
  // the station: George by the engine, the bosses walk to the first coach
  georgeStation: pt(-17.6, PLAT.y, 4.0),
  bossesFrom: [pt(-10.5, PLAT.y, 5.6), pt(-9.4, PLAT.y, 6.6), pt(-12.0, PLAT.y, 6.8), pt(-11.0, PLAT.y, 7.6)] as V3[],
  bossesTo: [pt(-20.2, PLAT.y, 4.0), pt(-21.4, PLAT.y, 5.2), pt(-22.6, PLAT.y, 4.0), pt(-23.8, PLAT.y, 5.2)] as V3[],
  // the crossing: the teamster on the wagon seat, the horse in the shafts (both toward -z)
  teamster: pt(CROSS_X, 1.85, WAGON.z + WAGON.len / 2 - 0.12),
  horse: pt(CROSS_X, 0, WAGON.z + WAGON.len / 2 + 0.9),
};
/** a point on a train: car `i` of `off`, local (x, y, z) from that car's origin, the train's nose at `nose` */
export const onTrain = (off: number[], i: number, nose: number, x: number, y: number, z: number, set: SetName = "line"): V3 => [nose + off[i] + x, y, O[set][2] + z];
/** Tate in the cab (local to the loco), facing +x, beside the lever */
export const TATE_LOCAL: V3 = [-2.75, CAB_FLOOR, 0.55];
/** the bosses inside the first coach (local to it): on the floor after the stop, George on a seat */
export const BOSSES_IN: V3[] = [[-3.0, 0, 0.45], [-1.8, 0, 0.95], [-0.6, 0, 0.45], [0.6, 0, 0.95]];
export const GEORGE_IN: V3 = [-1.2, 0, -0.65];

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
const R = (deg: number) => (deg * Math.PI) / 180;
/** a camera rail: framings pinned to frames, passed through with continuous velocity (non-uniform Catmull-Rom in
 *  time), so the lens never stops between phrases; `ease` = the lens settles on that key */
type RK = { f: number; pos: V3; look: V3; fov?: number; roll?: number; ease?: boolean };
const rail = (ks: RK[]) => (f: number): Shot => {
  const n = ks.length, val = (k: RK) => [...k.pos, ...k.look, k.fov ?? 40, k.roll ?? 0];
  const out = (v: number[]): Shot => ({ pos: v.slice(0, 3) as V3, look: v.slice(3, 6) as V3, fov: v[6], roll: v[7] });
  if (f <= ks[0].f || n === 1) return out(val(ks[0]));
  if (f >= ks[n - 1].f) return out(val(ks[n - 1]));
  let i = 0; while (f >= ks[i + 1].f) i++;
  const a = ks[i], b = ks[i + 1], h = b.f - a.f, u = (f - a.f) / h, va = val(a), vb = val(b);
  const tan = (j: number) => { if (ks[j].ease) return val(ks[j]).map(() => 0); const p = ks[Math.max(0, j - 1)], q = ks[Math.min(n - 1, j + 1)], vp = val(p), vq = val(q); return vp.map((x, m) => (vq[m] - x) / (q.f - p.f)); };
  const ma = tan(i), mb = tan(i + 1), u2 = u * u, u3 = u2 * u;
  return out(va.map((x, m) => (2 * u3 - 3 * u2 + 1) * x + (u3 - 2 * u2 + u) * h * ma[m] + (-2 * u3 + 3 * u2) * vb[m] + (u3 - u2) * h * mb[m]));
};
/** a rail whose keys are in a moving train's frame (x relative to its nose): the lens rides along */
const ride = (r: (f: number) => Shot, xOf: (f: number) => number) => (f: number): Shot => {
  const s = r(f), x = xOf(f);
  return { ...s, pos: [s.pos[0] + x, s.pos[1], s.pos[2]], look: [s.look[0] + x, s.look[1], s.look[2]] };
};
/** blend two camera functions over [f0, f0 + dur] */
const handoff = (a: (f: number) => Shot, b: (f: number) => Shot, f0: number, dur: number) => (f: number): Shot =>
  f <= f0 ? a(f) : f >= f0 + dur ? b(f) : mixCam(full(a(f)), full(b(f)), glide((f - f0) / dur));
const eye = (p: V3, h = 1.5): V3 => [p[0], p[1] + h, p[2]];

// the hook rides the freight: train-frame keys (x from the nose, z from the track); the lens up and behind on the
// lens side, looking forward along the roofs
const fz = O.line[2];
const HOOK = rail([
  { f: 0, pos: [-31.0, 6.0, fz + 0.45], look: [-14, 4.3, fz + 0.05], fov: 40, roll: R(-4) },
  { f: WHISTLE - 8, pos: [-37.0, 6.2, fz + 0.3], look: [-14, 4.4, fz + 0.05], fov: 40, roll: R(-1) },
  { f: WHISTLE + 2, ease: true, pos: [-37.6, 7.7, fz + 0.3], look: [-5.4, 3.9, fz + 0.1], fov: 13, roll: R(2) },
  { f: L(2, "They") - 6, ease: true, pos: [-38.6, 7.7, fz + 0.3], look: [-5.4, 3.9, fz + 0.1], fov: 12, roll: R(3) },
  { f: LEAP2 + 4, ease: true, pos: [-41.8, 6.2, fz + 0.1], look: [-24, 4.4, fz], fov: 42, roll: R(-3) },
  { f: CRANK + 8, ease: true, pos: [-38.9, 5.5, fz + 3.0], look: [-36.45, 5.15, fz + 0.4], fov: 48, roll: R(2) },
  { f: SLIP + 4, ease: true, pos: [-38.9, 4.95, fz + 2.6], look: [-36.7, 5.1, fz + 0.1], fov: 54, roll: R(6) },
  { f: L(3, "dark") + 2, pos: [-56.0, 5.9, fz + 0.1], look: [-51.0, 5.25, fz], fov: 44, roll: R(1) },
  { f: LEAP3 + 4, ease: true, pos: [-59.5, 6.4, fz + 0.6], look: [-42, 4.5, fz], fov: 42, roll: R(-3) },
  { f: CAPFLY + 14, ease: true, pos: [-59.4, 6.4, fz + 0.3], look: [-54.2, 7.4, fz], fov: 42, roll: R(-6) },
  { f: S1("hook"), pos: [-60.2, 6.3, fz + 1.0], look: [-53.4, 8.7, fz - 0.6], fov: 47, roll: R(-7) },
]);
// the wagon: from over the hill down to the crossing: the horse plants its hooves on the rails
const cabX = OFF.test[0] + LOCO.cab;           // the cab's centre from the nose
const coach1X = OFF.test[2];                    // the open coach's centre from the nose
const WAGON_CAM = rail([
  { f: S0("wagon"), pos: pt(62, 30, 24), look: pt(CROSS_X, 1.5, 0.5), fov: 50, roll: R(-3) },
  { f: L(12, "horse") + 4, ease: true, pos: pt(CROSS_X + 9.5, 2.3, 7.8), look: pt(CROSS_X - 0.5, 1.6, 0.2), fov: 46, roll: R(1) },
  { f: S1("wagon"), pos: pt(CROSS_X + 8.8, 2.25, 7.3), look: pt(CROSS_X - 0.5, 1.6, 0.2), fov: 45, roll: R(2) },
]);
// the run: the lens rides beside the cab out of the dark bore into daylight; Tate leans out, eyes huge; up to the
// silent whistle; up over the empty roofs; down to the lever (snap zoom); then it settles on the gap as the train stops
const RUN_RIDE = ride(rail([
  { f: S0("run"), pos: [cabX + 2.6, 2.8, 2.9], look: [cabX - 0.4, 2.7, 0.6], fov: 46, roll: R(-2) },
  { f: SEES + 6, ease: true, pos: [cabX + 2.3, 2.95, 3.9], look: [cabX + 0.2, 2.85, 1.0], fov: 42, roll: R(4) },
  { f: L(14, "whistle") + 4, ease: true, pos: [cabX + 1.6, 3.0, 2.9], look: [cabX + 0.05, 2.95, 0.9], fov: 40, roll: R(-3) },
  { f: L(14, "men") + 2, pos: [-7.5, 5.8, 4.4], look: [-36, 4.0, 0], fov: 46, roll: R(-4) },
  { f: L(14, "roof") + 6, ease: true, pos: [-8.5, 6.0, 4.4], look: [-40, 4.0, 0], fov: 46, roll: R(-5) },
  { f: PULL - 3, ease: true, pos: [cabX + 0.95, 2.9, 2.75], look: [cabX + 0.05, 2.6, 0.8], fov: 46, roll: R(3) },
  { f: PULL + 6, ease: true, pos: [cabX + 0.85, 2.88, 2.8], look: [cabX - 0.15, 2.55, 0.8], fov: 44, roll: R(7) }, // snap zoom
]), (f) => testX(SH.run, f));
const RUN_STOP = rail([
  { f: STOPF - 4, ease: true, pos: pt(STOP_NOSE + 1.0, 3.4, 10.5), look: pt(STOP_NOSE + 1.0, 1.25, 0.0), fov: 46, roll: R(-2) },
  { f: S1("run"), pos: pt(STOP_NOSE + 1.0, 3.3, 10.1), look: pt(STOP_NOSE + 1.0, 1.25, 0.0), fov: 45, roll: R(-3) },
]);
/** the burst: the lens waits beside the east portal; the engine bursts out at it; when the cab draws level the lens
 *  rides along beside it */
const PORTAL_CAM = rail([
  { f: S0("run"), pos: pt(PORTAL_E + 9.5, 2.6, 4.3), look: pt(PORTAL_E - 2, 3.2, 0), fov: 46, roll: R(-3) },
  { f: S0("run") + 40, pos: pt(PORTAL_E + 9.4, 2.65, 4.3), look: pt(PORTAL_E + 1, 3.0, 0), fov: 46, roll: R(-1) },
]);
const MEET = (() => { let f = S0("run"); while (f < SEES + 40 && testX(SH.run, f) + cabX + 2.2 < O.pitt[0] + PORTAL_E + 9.5) f++; return f; })();
const RUN = handoff(handoff(PORTAL_CAM, RUN_RIDE, MEET - 10, 20), RUN_STOP, L(16, "stops") - 16, 20);

const CAMS: Record<number, Key[]> = {
  // HOOK: night, the freight's roofs: brakemen leap the gaps, the whistle, cranking, the slip, the cap flies
  [SH.hook]: [{ f: 0, s: ride(HOOK, (f) => freightX(SH.hook, f)) }],
  // PITT: the station sign, along the line, into the tunnel's black mouth
  [SH.pitt]: [{ f: S0("pitt"), s: rail([
    { f: S0("pitt"), pos: pt(-38, 9.0, 14), look: pt(8, 3.0, -5), fov: 46, roll: R(-2) },
    { f: L(4, "line") + 2, pos: pt(-8, 4.4, 8), look: pt(20, 3.4, 0), fov: 46, roll: R(1) },
    { f: L(4, "tunnel") + 4, ease: true, pos: pt(9, 3.7, 2.4), look: pt(34, 3.0, 0), fov: 44, roll: R(3) },
    { f: S1("pitt"), pos: pt(13.5, 3.5, 1.6), look: pt(34, 3.0, 0), fov: 43, roll: R(4) },
]) }],
  // GEORGE: the workshop: George, 22, the hose on his shoulder; he blows down it on "air"
  [SH.george]: [{ f: S0("george"), s: rail([
    { f: S0("george"), pos: sp(-0.3, 1.55, 1.6), look: eye(AT.george, 1.35), fov: 44, roll: R(-2) },
    { f: L(5, "twentytwo") + 4, pos: sp(-0.4, 1.6, 0.9), look: eye(AT.george, 1.4), fov: 42, roll: R(0) },
    { f: BLOW + 8, ease: true, pos: sp(-0.45, 1.62, 0.15), look: eye(AT.george, 1.45), fov: 40, roll: R(3) },
    { f: S1("george"), pos: sp(-0.45, 1.62, 0.0), look: eye(AT.george, 1.45), fov: 40, roll: R(4) },
  ]) }],
  // VANDY: the office: George pitches; Vanderbilt behind his desk; in on him: the whiskers flare, he points at the door
  [SH.vandy]: [{ f: S0("vandy"), s: rail([
    { f: S0("vandy"), pos: of(-0.1, 1.75, 3.4), look: of(-0.15, 1.3, -1.6), fov: 48, roll: R(-2) },
    { f: L(6, "Vanderbilt") + 4, ease: true, pos: of(-0.1, 1.75, 3.0), look: of(-0.2, 1.35, -1.8), fov: 48, roll: R(1) },
    { f: L(6, "richest") + 2, pos: of(-0.15, 1.75, 3.1), look: of(-0.25, 1.3, -1.8), fov: 49, roll: R(2) },
    { f: L(7, "Stop") + 2, ease: true, pos: of(0.2, 1.75, 0.4), look: eye(AT.vandy, 1.55), fov: 42, roll: R(-2) },
    { f: FLARE + 4, ease: true, pos: of(0.18, 1.75, -0.1), look: eye(AT.vandy, 1.58), fov: 40, roll: R(-5) },
    { f: S1("vandy"), pos: of(0.18, 1.75, -0.35), look: eye(AT.vandy, 1.58), fov: 40, roll: R(-6) },
  ]) }],
  // LETTERS: the NO letters pin up beside the window; in through the window: the yard train, brakemen on its roofs
  [SH.letters]: [{ f: S0("letters"), s: rail([
    { f: S0("letters"), pos: sp(-1.3, 1.7, 0.4), look: sp(-1.55, 1.7, SHOP.z0), fov: 50, roll: R(2) },
    { f: LETTERS[3] + 6, ease: true, pos: sp(-1.3, 1.72, -0.2), look: sp(-1.55, 1.75, SHOP.z0), fov: 48, roll: R(-2) },
    { f: L(8, "Brakemen") + 10, ease: true, pos: sp(-0.45, 1.6, 0.6), look: sp(-0.2, 1.7, -9), fov: 48, roll: R(1) },
    { f: S1("letters"), pos: sp(-0.45, 1.6, 0.4), look: sp(-0.2, 1.7, -9), fov: 47, roll: R(2) },
  ]) }],
  // STATION: the little train at the platform, George by the engine; the bosses walk in; the pump; low along the
  // pipe; up to the cab's lever; low along the wheels as every shoe clamps
  [SH.station]: [{ f: S0("station"), s: rail([
    { f: S0("station"), pos: pt(-15.0, 2.7, 13.5), look: pt(-16.2, 2.0, 0.8), fov: 46, roll: R(-2) },
    { f: L(9, "test") + 4, pos: pt(-15.6, 2.7, 13.0), look: pt(-16.8, 2.0, 0.8), fov: 46, roll: R(0) },
    { f: L(9, "bosses") + 6, ease: true, pos: pt(-17.0, 2.2, 11.0), look: pt(-17.8, 2.05, 4.4), fov: 46, roll: R(2) },
    { f: L(9, "watch") + 2, pos: pt(-18.4, 2.25, 10.6), look: pt(-19.4, 2.1, 4.4), fov: 46, roll: R(3) },
    { f: PUMP + 4, ease: true, pos: pt(-12.9, 3.0, 7.6), look: pt(-14.45, 2.5, 1.2), fov: 30, roll: R(-2) },
    { f: L(10, "pipe") - 8, pos: pt(-12.95, 2.95, 7.3), look: pt(-14.45, 2.5, 1.2), fov: 29, roll: R(-3) },
    { f: L(10, "pipe") + 16, ease: true, pos: pt(-13.2, 1.75, 2.1), look: pt(-24, 0.95, 1.2), fov: 48, roll: R(2) },
    { f: L(10, "car") + 4, pos: pt(-13.6, 1.75, 2.1), look: pt(-24.4, 0.95, 1.2), fov: 48, roll: R(3) },
    { f: LEVER1 + 4, ease: true, pos: pt(-15.6, 2.95, 3.4), look: pt(-17.35, 2.85, 0.7), fov: 42, roll: R(-2) },
    { f: CLAMP - 2, ease: true, pos: pt(-15.3, 1.05, 1.9), look: pt(-30, 0.85, 1.15), fov: 46, roll: R(2) },
    { f: S1("station"), pos: pt(-13.0, 1.9, 2.05), look: pt(-30, 0.75, 1.1), fov: 48, roll: R(3) },
]) }],
  [SH.wagon]: [{ f: S0("wagon"), s: WAGON_CAM }],
  [SH.run]: [{ f: S0("run"), s: RUN }],
  // BOSSES: through the first coach's windows: the bosses on the floor pick themselves up; George sits upright
  [SH.bosses]: [{ f: S0("bosses"), s: rail([
    { f: S0("bosses"), pos: pt(STOP_NOSE + coach1X + 4.3, COACH_FLOOR + 1.55, 0.55), look: pt(STOP_NOSE + coach1X - 1.2, COACH_FLOOR + 0.55, 0.0), fov: 58, roll: R(2) },
    { f: S1("bosses"), pos: pt(STOP_NOSE + coach1X + 4.0, COACH_FLOOR + 1.5, 0.5), look: pt(STOP_NOSE + coach1X - 1.2, COACH_FLOOR + 0.6, 0.0), fov: 56, roll: R(4) },
  ]) }],
  // FLIP: 1872: George flips his valve; across to the gauge and the rig: the needle swings up, the shoe lets go
  [SH.flip]: [{ f: S0("flip"), s: rail([
    { f: S0("flip"), pos: sp(1.4, 1.65, 1.4), look: sp(1.45, 1.5, SHOP.z0), fov: 46, roll: R(2) },
    { f: FLIP + 6, ease: true, pos: sp(1.55, 1.6, 0.6), look: sp(1.6, 1.45, SHOP.z0), fov: 44, roll: R(-2) },
    { f: HOLDS + 6, ease: true, pos: sp(2.55, 1.6, -1.3), look: sp(2.55, 1.5, SHOP.z0), fov: 56, roll: R(2) },
    { f: S1("flip"), pos: sp(2.77, 1.6, -1.8), look: sp(2.8, 1.55, SHOP.z0), fov: 43, roll: R(3) },
  ]) }],
  // CUT: 1872 by day: the hose between two boxcars parts with a blast; out low along the train as it stops itself
  [SH.cut]: [{ f: S0("cut"), s: ride(rail([
    { f: S0("cut"), pos: [-35.0, 1.75, fz + 4.4], look: [-35.25, 1.1, fz + 1.2], fov: 42, roll: R(-2) },
    { f: CUT + 8, ease: true, pos: [-35.05, 1.7, fz + 4.0], look: [-35.25, 1.05, fz + 1.2], fov: 40, roll: R(3) },
    { f: HALT - 6, ease: true, pos: [-34.0, 1.25, fz + 3.7], look: [-44, 0.85, fz + 0.3], fov: 46, roll: R(-3) },
    { f: S1("cut"), pos: [-34.05, 1.25, fz + 3.65], look: [-44, 0.85, fz + 0.3], fov: 46, roll: R(-4) },
]), (f) => freightX(SH.cut, f)) }],
  // HALF: golden: Vanderbilt, smug; he blows at the model train on his desk; it doesn't budge
  [SH.half]: [{ f: S0("half"), s: rail([
    { f: S0("half"), pos: of(0.45, 1.7, 1.2), look: eye(AT.vandy, 1.45), fov: 44, roll: R(2) },
    { f: SMUG + 6, ease: true, pos: of(0.4, 1.7, 0.6), look: eye(AT.vandy, 1.5), fov: 42, roll: R(-2) },
    { f: PUFF - 2, ease: true, pos: of(0.75, 1.45, 0.3), look: of(0.35, 1.2, -1.9), fov: 44, roll: R(2) },
    { f: S1("half"), pos: of(0.75, 1.45, 0.15), look: of(0.35, 1.2, -1.9), fov: 43, roll: R(3) },
  ]) }],
  // WINDOUT: golden: the parted hose blasting air, the stopped train behind it; cut on the hiss
  [SH.windout]: [{ f: S0("windout"), s: ride(rail([
    { f: S0("windout"), pos: [-34.3, 2.1, fz + 5.6], look: [-35.25, 1.05, fz + 1.2], fov: 44, roll: R(-3) },
    { f: S1("windout"), pos: [-34.5, 1.9, fz + 4.6], look: [-35.25, 1.0, fz + 1.2], fov: 42, roll: R(-6) },
  ]), (f) => freightX(SH.cut, Math.max(f, HALT))) }],
};
const KICKS: number[] = [LEAP1 + 10, SLIP, POINT, PULL, STOPF, CUT, HALT - 4, VOICE_END - 6];

export const kickAt = (t: number) => {
  let a = 0;
  for (const f0 of KICKS) {
    const n = Math.floor(t * FPS - f0 + 1e-6);
    if (n >= 0 && n < 7) a += 0.9 * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(T(f));
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const Ln = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * Ln * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};
/** radial zoom blur: the swoop over the hill, the lever's snap zoom */
export const zoomBlurAt = (f: number) => {
  const bell = (a: number, b: number, k: number) => (f > a && f < b ? k * Math.sin((Math.PI * (f - a)) / (b - a)) : 0);
  return bell(S0("wagon") + 2, L(12, "horse") + 2, 0.04) + bell(PULL - 2, PULL + 10, 0.07);
};

// ---------------- lens ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
const eyes = (p: V3, h = 1.5): (() => V3) => () => [p[0], p[1] + h, p[2]];
export const DOF: Dof[] = [
  { f: 0, cInf: 2 },
  { f: CRANK, dur: 10, cInf: 9 },
  { f: L(3, "dark"), dur: 10, cInf: 7, focus: () => [freightX(SH.hook, L(3, "dark")) + OFF.freight[0] - 46.4, ROOF_Y + 1.5, 0] as V3 },
  { f: LEAP3, dur: 8, cInf: 3 },
  { f: S0("pitt"), cInf: 0 },
  { f: S0("george"), cInf: 11, focus: eyes(AT.george, 1.5) },
  { f: S0("vandy"), cInf: 7 },
  { f: L(7, "Stop"), dur: 10, cInf: 12, focus: eyes(AT.vandy, 1.55) },
  { f: S0("letters"), cInf: 8, focus: () => AT.letters[1] },
  { f: L(8, "Brakemen"), dur: 12, cInf: 0 },
  { f: S0("station"), cInf: 5 },
  { f: PUMP, dur: 10, cInf: 10 },
  { f: L(10, "pipe"), dur: 10, cInf: 4 },
  { f: LEVER1, dur: 8, cInf: 11 },
  { f: CLAMP - 4, dur: 8, cInf: 0 },
  { f: S0("wagon"), cInf: 0 },
  { f: L(12, "horse"), dur: 10, cInf: 6 },
  { f: S0("run"), cInf: 6 },
  { f: SEES - 4, dur: 10, cInf: 8 },
  { f: L(14, "men"), dur: 10, cInf: 3 },
  { f: PULL - 4, dur: 8, cInf: 10 },
  { f: STOPF - 6, dur: 10, cInf: 6 },
  { f: S0("bosses"), cInf: 7 },
  { f: S0("flip"), cInf: 11, focus: eyes(AT.georgeFlip, 1.5) },
  { f: HOLDS, dur: 10, cInf: 9, focus: () => AT.gauge },
  { f: S0("cut"), cInf: 12 },
  { f: L(19, "train"), dur: 12, cInf: 4 },
  { f: S0("half"), cInf: 11, focus: eyes(AT.vandy, 1.55) },
  { f: PUFF - 6, dur: 10, cInf: 10, focus: () => AT.model },
  { f: S0("windout"), cInf: 13 },
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
export type Fg = { a: number; b: number; kit: string; pos: V3; s?: number; yaw?: number };
export const FOREGROUND: Fg[] = [];
void ln; void COACH; void CROSS_X; void S1; void onTrain;
/** for the speed check only: the x the lens rides along with in train-frame shots (0 elsewhere) */
export const rideOf = (id: number, f: number) => id === SH.hook ? freightX(SH.hook, f) : id === SH.cut ? freightX(SH.cut, f) : id === SH.windout ? freightX(SH.cut, Math.max(f, HALT))
  : id === SH.run && f < L(16, "stops") - 16 ? testX(SH.run, f) : 0;
