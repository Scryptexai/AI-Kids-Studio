// CROWD (The Tapper): 60+ cheap extras from a few template mobs in the set (one hidden mob per skin: villagers and
// red-free player skins). Members stand on a jittered grid in an area, each with its own idle phase, facing jitter and
// look target, and act together on beats with a per-member stagger: cheer (arms up + hop), handsUp, clap (slow clap:
// alternating hand poses), press (lean in, reach toward a target: the press pack), stare, talk (murmur), wave, hop.
// A surge walks everyone toward an offset (staggered), caps fly up on a toss and land. Templates are hidden by McShort
// (hideTemplates). Pure function of the frame.
// itw-02 (actors): members can hold their family's item (a pickaxe from the template's staged item slots, or a block
// cube), walk single file along a path polyline (the switchback) facing each segment, and flee (a surge that turns
// them to run, panic arms, a height change downhill).
import React, { useMemo } from "react";
import * as THREE from "three";
import { KEY_FPS, useMcFrame } from "./mcTime";
import type { LoadedWorld } from "./VoxelWorld";
import type { Act, Joints } from "./mobs/acts";
import { Mob } from "./mobs/Mob";
import { modelFor } from "./mobs/models";
import { itemMesh } from "./props/Item";
import { fxItemTexture } from "./props/FxItems";
import { c01, rnd, smooth, type V3 } from "./fxCommon";
import { handCube } from "./props/HandCube";

export type CrowdBeat = {
  kind: "cheer" | "handsUp" | "clap" | "press" | "stare" | "talk" | "wave" | "hop";
  /** start frame (each member starts within `spread` frames after it, seeded) */
  f: number;
  /** frames held (default 30) */
  len?: number;
  /** stagger across members in frames (default 8) */
  spread?: number;
  /** look / reach target (press, stare; also the head target during the beat) */
  target?: V3;
  /** clap: frames between claps (default 10, slow clap 14+); cheer / hop: hop period (default 12) */
  every?: number;
  /** fraction of members that join (default 1) */
  share?: number;
};
export type CrowdSpec = {
  /** world mob ids used as skin templates (cycled through, seeded); hidden in the shot unless hideTemplates false */
  templates: string[];
  hideTemplates?: boolean;
  /** the floor rectangle members stand on: [x, z] corners; y = their feet height */
  area: { from: [number, number]; to: [number, number] }; y: number;
  /** member count (capped by the grid) */
  n: number;
  /** grid spacing in blocks (default 0.85) and position jitter (default 0.25 of the spacing) */
  spacing?: number; jitter?: number;
  /** facing (Minecraft yaw, deg) or a point they all face; facing jitter in degrees (default 18) */
  facing?: number; face?: V3; turn?: number;
  /** where heads look when no beat targets (default: the face point) */
  look?: V3;
  /** keep-out circles on the floor (actors, props): [x, z, radius] */
  clear?: [number, number, number][];
  seed?: number;
  beats?: CrowdBeat[];
  /** caps tossed up from random heads on f: n caps (default 10), colours (no red), landing on y */
  caps?: { f: number; n?: number; colors?: string[]; spread?: number };
  /** everyone walks by `to` [dx, dz] between f0 and f1 (staggered by up to 10 f); `run` for a rush */
  surge?: { to: [number, number]; f0: number; f1: number; run?: boolean;
    /** itw-02: feet height change over the move (downhill < 0), turn to face the move (default off), panic arms */
    dy?: number; face?: boolean; panic?: boolean };
  /** itw-02: per template id, the item its members hold in the right hand: "item/iron_pickaxe" (needs the template's
   *  staged item slot) or "block/cobblestone" (a cube); a list = a seeded pick per member. `holdShare` = fraction
   *  of members that hold one (default 1) */
  items?: Record<string, string | string[]>; holdShare?: number;
  /** itw-02: walk single file along a polyline (feet points) instead of standing in the area: member i starts `gap`
   *  blocks (default 1.1) behind member i-1 (queued back along the first segment), walks from f0 at `speed` blocks/s
   *  (default 1.6; run: 3.2) and stops in file at the end. Faces along the path; y follows the polyline */
  path?: { pts: V3[]; f0: number; speed?: number; gap?: number; run?: boolean; sway?: number };
  /** extra size per member: [min, max] scale (default [0.94, 1.04]) */
  sizes?: [number, number];
};

type Member = { at: V3; facing: number; t: number; seed: number; delay: number; join: number; scale: number; idx: number };

// ---------------------------------------------------------------- itw-02: path walking
const pathLen = (P: V3[]) => { let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]); return L; };
/** the point at distance d along the polyline (floor distance); before 0 it extends back along the first segment */
const pathAt = (P: V3[], d: number): V3 => {
  if (P.length < 2) return [...P[0]];
  if (d <= 0) {
    const a = P[0], b = P[1], l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    return [a[0] + ((b[0] - a[0]) / l) * d, a[1], a[2] + ((b[2] - a[2]) / l) * d];
  }
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], l = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (d <= l || i === P.length - 1) { const u = l > 0 ? Math.min(1, d / l) : 1; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]; }
    d -= l;
  }
  return [...P[P.length - 1]];
};
const yawFacing = (dx: number, dz: number) => (Math.atan2(-dx, dz) * 180) / Math.PI;
const lerpDeg = (a: number, b: number, k: number) => a + ((((b - a) % 360) + 540) % 360 - 180) * k;
/** a path member this frame: feet, walking, facing (eased round the corners: the heading 0.45 blocks ahead and behind) */
const pathMember = (s: CrowdSpec, m: Member, f: number): { at: V3; walk: boolean; facing: number } => {
  const p = s.path!, L = pathLen(p.pts), gap = p.gap ?? 1.1, v = p.speed ?? (p.run ? 3.2 : 1.6);
  const raw = ((f - p.f0) / KEY_FPS) * v - m.idx * gap, end = L - m.idx * gap;
  const d = Math.min(raw, end), walk = raw > -m.idx * gap && raw < end;
  const a = pathAt(p.pts, d - 0.45), b = pathAt(p.pts, d + 0.45);
  const at = pathAt(p.pts, d);
  // a little side-to-side drift in the file (seeded), never off a narrow path
  const sw = (p.sway ?? 0.08) * Math.sin(f * 0.05 + m.seed);
  const l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
  at[0] += (-(b[2] - a[2]) / l) * sw; at[2] += ((b[0] - a[0]) / l) * sw;
  return { at, walk, facing: yawFacing(b[0] - a[0], b[2] - a[2]) };
};

/** member placement (pure: also used to keep act targets / exclusions in sync) */
export const crowdMembers = (s: CrowdSpec): Member[] => {
  const [smin0, smax0] = s.sizes ?? [0.94, 1.04], seed0 = s.seed ?? 11;
  if (s.path) return Array.from({ length: s.n }, (_, i) => ({ at: [...s.path!.pts[0]] as V3, facing: 0, t: rnd(seed0 + i, 5) * 400, seed: (seed0 * 31 + i * 7) % 997, delay: rnd(seed0 + i, 6), join: rnd(seed0 + i, 7), scale: smin0 + (smax0 - smin0) * rnd(seed0 + i, 8), idx: i }));
  const sp = s.spacing ?? 0.85, jit = (s.jitter ?? 0.25) * sp, seed = s.seed ?? 11;
  const [x0, z0] = s.area.from, [x1, z1] = s.area.to;
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1), za = Math.min(z0, z1), zb = Math.max(z0, z1);
  const cells: [number, number, number][] = [];
  let row = 0;
  for (let z = za + sp / 2; z <= zb - sp / 4; z += sp, row++)
    for (let x = xa + sp / 2 + (row % 2 ? sp / 2 : 0); x <= xb - sp / 4; x += sp) {
      const i = cells.length, px = x + (rnd(seed + i, 1) - 0.5) * 2 * jit, pz = z + (rnd(seed + i, 2) - 0.5) * 2 * jit;
      if ((s.clear ?? []).some(([cx, cz, r]) => Math.hypot(px - cx, pz - cz) < r)) continue;
      cells.push([px, pz, rnd(seed + i, 3)]);
    }
  // pick n cells (seeded order), keep the grid's front-to-back order for draw stability
  const pick = cells.map((c, i) => ({ c, i, k: c[2] })).sort((a, b) => a.k - b.k).slice(0, s.n).sort((a, b) => a.i - b.i);
  const [smin, smax] = s.sizes ?? [0.94, 1.04];
  return pick.map(({ c, i }) => {
    const at: V3 = [c[0], s.y, c[1]];
    let facing = s.facing ?? 0;
    if (s.face) facing = (Math.atan2(-(s.face[0] - at[0]), s.face[2] - at[2]) * 180) / Math.PI;
    facing += (rnd(seed + i, 4) - 0.5) * 2 * (s.turn ?? 18);
    return { at, facing, t: rnd(seed + i, 5) * 400, seed: (seed * 31 + i * 7) % 997, delay: rnd(seed + i, 6), join: rnd(seed + i, 7), scale: smin + (smax - smin) * rnd(seed + i, 8), idx: i };
  });
};

const UP_R: Joints = { r_arm: [-2.85, 0.09, -0.28], r_elbow: -0.25, l_arm: [-2.85, -0.09, 0.28], l_elbow: -0.25 };
const CLAP_OPEN: Joints = { r_arm: [-1.15, -0.55, 0], r_elbow: -0.7, l_arm: [-1.15, 0.55, 0], l_elbow: -0.7 };
const CLAP_SHUT: Joints = { r_arm: [-1.2, -0.12, 0], r_elbow: -1.05, l_arm: [-1.2, 0.12, 0], l_elbow: -1.05 };
const PRESS: Joints = { r_arm: [-1.5, -0.2, 0], r_elbow: -0.3, l_arm: [-1.5, 0.2, 0], l_elbow: -0.3 };
// itw-02 flee: arms thrown up and back in turn
const PANIC_A: Joints = { r_arm: [-2.7, 0.1, -0.45], r_elbow: -0.35, l_arm: [-0.9, -0.1, 0.55], l_elbow: -0.9 };
const PANIC_B: Joints = { r_arm: [-0.9, 0.1, -0.55], r_elbow: -0.9, l_arm: [-2.7, -0.1, 0.45], l_elbow: -0.35 };

/** the item a member holds (itw-02), or null */
const memberItem = (s: CrowdSpec, m: Member, tplId: string): string | null => {
  const it = s.items?.[tplId];
  if (!it || rnd(m.seed, 31) > (s.holdShare ?? 1)) return null;
  return Array.isArray(it) ? it[Math.floor(rnd(m.seed, 32) * it.length)] ?? null : it;
};

/** the acts one member plays for the crowd's beats */
const memberActs = (s: CrowdSpec, m: Member): Act[] => {
  const acts: Act[] = [];
  for (const b of s.beats ?? []) {
    if (m.join > (b.share ?? 1)) continue;
    const f = Math.round(b.f + m.delay * (b.spread ?? 8)), len = b.len ?? 30;
    switch (b.kind) {
      case "cheer": case "handsUp":
        // a pump: arms up with a little wave between two heights
        acts.push({ f, kind: "pose", len, joints: UP_R, ein: 5, eout: 9 });
        if (b.kind === "cheer") for (let k = 6; k < len - 6; k += 12) acts.push({ f: f + k, kind: "pose", len: 0, ein: 4, eout: 4, amt: 0.35, joints: { r_arm: [0.6, 0, 0], l_arm: [0.6, 0, 0] } });
        break;
      case "clap": {
        const ev = b.every ?? 10;
        acts.push({ f, kind: "pose", len: 0, ein: 5, eout: Math.max(2, ev / 2), joints: CLAP_OPEN });
        let k = 0;
        for (let t = f + ev / 2; t < f + len; t += ev / 2, k++) acts.push({ f: Math.round(t), kind: "pose", len: 0, ein: Math.max(2, ev / 2), eout: Math.max(2, ev / 2), joints: k % 2 ? CLAP_OPEN : CLAP_SHUT });
        break;
      }
      case "press":
        acts.push({ f, kind: "pose", len, joints: PRESS, ein: 6, eout: 10 });
        break;
      case "talk": acts.push({ f, kind: "talk", len }); break;
      case "wave": acts.push({ f, kind: "wave", len, side: m.join > 0.5 ? "l" : "r" }); break;
      default: break;
    }
  }
  // itw-02 flee: panic arms through the surge (anticipation: a flinch back first), alternating every 7 f
  const sg = s.surge;
  if (sg?.panic) {
    const f0 = Math.round(sg.f0 + m.delay * 10);
    acts.push({ f: f0 - 2, kind: "pose", len: 0, ein: 5, eout: 4, joints: { r_arm: [-0.6, 0, -0.5], r_elbow: -1.2, l_arm: [-0.6, 0, 0.5], l_elbow: -1.2 } });
    let k = 0;
    for (let t = f0 + 3; t < sg.f1 + 10; t += 7, k++) acts.push({ f: t, kind: "pose", len: 0, ein: 4, eout: 4, joints: k % 2 ? PANIC_B : PANIC_A });
  }
  return acts;
};

/** the member this frame: feet (with hops and the surge), walking, look target */
const memberAt = (s: CrowdSpec, m: Member, f: number): { at: V3; walk: boolean; look: V3 | null; tilt?: [number, number]; facing: number } => {
  let at: V3 = [...m.at], facing = m.facing;
  let walk = false, look: V3 | null = s.look ?? s.face ?? null, tilt: [number, number] | undefined;
  if (s.path) { const pm = pathMember(s, m, f); at = pm.at; walk = pm.walk; facing = pm.facing; if (!s.look) look = null; }
  if (s.surge) {
    const d = m.delay * 10, span = Math.max(1, s.surge.f1 - s.surge.f0), k = c01((f - s.surge.f0 - d) / span);
    at[0] += s.surge.to[0] * smooth(k); at[2] += s.surge.to[1] * smooth(k); at[1] += (s.surge.dy ?? 0) * k;
    walk = walk || (k > 0 && k < 1);
    // turn to run (from 6 f before the start), heads forward while running
    if (s.surge.face) {
      const tk = smooth(c01((f - s.surge.f0 - d + 6) / 6));
      facing = lerpDeg(facing, yawFacing(s.surge.to[0], s.surge.to[1]), tk);
      if (tk > 0.5 && k < 1) look = null;
    }
  }
  for (const b of s.beats ?? []) {
    if (m.join > (b.share ?? 1)) continue;
    const f0 = b.f + m.delay * (b.spread ?? 8), len = b.len ?? 30, u = f - f0;
    if (u < 0 || u > len) continue;
    if (b.target) look = b.target;
    if (b.kind === "cheer" || b.kind === "hop") {
      const ev = b.every ?? 12, ph = ((u + m.delay * ev) % ev) / ev;
      at[1] += 0.22 * Math.sin(Math.PI * ph) ** 2 * (b.kind === "hop" ? 1.3 : 1);
    }
    if (b.kind === "press") tilt = [14 * smooth(Math.min(u / 6, (len - u) / 10, 1)), 0];
  }
  return { at, walk, look, tilt, facing };
};

const MemberMob: React.FC<{ lw: LoadedWorld; tpl: LoadedWorld["world"]["mobs"][number]; s: CrowdSpec; m: Member; acts: Act[]; frame: number }> = ({ lw, tpl, s, m, acts: acts0, frame }) => {
  // itw-02: the family item: a pickaxe from the template's item slots (a hold act), or a block cube in the fist
  const item = memberItem(s, m, tpl.id);
  const cube = useMemo(() => (item?.startsWith("block/") ? handCube(item, lw) : null), [item, lw]);
  const acts = useMemo(() => (item && !cube ? [...acts0, { f: -100000, kind: "hold", item, ein: 0 } as Act] : acts0), [acts0, item, cube]);
  const model = modelFor(tpl.mob, tpl.textures[0]);
  const skin = useMemo(() => tpl.textures.map((t) => lw.textures[t]), [tpl, lw]);
  const slots = useMemo(() => tpl.slots.map((t) => lw.textures[t]), [tpl, lw]);
  const st = memberAt(s, m, frame);
  const look = useMemo(() => (st.look ? new THREE.Vector3(...st.look) : null), [st.look?.[0], st.look?.[1], st.look?.[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!model) return null;
  const humanoid = model.rig === "humanoid";
  const age = (frame / KEY_FPS) * 20 + m.t;
  const body = <Mob model={model} skin={skin} slots={slots} at={st.at} facing={st.facing} baby={tpl.baby} tilt={st.tilt} held={humanoid ? cube : null} grip={cube ? "block" : undefined}
    pose={{ age, action: st.walk ? (s.surge?.run || s.path?.run ? "run" : "walk") : "idle", seed: m.seed, look, acts: humanoid ? acts : undefined, frame }} />;
  return m.scale === 1 ? body : <group position={st.at} scale={m.scale}><group position={[-st.at[0], -st.at[1], -st.at[2]]}>{body}</group></group>;
};

const Caps: React.FC<{ s: CrowdSpec; members: Member[]; frame: number }> = ({ s, members, frame }) => {
  const c = s.caps!, n = Math.min(c.n ?? 10, members.length), cols = c.colors ?? ["#3f6fbf", "#2f8f5b", "#e8c34a", "#f2efe6", "#7a5230", "#6a4fb0"];
  const objs = useMemo(() => Array.from({ length: n }, (_, i) => itemMesh(fxItemTexture("cap", cols[i % cols.length]), 0.5, [0, 8])), [n]); // eslint-disable-line react-hooks/exhaustive-deps
  const out: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const m = members[Math.floor(rnd(i + 3, 91) * members.length)];
    const f0 = c.f + rnd(i, 92) * (c.spread ?? 6), u = (frame - f0) / KEY_FPS;
    if (u < 0) continue;
    const vy = 7 + 2.5 * rnd(i, 93), vx = (rnd(i, 94) - 0.5) * 1.6, vz = (rnd(i, 95) - 0.5) * 1.6, G = 14;
    const y0 = m.at[1] + 1.9 * m.scale, tLand = (vy + Math.sqrt(vy * vy + 2 * G * (y0 - s.y - 0.05))) / G, t = Math.min(u, tLand);
    const p: V3 = [m.at[0] + vx * t, y0 + vy * t - 0.5 * G * t * t, m.at[2] + vz * t];
    const spin = t * (9 + 6 * rnd(i, 96));
    const rot: V3 = u >= tLand ? [-Math.PI / 2, rnd(i, 97) * 6, 0] : [spin * 0.6, spin, spin * 0.3];
    out.push(<group key={i} position={p} rotation={rot}><primitive object={objs[i]} /></group>);
  }
  return <>{out}</>;
};

const CrowdOne: React.FC<{ s: CrowdSpec; lw: LoadedWorld }> = ({ s, lw }) => {
  const frame = useMcFrame();
  const members = useMemo(() => crowdMembers(s), [s]);
  const tpls = useMemo(() => s.templates.map((id) => lw.world.mobs.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m), [s, lw]);
  const acts = useMemo(() => members.map((m) => memberActs(s, m)), [s, members]);
  if (!tpls.length) return null;
  return (
    <>
      {members.map((m, i) => <MemberMob key={i} lw={lw} tpl={tpls[Math.floor(rnd(m.seed, 9) * tpls.length)]} s={s} m={m} acts={acts[i]} frame={frame} />)}
      {s.caps && <Caps s={s} members={members} frame={frame} />}
    </>
  );
};

export const Crowds: React.FC<{ specs: CrowdSpec[]; lw: LoadedWorld }> = ({ specs, lw }) => <>{specs.map((s, i) => <CrowdOne key={i} s={s} lw={lw} />)}</>;

/** template mob ids to hide in the shot */
export const crowdTemplates = (specs: CrowdSpec[] | undefined) => new Set((specs ?? []).filter((s) => s.hideTemplates !== false).flatMap((s) => s.templates));
