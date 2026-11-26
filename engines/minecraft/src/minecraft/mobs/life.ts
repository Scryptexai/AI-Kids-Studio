// Mob life beats, for every mob (any rig): spawn, hurt and the death poof, keyed in the shot's acts like the acting
// beats (direction.json "acts": {"<mob id>": [{"f": 1300, "kind": "spawn"}, ...]}). Pure (three-free), so the director's
// tests and the items agent can use it in Node.
//
//   spawn  f = the first frame it shows: it scales in about the feet 0.45 -> 1.05 -> 1.0 over ~10 f (fades in over the first 4 f), inside
//          a swirl of grey / white square smoke (vanilla spawner-ish) that rises round it and clears by f + 18.
//          Before f the mob is not drawn at all (no path "hidden" keys needed).
//   hurt   f = the hit: the game's red hurt overlay (full 5 f, gone by f + 12), a 3 f recoil, and a knockback shove of
//          `dist` blocks (default 0.3; 0 = none) away from `target` (the attacker's position; default straight back)
//          with a small hop. The shove stays (the mob ends where it was knocked to). Non-humanoid mobs (witch,
//          villager, creeper, animals) also take "hit" as "hurt" (on the zombie "hit" is its own attack).
//   poof   f = the killing hit: a hurt shove (dist default 0.2), red overlay, and it tips over sideways like the game's
//          death roll (to its `side`, default "r" = its right; about the edge of its body, so it lies ON the floor)
//          over `len` frames (default 10), then a white poof of square particles and it is gone. The poof frame is
//          f + len: that is when drops pop out (poofDrops; the act's `drop` names the item, the items agent draws it).
import type { Act } from "./acts";

export type V3 = [number, number, number];
/** a square particle: position (mob-local blocks: x = its left, y up, z forward; relative to the feet), edge size
 *  (blocks), grey level 0..1; `c` = an rgb colour 0..1 instead of the grey (mc-raid spell / totem motes) */
export type Puff = { p: V3; s: number; g: number; c?: V3 };
export type LifeState = {
  /** draw the body at all */
  visible: boolean;
  /** body scale about the feet, and its opacity (1 = opaque: the materials stay as they are) */
  scale: number; opacity: number;
  /** red hurt overlay 0..1 */
  red: number;
  /** death roll (rad, 0 .. pi/2) and the side it falls to (+1 = its left, -1 = its right) */
  roll: number; rollSide: 1 | -1;
  /** knockback so far, mob-local blocks [x (its left), z (forward)], and the hop / recoil this frame */
  shove: [number, number]; hop: number; recoil: number;
  /** particles this frame */
  puffs: Puff[];
};
/** the body's size in blocks (Mob.tsx measures it): half width (x, arms included), height */
export type BodySize = { hw: number; h: number };

export const LIFE_KINDS = ["spawn", "hurt", "poof"] as const;
/** the kinds this layer handles for a mob; "hit" counts as "hurt" on anything but a humanoid (zombie / player) */
export const lifeKind = (a: Act, humanoid: boolean): "spawn" | "hurt" | "poof" | null =>
  a.kind === "spawn" || a.kind === "hurt" || a.kind === "poof" ? a.kind : a.kind === "hit" && !humanoid ? "hurt" : null;

/** a stable random 0..1 from a seed and a channel */
export const rnd = (s: number, k: number) => { const x = Math.sin(s * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const c01 = (x: number) => Math.max(0, Math.min(1, x));
const sm = (x: number) => { const t = c01(x); return t * t * (3 - 2 * t); };
const over = (x: number, s = 1.7) => { const t = c01(x) - 1; return 1 + t * t * ((s + 1) * t + s); };
const outQ = (x: number) => 1 - (1 - c01(x)) ** 2;

export const POOF_LEN = 10;
/** the frame a poof act's particles burst and the body is gone */
export const poofFrame = (a: Act) => a.f + (a.len ?? POOF_LEN);

/** the knockback direction (mob-local [x, z], unit) for a hit from `target`: away from it, else straight back */
const awayFrom = (a: Act, at: V3, yawRad: number): [number, number] => {
  if (!a.target) return [0, -1];
  const dx = at[0] - a.target[0], dz = at[2] - a.target[2], d = Math.hypot(dx, dz);
  if (d < 1e-3) return [0, -1];
  // world -> mob-local (the mob faces +z after a yaw of yawRad about y)
  const c = Math.cos(yawRad), s = Math.sin(yawRad);
  return [(dx * c - dz * s) / d, (dx * s + dz * c) / d];
};

/** the life state of a mob this frame. `at` = its path position (for the knockback direction), yawRad its yaw. */
export const mobLife = (acts: Act[] | undefined, frame: number, at: V3, yawRad: number, size: BodySize, humanoid: boolean, seed = 0): LifeState | null => {
  const mine = (acts ?? []).map((a) => ({ a, k: lifeKind(a, humanoid) })).filter((x) => x.k) as { a: Act; k: "spawn" | "hurt" | "poof" }[];
  if (!mine.length) return null;
  const st: LifeState = { visible: true, scale: 1, opacity: 1, red: 0, roll: 0, rollSide: -1, shove: [0, 0], hop: 0, recoil: 0, puffs: [] };
  const R = Math.max(0.3, size.hw), H = size.h;
  mine.sort((x, y) => x.a.f - y.a.f);
  // a spawn hides the mob until it happens (the first spawn only; a later spawn after a poof brings it back)
  const firstSpawn = mine.find((x) => x.k === "spawn");
  if (firstSpawn && frame < firstSpawn.a.f) st.visible = false;
  for (const [i, { a, k }] of mine.entries()) {
    const t = frame - a.f, sd = seed * 7.13 + i * 101 + a.f;
    if (k === "spawn") {
      if (t >= 0) { st.visible = true; st.roll = 0; st.red = 0; }       // a respawn clears an earlier death
      if (t >= 0 && t < 12) { st.scale = 0.45 + 0.55 * over(t / 9, 2.2); st.opacity = sm(t / 4); }
      // the swirl: grey squares spiral up round the body and in toward it, shrinking out
      const n = 18;
      for (let j = 0; j < n; j++) {
        const b = -2 + rnd(sd, j) * 6, life = 10 + rnd(sd, j + 40) * 8, u = (t - b) / life;
        if (u < 0 || u > 1) continue;
        const a0 = (j / n) * Math.PI * 2 + rnd(sd, j + 80), ang = a0 + u * 2.6;
        const r = R * (1.45 - 0.7 * outQ(u)) * (0.8 + 0.4 * rnd(sd, j + 120));
        const y = H * (0.05 + 0.55 * rnd(sd, j + 160)) + 0.9 * u;
        st.puffs.push({ p: [Math.cos(ang) * r, y, Math.sin(ang) * r], s: (0.07 + 0.06 * rnd(sd, j + 200)) * (1 - u * u), g: 0.22 + 0.25 * rnd(sd, j + 240) });
      }
    } else {
      // hurt and poof: the shove, the red overlay, the recoil
      const dist = a.dist ?? (k === "poof" ? 0.2 : 0.3);
      if (t >= 0) {
        const d = awayFrom(a, at, yawRad), m = dist * outQ(t / 6);
        st.shove[0] += d[0] * m; st.shove[1] += d[1] * m;
        st.hop += dist > 0 ? 0.12 * Math.sin(Math.PI * c01(t / 6)) * Math.min(1, dist / 0.3) : 0;
        st.recoil += 0.14 * Math.sin(Math.PI * c01(t / 3)) * (t < 3 ? 1 : 0);
        st.red = Math.max(st.red, t < 5 ? 1 : 1 - sm((t - 5) / 7));
      }
      if (k === "poof") {
        const P = poofFrame(a), L = P - a.f;
        if (t >= 0) {
          st.rollSide = a.side === "l" ? 1 : -1;
          // the fall accelerates like the game's death roll (sqrt-eased there; here a gravity ease-in), a 3 f settle
          const u = c01(t / Math.max(1, L - 2));
          st.roll = (Math.PI / 2) * u * u - (t > L - 2 && t < L + 1 ? 0.06 * Math.sin(Math.PI * c01((t - L + 2) / 3)) : 0);
          st.red = 1;
        }
        if (frame >= P) st.visible = false;
        // the poof: white squares burst from where the body lies, drift out and up, shrink away
        const n = 24, side = a.side === "l" ? 1 : -1;
        for (let j = 0; j < n; j++) {
          const b = P - 1 + rnd(sd, j) * 3, life = 12 + rnd(sd, j + 40) * 10, u = (frame - b) / life;
          if (u < 0 || u > 1) continue;
          // the lying body: from the tip edge (x = side * R) along x for its height, about R high
          const x0 = side * (R + (rnd(sd, j + 80) * 0.9 + 0.05) * H - R * 0.2), y0 = 0.1 + rnd(sd, j + 120) * R * 1.4, z0 = (rnd(sd, j + 160) - 0.5) * 0.7;
          const ang = rnd(sd, j + 200) * Math.PI * 2, sp = 0.25 + 0.45 * rnd(sd, j + 240), e = outQ(u);
          st.puffs.push({ p: [x0 + Math.cos(ang) * sp * e, y0 + (0.35 + 0.4 * rnd(sd, j + 280)) * e, z0 + Math.sin(ang) * sp * e],
            s: (0.09 + 0.1 * rnd(sd, j + 320)) * (u < 0.15 ? 0.6 + 0.4 * (u / 0.15) : 1 - ((u - 0.15) / 0.85) ** 1.5), g: 0.5 + 0.3 * rnd(sd, j + 360) });
        }
      }
    }
  }
  return st;
};

/** where a poofing mob drops its loot, for the items agent (C4): one entry per poof act, at the poof frame, at the
 *  middle of the lying body (world blocks, on the floor at `at`'s height). `at` = the mob's path position at that
 *  frame, `facing` = its facing in degrees (as the path / set give it). `size` defaults to a 0.5 x 1.9 body. */
export type DropEvent = { f: number; at: V3; item: string | null; kind: "drop" };
export const poofDrops = (acts: Act[] | undefined, at: V3, facing: number, size: BodySize = { hw: 0.5, h: 1.9 }, humanoid = false): DropEvent[] => {
  const yawRad = (-facing * Math.PI) / 180, c = Math.cos(yawRad), s = Math.sin(yawRad);
  const out: DropEvent[] = [];
  const st = (f: number) => mobLife(acts, f, at, yawRad, size, humanoid);
  for (const a of acts ?? []) {
    if (a.kind !== "poof") continue;
    const P = poofFrame(a), side = a.side === "l" ? 1 : -1, sh = st(P)?.shove ?? [0, 0];
    const lx = sh[0] + side * (size.hw + size.h * 0.45), lz = sh[1];
    out.push({ f: P, at: [at[0] + lx * c + lz * s, at[1], at[2] - lx * s + lz * c], item: a.drop ?? null, kind: "drop" });
  }
  return out;
};
