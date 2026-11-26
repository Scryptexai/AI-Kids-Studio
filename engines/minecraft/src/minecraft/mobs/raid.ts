// mc-raid Wave A: the raid mobs' acting and the new act kinds, as pure functions of the frame (keyed at 30 fps, smooth
// at 60: frames may be fractional). Mob.tsx asks `raidState` what to draw this frame (items, banner, tag, glow, motes,
// a body placed off its path: bed, throw, rear) and `poseRaid` sets the part rotations of the new rigs after poseMob's
// generic pass. Formats: projects/mc-raid/FX.md "## Wave A: mobs".
//   illager  (pillager / vindicator / evoker, IllagerModel): crossbow carry + aim (CROSSBOW_HOLD) / charge
//            (CROSSBOW_CHARGE, pulling sprites) / fire; vindicator axe (swingWeaponDown) + swing; evoker crossed arms +
//            cast (SPELLCASTING) with spell motes; "cross" folds any illager's arms
//   ravager  walk / run gait, breathing idle, bite (the game's attack tick), stun (neck sway + grey stun motes), roar (jaw wide,
//            head up, rears on the hind legs), charge (head down)
//   vex      wing flap + hover + arm sway (VexModel), charge (sword up, charging face), phase (see-through dip)
//   player   hold, drink (bottle, purple face light, swirl motes), block / clank (off-hand shield), swing (sword),
//            bell (aimed use-swing, acts.ts), totem (held up, glowing), throw (flight + land on the back)
//   villager bed (lying on the back), sitUp, jumpOut, wave
//   sheep    wool (tint change with orange spell motes)
//   any mob  glowing (outline), tag (name tag), captain (ominous banner on the head), phase
import * as THREE from "three";
import type { MobModel } from "./models";
import type { Act } from "./acts";
import { rnd, type Puff } from "./life";

const sm = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const over = (x: number, s = 1.6) => { const t = Math.max(0, Math.min(1, x)) - 1; return 1 + t * t * ((s + 1) * t + s); };
const bump = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(x * Math.PI));
const c01 = (x: number) => Math.max(0, Math.min(1, x));
/** eased in over `ein` before t = 0, held `len`, eased out over `eout` */
const env = (t: number, ein: number, len: number, eout: number) =>
  (t < -ein ? 0 : t < 0 ? (ein > 0 ? sm((t + ein) / ein) : 1) : t <= len ? 1 : eout > 0 ? 1 - sm((t - len) / eout) : 0);
const FOREVER = 1e9;
/** game ticks per video frame (keys at 30 fps) */
const TPF = 20 / 30;
const hex = (c: string): [number, number, number] => { const k = new THREE.Color(c); return [k.r, k.g, k.b]; };

export type HandKind = "generated" | "handheld" | "shield";
export type HandItem = { key: string; kind: HandKind; k: number };
export type RootPose = {
  /** the hip pivot in the world, the body pitch about it (rad, + = forward, -pi/2 = on its back) */
  hip: [number, number, number]; pitch: number;
  /** yaw override (rad) or null = the path's facing */
  yaw: number | null;
  /** the legs' angle relative to the body (rad, - = forward) */
  legRel: number;
  /** landing squash 0..1 about the floor at `floor` */
  squash: number; floor: number;
  /** 0..1 how much the body lies down (damps the look) */
  lie: number;
  /** the head look is solved from this body as drawn (its hip, yaw and pitch), not from the path keys (bed) */
  own?: boolean;
};
export type RaidState = {
  glow: number; glowPx: number;
  tag: { text: string; size: number; k: number } | null;
  captain: boolean;
  wool: [number, number, number] | null;
  opacity: number;
  /** particles, mob-local like life.ts puffs (x = its left, y up, z forward; feet origin) */
  motes: Puff[];
  /** the purple face light (drink) 0..1 */
  faceLight: number;
  hands: { r: HandItem | null; l: HandItem | null };
  /** shield: block pose 0..1, the clank flash 0..1; the totem's glow 0..1 */
  block: number; flash: number; totem: number;
  /** the body placed off its path (bed, throw) */
  root: RootPose | null;
  /** a whole-body rear about a pivot (ravager roar): pitch (rad, - = back), pivot y / z in mob blocks */
  rear: { pitch: number; py: number; pz: number } | null;
  /** extra whole-body motion (illager sway, vex hover, villager bounce), like ActOffsets.body */
  body: { dy: number; pitch: number; roll: number; yaw: number; fwd: number };
  /** a look the head turns to: world point and weight */
  look: { at: [number, number, number]; w: number } | null;
  /** illagers: crossbow sprite index (models CROSSBOW_TEX) or -1, separate arms shown (else the crossed "arms") */
  crossbow: number; armed: boolean;
  /** illager arm weights: aim, charge (with its pull 0..1), fire recoil, axe attack time (-1 = none), cast */
  aim: number; charge: number; pull: number; recoil: number; attack: number; cast: number;
  /** ravager: bite attack ticks left (10..0, -1 none), stun 0..1 (+ its ticks), roar 0..1, charge 0..1 */
  bite: number; stun: number; stunTicks: number; roar: number; rush: number;
  /** vex: charging 0..1 */
  vexCharge: number;
  /** villager: wave 0..1 and its time */
  wave: number; waveT: number;
};

/** defaults from the cue / placement (Actors.tsx: a pillager called "barry" is the captain with the tag "Barry") */
export type RaidDefaults = { captain?: boolean; tag?: string; tagSize?: number; glowing?: number; opacity?: number;
  /** first person: the body is hidden (its light, motes and bursts stay) */
  pov?: boolean };

const kindsHere = (acts: Act[] | undefined, kinds: string[]) => (acts ?? []).filter((a) => kinds.includes(a.kind)).sort((a, b) => a.f - b.f);

/** the raid state this frame. `at` = the path position, yawRad its yaw, s = the model scale (incl. baby) */
export const raidState = (model: MobModel, acts: Act[] | undefined, frame: number, age: number, seed: number,
  at: [number, number, number], yawRad: number, s: number, def: RaidDefaults = {}): RaidState => {
  const rs: RaidState = {
    glow: def.glowing ?? 0, glowPx: 4, tag: def.tag ? { text: def.tag, size: def.tagSize ?? 1, k: 1 } : null, captain: !!def.captain,
    wool: null, opacity: def.opacity ?? 1, motes: [], faceLight: 0, hands: { r: null, l: null }, block: 0, flash: 0, totem: 0,
    root: null, rear: null, body: { dy: 0, pitch: 0, roll: 0, yaw: 0, fwd: 0 }, look: null,
    crossbow: -1, armed: model.arms !== "crossed", aim: 0, charge: 0, pull: 0, recoil: 0, attack: -1, cast: 0,
    bite: -1, stun: 0, stunTicks: 0, roar: 0, rush: 0, vexCharge: 0, wave: 0, waveT: 0,
  };
  const A = acts ?? [];
  const rig = model.rig;
  // ---------------------------------------------------------------- any mob
  for (const a of kindsHere(A, ["glowing"])) {
    const w = env(frame - a.f, a.ein ?? 4, a.len ?? FOREVER, a.eout ?? 6) * (a.amt ?? 1);
    if (w > 0 || frame >= a.f) { rs.glow = Math.max(frame >= a.f + (a.len ?? FOREVER) ? 0 : rs.glow, w); if (a.px) rs.glowPx = a.px; }
  }
  for (const a of kindsHere(A, ["tag"])) {
    const t = frame - a.f;
    if (t < 0) continue;
    const k = a.len !== undefined ? env(t, 0, a.len, 4) : 1;
    rs.tag = k > 0 ? { text: a.text ?? def.tag ?? "Barry", size: a.size ?? def.tagSize ?? 1, k: Math.min(over(t / 5, 2.2), 1.08) * k } : null;
  }
  for (const a of kindsHere(A, ["captain"])) if (frame >= a.f) rs.captain = a.amt !== 0;
  for (const a of kindsHere(A, ["phase"])) rs.opacity *= 1 - (a.amt ?? 0.65) * env(frame - a.f, a.ein ?? 6, a.len ?? 0, a.eout ?? 6);

  // ---------------------------------------------------------------- sheep wool
  if (model.slots?.some((x) => x.tex === "entity/sheep/sheep_wool")) {
    let cur: [number, number, number] | null = null;
    for (const a of kindsHere(A, ["wool"])) {
      const to = hex(a.color ?? "#ffffff"), t = frame - a.f, ein = a.ein ?? 0;
      if (t < 0) break;
      const from: [number, number, number] = cur ?? [1, 1, 1];
      const k = ein > 0 ? sm(t / ein) : 1;
      cur = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k];
      // the conversion spell: orange motes swirl up round the sheep while it changes, and a little after
      if (ein > 0) spellMotes(rs.motes, frame, a.f - 4, ein + 14, hex("#c08a3a"), seed + a.f, 0.6, 1.3, 14);
    }
    rs.wool = cur;
  }

  // ---------------------------------------------------------------- illagers
  if (rig === "illager") {
    const swingA = kindsHere(A, ["swing"]), castA = kindsHere(A, ["cast"]);
    for (const a of kindsHere(A, ["cross"])) if (env(frame - a.f, 0, a.len ?? FOREVER, 0) > 0) rs.armed = false;
    if (model.arms === "crossbow") {
      // the crossbow: charged (arrow) by default; a fire empties it (standby), a charge pulls it back up
      let sprite = 4;
      for (const a of kindsHere(A, ["charge", "fire"])) {
        const t = frame - a.f;
        if (t < 0) break;
        if (a.kind === "fire") sprite = 0;
        else { const L = a.len ?? 37.5, p = t / L; sprite = p < 0.58 ? 1 : p < 1 ? 2 : p < 1.12 ? 3 : 4; }
      }
      rs.crossbow = sprite;
      for (const a of kindsHere(A, ["aim"])) {
        rs.aim = Math.max(rs.aim, env(frame - a.f, a.ein ?? 6, a.len ?? FOREVER, a.eout ?? 8) * (a.amt ?? 1));
        if (a.target) { const w = env(frame - a.f, a.ein ?? 6, a.len ?? FOREVER, a.eout ?? 8); if (w > 0) rs.look = { at: a.target, w }; }
      }
      for (const a of kindsHere(A, ["charge"])) {
        const t = frame - a.f, L = a.len ?? 37.5, w = env(t, 4, L, 6);
        if (w > rs.charge) { rs.charge = w; rs.pull = c01(t / L); }
      }
      for (const a of kindsHere(A, ["fire"])) {
        const t = frame - a.f;
        rs.aim = Math.max(rs.aim, env(t, 5, 3, 10));
        rs.recoil = Math.max(rs.recoil, t >= 0 && t < 6 ? Math.exp(-t / 2.2) * (t < 1 ? t : 1) : 0);
        if (a.target) { const w = env(t, 5, 3, 10); if (w > (rs.look?.w ?? 0)) rs.look = { at: a.target, w }; }
      }
    }
    // the axe: swingWeaponDown's attack time over 6 ticks (9 f), the blow (most forward) at f
    for (const a of swingA) {
      const n = a.n ?? 1, P = a.every ?? 12;
      for (let i = 0; i < n; i++) { const u = (frame - (a.f + i * P - 4.5)) / 9; if (u >= 0 && u < 1) rs.attack = u; }
      if (a.target) { const w = env(frame - a.f, 6, (n - 1) * P + 4, 8); if (w > 0) rs.look = { at: a.target, w }; }
    }
    // the evoker's spell: arms up, spell motes from the hands (rs.armed while it casts)
    for (const a of castA) {
      const t = frame - a.f, L = a.len ?? 30, w = env(t, 5, L, 6);
      if (w > 0) { rs.cast = Math.max(rs.cast, w); rs.armed = true; }
      const col = hex(a.color ?? "#b3b3cc");
      if (t > -2 && t < L + 16) {
        for (const side of [1, -1]) handMotes(rs.motes, frame, a.f, L, col, seed + a.f + side * 7, side, s);
      }
      if (a.target && w > 0) rs.look = { at: a.target, w };
    }
    // a captain's idle: a slow weight shift and breath, never still
    rs.body.roll += Math.sin(age * 0.045 + seed) * 0.018; rs.body.dy += Math.sin(age * 0.13 + seed) * 0.004 * s;
    rs.body.pitch += Math.sin(age * 0.11 + seed + 1) * 0.01;
  }

  // ---------------------------------------------------------------- ravager
  if (rig === "ravager") {
    for (const a of kindsHere(A, ["bite"])) {
      const n = a.n ?? 1, P = a.every ?? 15;
      for (let i = 0; i < n; i++) { const ticks = 10 - (frame - (a.f + i * P - 7.5)) * TPF; if (ticks > 0 && ticks <= 10) rs.bite = ticks; }
      if (a.target) { const w = env(frame - a.f, 8, (n - 1) * P + 4, 8); if (w > 0) rs.look = { at: a.target, w }; }
    }
    for (const a of kindsHere(A, ["stun"])) {
      const t = frame - a.f, L = a.len ?? 60, w = env(t, 3, L, 8);
      if (w > rs.stun) { rs.stun = w; rs.stunTicks = Math.max(0, (L - t) * TPF); }
      // the game's stun particles (entity_effect, grey-blue 0.498 / 0.514 / 0.573), here four of them circling the head
      if (t >= 0 && t < L + 4) {
        const k = t < L ? 1 : 1 - (t - L) / 4;
        for (let j = 0; j < 4; j++) {
          const ang = t * 0.22 + (j / 4) * Math.PI * 2;
          rs.motes.push({ p: [Math.cos(ang) * 0.42 + Math.sin(t * 0.37) * 0.04, 2.55 + 0.06 * Math.sin(ang * 2), 1.15 + Math.sin(ang) * 0.42], s: 0.11 * k * (0.85 + 0.15 * Math.sin(t * 0.9 + j)), g: 1, c: j % 2 ? [0.498, 0.514, 0.573] : [0.6, 0.62, 0.68] });
        }
      }
    }
    for (const a of kindsHere(A, ["roar"])) {
      const t = frame - a.f, L = a.len ?? 30, w = env(t, 6, L, 10);
      rs.roar = Math.max(rs.roar, w);
      if (w > 0) rs.rear = { pitch: -0.2 * w * (t >= 0 ? 1 + 0.08 * Math.sin(t * 0.5) : over((t + 6) / 6, 1.8)), py: 0, pz: -1.125 };
    }
    for (const a of kindsHere(A, ["charge"])) rs.rush = Math.max(rs.rush, env(frame - a.f, a.ein ?? 6, a.len ?? FOREVER, a.eout ?? 8));
  }

  // ---------------------------------------------------------------- vex
  if (rig === "vex") {
    for (const a of kindsHere(A, ["charge"])) rs.vexCharge = Math.max(rs.vexCharge, env(frame - a.f, a.ein ?? 4, a.len ?? FOREVER, a.eout ?? 6));
    // hover: a slow bob and a little roll, livelier than walking (never still)
    rs.body.dy += (Math.sin(age * 0.15 + seed) * 0.06 + Math.sin(age * 0.41 + seed * 2) * 0.015) * s;
    rs.body.roll += Math.sin(age * 0.11 + seed) * 0.06; rs.body.pitch += Math.sin(age * 0.17 + seed) * 0.04;
  }

  // ---------------------------------------------------------------- villager
  if (rig === "villager") {
    for (const a of kindsHere(A, ["wave"])) {
      const t = frame - a.f, w = env(t, 5, a.len ?? 24, 8);
      if (w > rs.wave) { rs.wave = w; rs.waveT = t; }
    }
    if (rs.wave > 0) { const b = Math.abs(Math.sin(rs.waveT * 0.45)); rs.body.dy += 0.05 * b * rs.wave * s; rs.body.roll += 0.06 * Math.sin(rs.waveT * 0.45) * rs.wave; }
    rs.root = bedRoot(A, frame, at, yawRad, s);
    // a wave while sitting in bed: the cheer's bounce lifts the hips (the body offsets are not used off the path)
    if (rs.root && rs.wave > 0) rs.root.hip[1] += 0.03 * Math.abs(Math.sin(rs.waveT * 0.45)) * rs.wave * s;
  }

  // ---------------------------------------------------------------- player items and the throw
  if (rig === "humanoid") {
    const hand = (side: "r" | "l", it: HandItem) => { const cur = rs.hands[side]; if (!cur || it.k >= cur.k) rs.hands[side] = it; };
    const kindOf = (key: string): HandKind => (key.includes("shield") ? "shield" : /(sword|_axe|pickaxe|shovel|_hoe)$/.test(key) ? "handheld" : "generated");
    for (const a of kindsHere(A, ["hold"])) {
      if (!a.item) continue;
      const t = frame - a.f, k = env(t, a.ein ?? 4, a.len ?? FOREVER, a.eout ?? 4);
      if (k > 0) hand(a.side ?? (a.item.includes("shield") ? "l" : "r"), { key: a.item, kind: kindOf(a.item), k: Math.min(1.06, t < 0 ? over((t + (a.ein ?? 4)) / (a.ein ?? 4), 2) : 1) * (t > (a.len ?? FOREVER) ? k : 1) });
    }
    for (const a of kindsHere(A, ["drink"])) {
      const t = frame - a.f, L = a.len ?? 24;
      // the bottle pops into the hand as the arm comes up, and is gone once drunk
      const k = env(t, 10, L, 3);
      if (k > 0) hand(a.side ?? "r", { key: "item/ominous_bottle", kind: "generated", k: t < -10 + 4 ? over((t + 10) / 4, 2) : k });
      // Bad Omen takes: the face lights purple and purple swirls rise round the body
      rs.faceLight = Math.max(rs.faceLight, env(t, 4, L + 6, 18) * (0.85 + 0.15 * Math.sin(t * 0.5)));
      if (t > -2 && t < L + 40) spellMotes(rs.motes, frame, a.f, L + 22, hex("#8a3fd1"), seed + a.f, 0.5, 2.0, 20, true);
    }
    for (const a of kindsHere(A, ["block", "clank"])) {
      const t = frame - a.f, len = a.kind === "clank" ? 6 : a.len ?? 20;
      const w = env(t, a.ein ?? 4, len, a.eout ?? 8);
      if (w > 0) { rs.block = Math.max(rs.block, w); hand(a.side ?? "l", { key: "entity/shield/shield_base_nopattern", kind: "shield", k: 1 }); }
      if (a.kind === "clank" && t >= 0 && t < 10) {
        rs.flash = Math.max(rs.flash, Math.exp(-t / 2.5));
        // sparks off the shield face (its left front at chest height)
        const side = (a.side ?? "l") === "l" ? 1 : -1;
        for (let j = 0; j < 8; j++) {
          const u = t / (6 + rnd(seed + a.f, j) * 4);
          if (u >= 1) continue;
          const ang = rnd(seed + a.f, j + 20) * Math.PI * 2, sp = 0.3 + 0.4 * rnd(seed + a.f, j + 40);
          rs.motes.push({ p: [side * 0.32 + Math.cos(ang) * sp * u, 1.2 + Math.sin(ang) * sp * u * 0.8, 0.62 + 0.25 * u], s: 0.06 * (1 - u), g: 1, c: j % 3 ? [1, 0.93, 0.6] : [1, 1, 1] });
        }
      }
    }
    for (const a of kindsHere(A, ["totem"])) {
      const t = frame - a.f, L = a.len ?? 30, k = env(t, 8, L, 8);
      if (k > 0) hand(a.side ?? "l", { key: "item/totem_of_undying", kind: "generated", k: t < -4 ? over((t + 8) / 4, 2) : 1 });
      rs.totem = Math.max(rs.totem, env(t, 2, L, 8) * (0.9 + 0.1 * Math.sin(t * 0.6)));
      // green and yellow totem particles bursting up and out of the raised hand
      if (t >= 0 && t < L + 20) {
        const side = (a.side ?? "l") === "l" ? 1 : -1;
        for (let j = 0; j < 22; j++) {
          const b = rnd(seed + a.f, j) * Math.min(L, 24), life = 12 + rnd(seed + a.f, j + 30) * 10, u = (t - b) / life;
          if (u < 0 || u > 1) continue;
          const ang = rnd(seed + a.f, j + 60) * Math.PI * 2, sp = 0.35 + 0.5 * rnd(seed + a.f, j + 90);
          rs.motes.push({ p: [side * 0.38 + Math.cos(ang) * sp * u, 2.35 + 0.7 * u - 0.5 * u * u, 0.25 + Math.sin(ang) * sp * u], s: 0.07 * (1 - u * u), g: 1, c: j % 2 ? [0.45, 0.95, 0.3] : [1, 0.92, 0.35] });
        }
      }
    }
    rs.root = throwRoot(A, frame, s);
  }
  return rs;
};

/** spell / effect motes rising round the body (mob-local): a ring of squares spiralling up from `y0` to `y1` */
const spellMotes = (out: Puff[], frame: number, f0: number, len: number, col: [number, number, number], seed: number, r: number, y1: number, n: number, swirl = false) => {
  for (let j = 0; j < n; j++) {
    const b = f0 + rnd(seed, j) * Math.max(1, len - 10), life = 14 + rnd(seed, j + 50) * 10, u = (frame - b) / life;
    if (u < 0 || u > 1) continue;
    const ang = rnd(seed, j + 100) * Math.PI * 2 + (swirl ? u * 3.2 : u * 0.8), rr = r * (0.8 + 0.4 * rnd(seed, j + 150)) * (swirl ? 1 - 0.3 * u : 1);
    const shade = 0.75 + 0.25 * rnd(seed, j + 200);
    out.push({ p: [Math.cos(ang) * rr, 0.2 + (y1 - 0.2) * (0.25 * rnd(seed, j + 250) + 0.75 * u), Math.sin(ang) * rr], s: 0.085 * (u < 0.2 ? u / 0.2 : 1 - ((u - 0.2) / 0.8) ** 2), g: 1, c: [col[0] * shade, col[1] * shade, col[2] * shade] });
  }
};
/** the evoker's spell motes: from a raised hand (side +1 = its left), drifting up */
const handMotes = (out: Puff[], frame: number, f0: number, len: number, col: [number, number, number], seed: number, side: number, s: number) => {
  for (let j = 0; j < 10; j++) {
    const b = f0 - 2 + rnd(seed, j) * Math.max(1, len), life = 10 + rnd(seed, j + 30) * 8, u = (frame - b) / life;
    if (u < 0 || u > 1) continue;
    const dx = (rnd(seed, j + 60) - 0.5) * 0.25, dz = (rnd(seed, j + 90) - 0.5) * 0.25;
    out.push({ p: [side * (0.62 + 0.15 * u) + dx, 2.0 + 0.55 * u, 0.05 + dz], s: 0.075 * (1 - u * u), g: 1, c: col });
  }
};

/** a villager in bed: the head end at the bed act's `target`, the foot end toward its `to`; hip 3.6 px over the
 *  mattress (the head sinks 0.4 px into the pillow, the robe just touches); lies down from the path pose over `ein`
 *  frames centred on the bed's f (a small crouch, then it tips back, the hips land, a settle bounce); sit up; jump out
 *  to the path position. The whole body turns about the hip (head, arms, legs stay on it); the head looks from it. */
const bedRoot = (A: Act[], frame: number, at: [number, number, number], yawRad: number, s: number): RootPose | null => {
  const ein0 = (a: Act) => Math.max(0, a.ein ?? 8);
  const bed = kindsHere(A, ["bed"]).filter((a) => a.target && frame >= a.f - ein0(a) / 2).pop();
  if (!bed || !bed.target) return null;
  const T = new THREE.Vector3(...bed.target);
  const toP = bed.to ? new THREE.Vector3(...bed.to) : T.clone().add(new THREE.Vector3(Math.sin(yawRad), 0, Math.cos(yawRad)));
  const d = toP.clone().sub(T).setY(0).normalize();
  const bedYaw = Math.atan2(d.x, d.z);
  let dYaw = yawRad - bedYaw; dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
  const hipH = (3.6 / 16) * s, crown = T.clone().addScaledVector(d, 0.02);
  const hip = crown.clone().addScaledVector(d, (10 / 16 + 0.75) * s).setY(T.y + hipH);
  const sit = kindsHere(A, ["sitUp"]).filter((a) => a.f >= bed.f && frame >= a.f - (a.ein ?? 10)).pop();
  const k = sit ? over((frame - (sit.f - (sit.ein ?? 10))) / (sit.ein ?? 10), 1.3) : 0;
  // sitting up: the hips slide back a little as the torso comes up over them (the crown stays clear of the head end)
  const sitHip = hip.clone().addScaledVector(d, 0.04 * Math.min(1, k));
  let pose: RootPose = { hip: sitHip.toArray() as [number, number, number], pitch: -Math.PI / 2 * (1 - k), yaw: bedYaw, legRel: 0, squash: 0, floor: T.y, lie: 1 - Math.min(1, k), own: true };
  pose.legRel = -Math.PI / 2 - pose.pitch;
  // breathing while lying (chest rise reads as a slight roll of the whole body)
  if (!sit) pose.pitch += Math.sin(frame * 0.09) * 0.012;
  // lying down (no sit-up yet): from the path pose to the lie over ein frames centred on f
  const ein = ein0(bed), u = ein > 0 ? (frame - (bed.f - ein / 2)) / ein : 1;
  if (!sit && u < 1) {
    const stand = new THREE.Vector3(at[0], at[1] + 0.75 * s, at[2]);
    // anticipation: a little crouch forward over the first third, then it tips back onto the mattress, the hips
    // easing down and the legs flexing at the hip on the way (straight again once flat)
    const ant = bump(u / 0.35), kk = sm((u - 0.15) / 0.85);
    const p = stand.clone().lerp(hip, kk);
    p.y -= 0.07 * s * ant;
    pose = { hip: p.toArray() as [number, number, number], pitch: 0.2 * ant - (Math.PI / 2) * kk, yaw: bedYaw + dYaw * (1 - sm(u * 1.6)),
      legRel: -0.6 * bump(kk), squash: 0, floor: T.y, lie: kk, own: true };
  } else if (!sit && ein > 0) {
    // the settle: the hips bounce once on the mattress, the head lifts a touch with it
    const v = (frame - (bed.f + ein / 2)) / 7;
    if (v > 0 && v < 1) { const b = Math.sin(v * Math.PI) * (1 - v); pose.hip[1] += 0.035 * s * b; pose.pitch += 0.07 * b; }
  }
  const jump = kindsHere(A, ["jumpOut"]).filter((a) => a.f >= bed.f).pop();
  if (jump) {
    const L = jump.len ?? 12, u = (frame - (jump.f - L)) / L;
    if (u >= 0) {
      if (u >= 1 + 8 / L) return null;           // landed and settled: back on its path
      const e = sm(Math.min(1, u)), stand = new THREE.Vector3(at[0], at[1] + 0.75 * s, at[2]);
      const p = sitHip.clone().lerp(stand, e);
      p.y += 0.55 * s * bump(Math.min(1, u)) - (u > 1 ? 0.06 * s * bump((u - 1) * L / 8) : 0);
      const squash = u > 1 ? bump((u - 1) * L / 8) : 0;
      pose = { hip: p.toArray() as [number, number, number], pitch: 0.12 * bump(Math.min(1, u)), yaw: bedYaw + dYaw * sm(u * 1.4), legRel: -Math.PI / 2 * (1 - sm(u * 1.6)) + 0.3 * bump(u), squash, floor: at[1], lie: 0, own: true };
    }
  }
  return pose;
};

/** the player thrown (R10 root part): from `from` (feet) to `to` (where it lies), an arc `height` over len frames,
 *  tumbling onto its back; a landing squash and bounce; it stays lying on its back */
const throwRoot = (A: Act[], frame: number, s: number): RootPose | null => {
  const th = kindsHere(A, ["throw"]).filter((a) => a.from && a.to && frame >= a.f).pop();
  if (!th || !th.from || !th.to) return null;
  const L = th.len ?? 16, t = frame - th.f, u = c01(t / L), H = th.height ?? 1.5;
  const lieH = (4 / 16 + 0.01) * s;
  const from = new THREE.Vector3(th.from[0], th.from[1] + 0.75 * s, th.from[2]), to = new THREE.Vector3(th.to[0], th.to[1] + lieH, th.to[2]);
  const p = from.clone().lerp(to, u);
  p.y += H * 4 * u * (1 - u);
  // tumble back (a quarter turn and a little past, settling flat), a squash and a small bounce on landing
  const land = t - L;
  const pitch = t <= L ? -(Math.PI / 2) * sm(u * 1.15) - 0.25 * bump(u) : -Math.PI / 2 + 0.1 * bump(land / 6) * Math.exp(-land / 10);
  if (land > 0) p.y += 0.07 * s * bump((land - 1) / 7);
  return { hip: p.toArray() as [number, number, number], pitch, yaw: Math.atan2(from.x - to.x, from.z - to.z), legRel: 0, squash: land >= 0 ? bump(land / 6) : 0, floor: th.to[1], lie: sm(u) };
};

// ------------------------------------------------------------------ poses (after poseMob's generic pass)
const clampV = (v: number, m: number) => Math.max(-m, Math.min(m, v));
/** set the new rigs' part rotations for this moment (age in ticks); parts were reset by poseMob */
export const poseRaid = (model: MobModel, parts: Map<string, THREE.Group>, rs: RaidState, age: number, seed: number, action: "idle" | "walk" | "run") => {
  const P = (n: string) => parts.get(n);
  if (model.rig === "illager") {
    const arms = P("arms"), ra = P("right_arm"), la = P("left_arm"), head = P("head");
    if (arms) { arms.visible = !rs.armed; arms.rotation.x += Math.sin(age * 0.1 + seed) * 0.03; }
    if (ra) ra.visible = rs.armed;
    if (la) la.visible = rs.armed;
    const hy = head?.rotation.y ?? 0, hx = head?.rotation.x ?? 0;
    const bobZ = Math.cos(age * 0.09) * 0.05 + 0.05, bobX = Math.sin(age * 0.067) * 0.05;
    if (ra && la && rs.armed) {
      let r: [number, number, number], l: [number, number, number];
      if (model.arms === "crossbow") {
        // carry: the crossbow across the body at the waist, the off hand on its stock
        r = [-0.95 + bobX, -0.35, 0.05]; l = [-1.05 - bobX, 0.6, -0.05];
        const hold: [number, number, number][] = [[-Math.PI / 2 + hx + 0.1, -0.3 + hy, 0], [-1.5 + hx, 0.6 + hy, 0]];
        const p = rs.pull;
        const chg: [number, number, number][] = [[-0.97, -0.8, 0], [-0.97 + (-Math.PI / 2 + 0.97) * p, 0.4 + 0.45 * p, 0]];
        const mix = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
        r = mix(mix(r, hold[0], rs.aim), chg[0], rs.charge); l = mix(mix(l, hold[1], rs.aim), chg[1], rs.charge);
        // the shot's kick: both arms jump up and settle
        r[0] -= 0.28 * rs.recoil; l[0] -= 0.24 * rs.recoil;
        // a breath on the aim so it is never frozen
        r[0] += Math.sin(age * 0.12 + seed) * 0.015; l[0] += Math.sin(age * 0.12 + seed + 0.4) * 0.015;
      } else if (model.arms === "axe" || rs.cast <= 0) {
        // swingWeaponDown: the axe raised, the free arm swaying; the attack chops down through it
        const at = rs.attack >= 0 ? rs.attack : 0, f = Math.sin(at * Math.PI), f1 = Math.sin((1 - (1 - at) * (1 - at)) * Math.PI);
        r = [-1.8849558 + Math.cos(age * 0.09) * 0.15 + f * 2.2 - f1 * 0.4, Math.PI / 20, 0];
        l = [Math.cos(age * 0.19) * 0.5 + f * 1.2 - f1 * 0.4, -Math.PI / 20, 0];
        r[2] += bobZ; l[2] -= bobZ; r[0] += bobX; l[0] -= bobX;
      } else {
        r = [0, 0, 0]; l = [0, 0, 0];
      }
      if (rs.cast > 0) {
        // SPELLCASTING: both arms up and out, waving (from hanging: the arms swing up as the spell starts)
        const w = rs.cast, cr: [number, number, number] = [Math.cos(age * 0.6662) * 0.25, 0, 2.3561945], cl: [number, number, number] = [Math.cos(age * 0.6662) * 0.25, 0, -2.3561945];
        r = [r[0] + (cr[0] - r[0]) * w, r[1] * (1 - w), r[2] + (cr[2] - r[2]) * w]; l = [l[0] + (cl[0] - l[0]) * w, l[1] * (1 - w), l[2] + (cl[2] - l[2]) * w];
      }
      ra.rotation.x += r[0]; ra.rotation.y += r[1]; ra.rotation.z += r[2];
      la.rotation.x += l[0]; la.rotation.y += l[1]; la.rotation.z += l[2];
    }
    // the robe sways from the hips (hem clear of the legs), the nose twitches a little
    const jb = P("jacket")?.userData.bend as { mid: THREE.Bone; low: THREE.Bone } | undefined;
    if (jb) {
      const walkK = action === "idle" ? 1 : 0.5;
      const x = Math.sin(age * 0.09 + seed) * 0.04 * walkK, z = Math.sin(age * 0.067 + seed * 1.7) * 0.025;
      jb.mid.rotation.x = x / 2; jb.mid.rotation.z = z / 2; jb.low.rotation.x = x; jb.low.rotation.z = z;
    }
    const nose = P("nose");
    if (nose) nose.rotation.x += Math.sin(age * 0.08 + seed) * 0.04;
    if (head) { head.rotation.z += Math.sin(age * 0.05 + seed * 2) * 0.03; if (rs.cast > 0) head.rotation.x -= 0.25 * rs.cast; }
  }
  if (model.rig === "ravager") {
    // positions too (the neck lunges): reset them to the model's
    for (const g of parts.values()) { const b = g.userData.basePos as THREE.Vector3 | undefined; if (b) g.position.copy(b); else g.userData.basePos = g.position.clone(); }
    const neck = P("neck"), mouth = P("mouth"), head = P("head"), body = P("body");
    const run = action === "run" || rs.rush > 0.5, walk = action !== "idle";
    const ls = run ? age * 0.75 : walk ? age * 0.55 : 0, amt = run ? 0.62 : walk ? 0.38 : 0;
    const sw = Math.cos(ls * 0.6662) * amt, an = Math.cos(ls * 0.6662 + Math.PI) * amt;
    const L = (n: string, v: number) => { const g = P(n); if (g) g.rotation.x += v; };
    L("right_hind_leg", sw); L("left_hind_leg", an); L("right_front_leg", an); L("left_front_leg", sw);
    // a heavy breath: the body heaves, the head nods with it, the jaw works a little
    const br = Math.sin(age * 0.09 + seed);
    if (body) body.rotation.x += br * 0.012;
    if (neck) { neck.position.y += br * 0.35 + (walk ? Math.abs(Math.sin(ls * 0.6662)) * 0.6 : 0); neck.rotation.x += br * 0.02; }
    let mouthX = Math.PI * 0.01 + (0.5 + 0.5 * Math.sin(age * 0.07 + seed)) * 0.04;
    if (neck && rs.bite >= 0) {
      // the game's attack tick (10 -> 0): jaw wide, then the neck lunges and the jaw snaps shut
      const i = rs.bite, tri = (Math.abs((i % 10) - 5) - 2.5) / 2.5, f1 = (1 + tri) * 0.5, f2 = f1 * f1 * f1 * 12;
      neck.position.z = -6.5 + f2;
      mouthX = i > 5 ? Math.sin((-4 + i) / 4) * Math.PI * 0.4 : 0.15707964 * Math.sin((Math.PI * i) / 10);
    }
    if (neck && rs.stun > 0) {
      const d0 = rs.stunTicks / 40;
      neck.position.x += Math.sin(d0 * 10) * 3 * rs.stun; neck.rotation.x += 0.21991149 * rs.stun;
      mouthX += (Math.PI * 0.05 - mouthX) * rs.stun;
      if (head) head.rotation.z += Math.sin(age * 0.3) * 0.08 * rs.stun;
    }
    if (rs.roar > 0) {
      // jaw wide, head up and shaking, front legs reaching as the body rears (Mob.tsx turns the body about the hind feet)
      mouthX += (1.15 - mouthX) * rs.roar;
      if (neck) neck.rotation.x -= 0.5 * rs.roar;
      if (head) { head.rotation.x -= 0.15 * rs.roar; head.rotation.y += Math.sin(age * 1.9) * 0.06 * rs.roar; }
      L("right_front_leg", -0.35 * rs.roar); L("left_front_leg", -0.25 * rs.roar);
      L("right_hind_leg", 0.18 * rs.roar); L("left_hind_leg", 0.18 * rs.roar);
    }
    if (rs.rush > 0 && neck) { neck.rotation.x += 0.32 * rs.rush; mouthX += 0.12 * rs.rush; }
    if (mouth) mouth.rotation.x += mouthX;
  }
  if (model.rig === "vex") {
    const body = P("body"), ra = P("right_arm"), la = P("left_arm"), rw = P("right_wing"), lw = P("left_wing"), head = P("head");
    const ch = rs.vexCharge;
    if (body) body.rotation.x += 0.15707964 * (1 - ch);
    const f = Math.cos(age * 0.0959931) * 0.1;
    if (ra) { ra.rotation.z += (Math.PI / 5 + f) * (1 - ch) + -0.47123888 * ch; ra.rotation.x += 3.6651914 * ch; ra.rotation.y += 0.2617994 * ch; }
    if (la) la.rotation.z += -(Math.PI / 5 + f);
    // the wings: VexModel's flap (45.8 deg / tick), a touch faster while charging
    const wy = 1.0995574 + Math.cos(age * (0.8 + 0.25 * ch)) * 0.28274334;
    if (rw) { rw.rotation.set(0.47123888, wy, 0.47123888, "ZYX"); }
    if (lw) { lw.rotation.set(0.47123888, -wy, -0.47123888, "ZYX"); }
    if (head && ch > 0) head.rotation.x -= 0.1 * ch;
  }
  if (model.rig === "villager" && rs.wave > 0) {
    // the villager's cheer: the crossed arms go up and rock, the head tips
    const arms = P("arms"), head = P("head"), t = rs.waveT, w = rs.wave;
    if (arms) { arms.rotation.x += -0.95 * w + 0.15 * Math.sin(t * 0.45) * w; arms.rotation.z += 0.18 * Math.sin(t * 0.45) * w; }
    if (head) { head.rotation.z += 0.12 * Math.sin(t * 0.45 + 0.6) * w; head.rotation.x -= 0.12 * w; }
  }
  void clampV;
};

/** the look angles [yaw, pitch] (rad, relative to the body; yaw + = to its left) from an eye point to a target */
export const lookAngles = (eye: THREE.Vector3, yawRad: number, target: [number, number, number]): [number, number] => {
  const d = new THREE.Vector3(...target).sub(eye).applyAxisAngle(new THREE.Vector3(0, 1, 0), -yawRad);
  return [Math.atan2(d.x, d.z), -Math.atan2(d.y, Math.hypot(d.x, d.z))];
};
