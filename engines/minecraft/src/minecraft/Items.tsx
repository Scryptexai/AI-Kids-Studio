// Wave B (mc-cobblegen) C4: item entities, the game's dropped items. An item is its sprite extruded one pixel (half a
// block wide) or, for a block, a quarter-size cube; on the ground it spins (~1 rad/s) and bobs (0 .. 0.2 above the floor,
// period ~3 s) like vanilla's ItemEntityRenderer, so it never dips into the floor. Life (all pure functions of the
// fractional KEY frame, so it is smooth at 60 fps):
//   pop out   a toss from the mined cell's centre (or `from`) up `arc` and over to `land`, then two small bounces
//   moves     slide along the floor, fall off an edge (slides to the edge, drops under gravity, one bounce), or hop
//   burn      touches lava: a hop, flames on it, it chars and sinks with a fizz (smoke puff, dark squares, sparks); gone
//   pickup    flies into an actor's body (followed while it moves), easing in, and is gone
//   ghost     the imagined look (ghost.ts): floats from `from` to `land` with no gravity, hovers, fades in and out
// Mob drops: McShort turns every poof act with a `drop` into an entry here (mobs/life.ts poofDrops).
import React, { useMemo } from "react";
import * as THREE from "three";
import { KEY_FPS, useMcFrame } from "./mcTime";
import { blockObject } from "./Actors";
import { itemMesh } from "./props/Item";
import { Motes, SmokePuff, protoOf, type Mote, type WorldMap } from "./Build";
import { SmokeSq } from "./Fire";
import { stepFx, type FxTex } from "./fxTextures";
import { ghostOf } from "./ghost";
import type { LoadedWorld } from "./VoxelWorld";
import type { CBlock, ItemSpec } from "./types";
import { boxMesh } from "./mobs/boxMesh";
import { BANNER_BASE } from "./mobs/models";
import { ominousFlagTexture, selfLit } from "./ominousBanner";
import { ominousBannerTexture } from "./props/Banner";
import type { RaidTex } from "./RaidFx";

type V3 = [number, number, number];
const c01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const k = c01(v); return k * k * (3 - 2 * k); };
const rnd = (i: number, k: number) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** an item entry with everything resolved (a mob drop merged in) */
export type LiveItem = ItemSpec & { item: string; f: number; seed: number };
/** a mob's poof drop, from mobs/life.ts poofDrops */
export type MobDrop = { mob: string; f: number; at: V3; item: string };

/** the spec list plus the mob drops (an entry with `mob` takes that drop's frame / place / item) */
export const liveItems = (specs: ItemSpec[] | undefined, drops: MobDrop[]): LiveItem[] => {
  const out: LiveItem[] = [], used = new Set<MobDrop>();
  (specs ?? []).forEach((s, i) => {
    if (s.mob) {
      const d = drops.find((x) => x.mob === s.mob && !used.has(x) && (s.f === undefined || Math.abs(x.f - s.f) < 1));
      if (!d) return;
      used.add(d);
      out.push({ ...dropEntry(d), ...s, item: s.item ?? d.item, f: s.f ?? d.f, seed: 101 + i * 37 });
      return;
    }
    if (!s.item || s.f === undefined) return;
    out.push({ ...s, item: s.item, f: s.f, seed: 101 + i * 37 });
  });
  drops.forEach((d, i) => { if (!used.has(d)) out.push({ ...dropEntry(d), seed: 911 + i * 53 }); });
  return out;
};
const dropEntry = (d: MobDrop) => ({ item: d.item, f: d.f, from: [d.at[0], d.at[1] + 0.35, d.at[2]] as V3, land: d.at, arc: 0.4 });

// ---------------------------------------------------------------- motion (pure)
/** where it starts and where it lands (bottom points) */
const ends = (s: LiveItem): { o: V3; land: V3 } => {
  const o: V3 = s.cell ? [s.cell[0] + 0.5, s.cell[1] + 0.35, s.cell[2] + 0.5] : s.from ?? s.land ?? [0, 0, 0];
  const land: V3 = s.land ?? (s.cell ? [s.cell[0] + 0.5 + (rnd(s.seed, 1) - 0.5) * 0.3, s.cell[1], s.cell[2] + 0.5 + (rnd(s.seed, 2) - 0.5) * 0.3] : o);
  return { o, land };
};
const tossLen = (s: LiveItem, o: V3, land: V3) => s.toss ?? (s.ghost ? 12 : Math.round(8 + 6 * Math.sqrt(Math.max(0, o[1] - land[1]))));

/** one frame of an item: bottom point (before the bob), bob weight, scale, opacity, the burn age (or null) */
export type ItemPose = { p: V3; bob: number; scale: number; opacity: number; burn: number | null; char: number };

/** the path without burn / pickup / until (resting point, bounces, moves) */
const pathPose = (s: LiveItem, f: number): { p: V3; bob: number } => {
  const { o, land } = ends(s);
  const T = tossLen(s, o, land), u = (f - s.f) / T;
  if (s.ghost) {
    const e = smooth(u);
    return { p: lerp3(o, land, e), bob: 1 };
  }
  // toss: a parabola from o with its apex `arc` above o, landing just short of `land` (the last bounce carries it there)
  const dx = land[0] - o[0], dz = land[2] - o[2], dh = Math.hypot(dx, dz), carry = dh > 0.05 ? Math.min(0.1, dh * 0.3) : 0;
  const L0: V3 = dh > 0.05 ? [land[0] - (dx / dh) * carry, land[1], land[2] - (dz / dh) * carry] : land;
  if (u < 1) {
    const arc = s.arc ?? 0.45, d = o[1] - L0[1], A = Math.max(0.05, arc), v0 = 2 * A + 2 * Math.sqrt(Math.max(0, A * (A + d))), g = v0 + d;
    return { p: [o[0] + (L0[0] - o[0]) * u, o[1] + v0 * u - g * u * u, o[2] + (L0[2] - o[2]) * u], bob: 0 };
  }
  // two small bounces, carrying it the last bit to `land`, then the bob fades in
  const tb = f - s.f - T;
  let p: V3 = lerp3(L0, land, 1 - (1 - c01(tb / 8)) ** 2);
  p[1] += tb < 5 ? 0.13 * Math.sin((Math.PI * tb) / 5) : tb < 8 ? 0.04 * Math.sin((Math.PI * (tb - 5)) / 3) : 0;
  let bob = smooth((tb - 8) / 10);
  // moves, in order, each from where the last one left it
  for (const m of s.moves ?? []) {
    if (f < m.f) break;
    const from = p, to = m.to as V3, dist = Math.hypot(to[0] - from[0], to[2] - from[2]);
    const len = m.len ?? Math.max(6, Math.round(dist * 12)), kind = m.kind ?? (to[1] < from[1] - 0.1 ? "fall" : "slide");
    const v = (f - m.f) / len;
    if (v < 1) {
      if (kind === "slide") return { p: lerp3(from, to, smooth(v)), bob };
      if (kind === "hop") { const q = lerp3(from, to, v); q[1] += 4 * 0.35 * v * (1 - v); return { p: q, bob }; }
      // fall: slides to the edge (easing into motion), then keeps its speed over the edge and drops under gravity
      // `edge` = the fraction of the way where the floor ends; a short ease-in start, then constant speed
      const e0 = m.edge ?? 0.45, a0 = 0.15, k = v < a0 ? (v * v) / (2 * a0) : v - a0 / 2, kk = k / (1 - a0 / 2);
      const q = lerp3(from, to, kk);
      q[1] = kk < e0 ? from[1] : from[1] - (from[1] - to[1]) * ((kk - e0) / (1 - e0)) ** 2;
      return { p: q, bob };
    }
    p = [to[0], to[1], to[2]];
    if (kind !== "slide") { const tb2 = f - m.f - len; p[1] += tb2 < 4 ? 0.08 * Math.sin((Math.PI * tb2) / 4) : 0; }
    bob = Math.min(bob, kind === "slide" ? 1 : smooth((f - m.f - len - 4) / 8));
  }
  return { p, bob };
};

/** the vanilla bob (0 .. 0.2) and spin at a key frame */
const bobAt = (s: LiveItem, f: number) => { const ticks = (f * 20) / KEY_FPS, ph = rnd(s.seed, 3) * Math.PI * 2; return s.ghost ? 0.08 * (1 + Math.sin(ticks / 14 + ph)) : 0.1 * (1 + Math.sin(ticks / 10 + ph)); };
const spinAt = (s: LiveItem, f: number) => s.spin === 0 ? (s.yaw ?? 0) : ((f * 20) / KEY_FPS / 20) * (s.spin ?? (s.ghost ? 0.5 : 1)) + rnd(s.seed, 4) * Math.PI * 2;

/** the full pose: path, then burn / pickup / until; null = not there */
export const itemPose = (s: LiveItem, f: number, actorAt: (id: string, f: number) => V3 | null): ItemPose | null => {
  if (f < s.f) return null;
  const size = s.size ?? 1;
  const fade = s.ghost ? smooth((f - s.f) / 6) : 1;
  const pop = s.ghost ? 0.8 + 0.2 * smooth((f - s.f) / 6) : 0.55 + 0.45 * smooth((f - s.f) / 3);
  // burn: frozen where it touched the lava, a hop, then it sinks and shrinks away
  if (s.burn !== undefined && f >= s.burn) {
    const u = f - s.burn;
    if (u >= 12) return null;
    const at = pathPose(s, s.burn), b0 = at.bob * bobAt(s, s.burn);
    const p: V3 = [at.p[0], at.p[1] + b0 + (u < 5 ? 0.16 * Math.sin((Math.PI * u) / 5) : 0) - 0.32 * smooth((u - 4) / 8), at.p[2]];
    return { p, bob: 0, scale: size * (1 - smooth((u - 4) / 8)), opacity: 1, burn: u, char: smooth(u / 7) };
  }
  // pickup: from where it is to the actor's body, easing in (slow start, fast arrival)
  if (s.pickup && f >= s.pickup.f) {
    const len = s.pickup.len ?? 5, u = (f - s.pickup.f) / len;
    if (u >= 1) return null;
    const at = pathPose(s, s.pickup.f), b0 = at.bob * bobAt(s, s.pickup.f);
    const start: V3 = [at.p[0], at.p[1] + b0, at.p[2]];
    const a = actorAt(s.pickup.by, f);
    const tgt: V3 = a ? [a[0], a[1] + (s.pickup.height ?? 0.9) - 0.25 * size, a[2]] : start;
    const e = u * u, p = lerp3(start, tgt, e);
    p[1] += 0.18 * Math.sin(Math.PI * u);
    return { p, bob: 0, scale: size * (1 - 0.35 * u), opacity: 1, burn: null, char: 0 };
  }
  const at = pathPose(s, f);
  let scale = size * pop, opacity = fade;
  if (s.until !== undefined && f >= s.until) {
    const u = f - s.until;
    if (s.ghost) { opacity *= 1 - smooth(u / 10); if (u >= 10) return null; }
    else { scale *= 1 - smooth(u / 3); if (u >= 3) return null; }
  }
  return { p: at.p, bob: at.bob, scale, opacity, burn: null, char: 0 };
};

// ---------------------------------------------------------------- objects
const cubeOf = (id: string): CBlock => ({
  key: `fx:${id}`, id, shape: "cube", layer: "opaque", tint: null, rotX: 0, rotY: 0, light: 0, positions: [],
  elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: Object.fromEntries((["down", "up", "north", "south", "west", "east"] as const).map((d) => [d, { tex: `block/${id}`, uv: [0, 0, 16, 16] as [number, number, number, number] }])) }],
});
const flatCache = new Map<string, THREE.Group>(), cubeCache = new Map<string, THREE.Group>();
/** the dropped ominous banner (mc-raid): the banner model (flag 20x40, bar, pole; 44 px tall) shrunk to half a block
 *  tall like the game's banner item on the ground, centred on its origin. Flag from the staged raid textures (`rt`,
 *  the standing banner's), else the head banner's composite from any loaded set or fx texture; null when neither */
const bannerItem = (lw: LoadedWorld, worlds: WorldMap, fx: FxTex, rt?: RaidTex): THREE.Group | null => {
  let flagTex: THREE.Texture | null = rt ? ominousFlagTexture((k) => rt.img[k], rt.img) : null, wood = flagTex ? rt?.tex[BANNER_BASE] ?? null : null;
  if (!flagTex) {
    const get = (k: string) => lw.textures[k] ?? Object.values(worlds).map((w) => w.textures[k]).find(Boolean) ?? fx.tex[k];
    flagTex = wood = ominousBannerTexture(get);
  }
  if (!flagTex) return null;
  const key = `banner:${flagTex.uuid}:${wood?.uuid ?? ""}`;
  let g = flatCache.get(key);
  if (!g) {
    const flag = boxMesh([{ uv: [0, 0], o: [-10, -32, -2], s: [20, 40, 1] }], flagTex, 64, 64);
    selfLit(flag.material as THREE.MeshLambertMaterial);
    const parts: THREE.Object3D[] = [flag];
    if (wood) parts.push(boxMesh([{ uv: [44, 0], o: [-1, -30, -1], s: [2, 42, 2] }], wood, 64, 64), boxMesh([{ uv: [0, 42], o: [-10, -32, -1], s: [20, 2, 2] }], wood, 64, 64));
    const k = 0.5 / 44, model = new THREE.Group();
    // model pixels are y down; top (bar) at -32, foot of the pole at +12, so its middle is -10
    model.scale.set(k, -k, -k); model.position.y = -10 * k; model.add(...parts);
    g = new THREE.Group(); g.add(model); flatCache.set(key, g);
  }
  return g;
};
/** the item's object centred on its origin (flat: 0.5 wide; block: a 0.25 cube), or null when nothing draws it.
 *  `ominous_banner` is the banner model (bannerItem) */
export const itemObject = (id: string, lw: LoadedWorld, worlds: WorldMap, fx: FxTex, rt?: RaidTex): { obj: THREE.Object3D; flat: boolean } | null => {
  if (id === "ominous_banner") { const b = bannerItem(lw, worlds, fx, rt); if (b) return { obj: b.clone(), flat: true }; }
  const key = `item/${id}`;
  const tex = fx.tex[key] ?? lw.textures[key] ?? Object.values(worlds).map((w) => w.textures[key]).find(Boolean);
  if (tex) {
    let g = flatCache.get(`${tex.uuid}`);
    if (!g) { g = itemMesh(tex, 0.5, [0, 8]); flatCache.set(`${tex.uuid}`, g); }
    return { obj: g.clone(), flat: true };
  }
  for (const w of [lw, ...Object.values(worlds)]) {
    const b = w.world.blocks.find((x) => x.id === id && x.shape === "cube");
    if (b) { const o = protoOf(b, w, lw).clone(); o.scale.setScalar(0.25); o.position.y = -0.125; const g = new THREE.Group(); g.add(o); return { obj: g, flat: false }; }
  }
  if (fx.tex[`block/${id}`]) {
    let g = cubeCache.get(id);
    if (!g) { const o = blockObject(cubeOf(id), fx.tex); o.scale.setScalar(0.25); o.position.y = -0.125; g = new THREE.Group(); g.add(o); cubeCache.set(id, g); }
    return { obj: g.clone(), flat: false };
  }
  return null;
};

/** own (cloned) materials, so one item can char / fade without touching the shared ones */
const ownMaterials = (obj: THREE.Object3D) => {
  const mats: THREE.MeshLambertMaterial[] = [];
  obj.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = Array.isArray(m.material) ? m.material.map((q) => q.clone()) : m.material.clone();
    mats.push(...((Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshLambertMaterial[]));
  });
  return mats;
};

const FIRE_GEO = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
const CHAR = new THREE.Color("#2a140c"), WHITE = new THREE.Color("#ffffff");

/** one item entity drawn at a pose (also used by the ghost piston's floating parts) */
export const ItemBody: React.FC<{ s: LiveItem; pose: ItemPose; frame: number; made: Made; fx: FxTex }> = ({ s, pose, frame, made, fx }) => {
  const bob = pose.bob * bobAt(s, frame);
  const c: V3 = [pose.p[0], pose.p[1] + 0.25 * pose.scale + bob, pose.p[2]];
  if (made.ghost) made.ghost.set(pose.opacity * 0.75);
  for (const m of made.mats) { m.color.copy(WHITE).lerp(CHAR, pose.char * 0.85); }
  const nodes: React.ReactNode[] = [
    <group key="it" position={c} rotation={[0, spinAt(s, frame), 0]} scale={Math.max(0.001, pose.scale)}>
      <primitive object={made.obj} />
    </group>,
  ];
  if (made.ghost && pose.opacity > 0.01) nodes.push(
    <sprite key="halo" position={c} scale={[0.9 * pose.scale, 0.9 * pose.scale, 1]} renderOrder={29}>
      <spriteMaterial map={haloTex()} color="#dfe8ff" transparent opacity={0.28 * pose.opacity} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </sprite>,
  );
  if (pose.burn !== null) {
    const u = pose.burn, k = (u < 2 ? u / 2 : 1) * (1 - smooth((u - 7) / 4));
    const t = stepFx(fx, "block/fire_0", frame, KEY_FPS);
    if (k > 0.02 && t) for (let j = 0; j < 2; j++) nodes.push(
      <mesh key={`fl${j}`} geometry={FIRE_GEO} position={[c[0], pose.p[1] - 0.02, c[2]]} rotation={[0, j * Math.PI / 2 + 0.6, 0]} scale={[0.42 * k, 0.55 * k * (0.9 + 0.1 * Math.sin(frame * 2.1 + j)), 1]} renderOrder={12}>
        <meshBasicMaterial map={t} alphaTest={0.5} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>,
    );
  }
  return <>{nodes}</>;
};

const haloTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const g = cv.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,0.9)"); r.addColorStop(0.45, "rgba(255,255,255,0.25)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    t = new THREE.CanvasTexture(cv); return t;
  };
})();
export { haloTex };

export type Made = { obj: THREE.Object3D; mats: THREE.MeshLambertMaterial[]; ghost: ReturnType<typeof ghostOf> | null };
/** build an item's drawable once (own materials; a ghost copy for imagined items) */
export const makeItem = (id: string, ghost: boolean, lw: LoadedWorld, worlds: WorldMap, fx: FxTex, rt?: RaidTex): Made | null => {
  const r = itemObject(id, lw, worlds, fx, rt);
  if (!r) return null;
  if (ghost) { const g = ghostOf(r.obj, { sat: 0.45 }); return { obj: g.obj, mats: [], ghost: g }; }
  return { obj: r.obj, mats: ownMaterials(r.obj), ghost: null };
};

/** the burn fizz: a smoke puff, dark smoke squares rising, two lava sparks */
const fizz = (key: string, at: V3, u: number, seed: number, fx: FxTex, motes: Mote[]): React.ReactNode => {
  const nodes: React.ReactNode[] = [];
  nodes.push(<SmokePuff key="p" fx={fx} at={[at[0], at[1] + 0.15, at[2]]} u={u - 2} seed={seed} life={22} rise={1.1} size={0.75} color="#d9d6d2" opacity={0.85} />);
  for (let j = 0; j < 6; j++) {
    const b = j * 1.6, a = (u - b) / 14;
    if (a < 0 || a >= 1) continue;
    const ang = rnd(seed, j) * Math.PI * 2, r = 0.08 + 0.22 * rnd(seed, j + 7) * a;
    nodes.push(<SmokeSq key={`q${j}`} fx={fx} k={a} size={0.12 + 0.06 * rnd(seed, j + 3)} grey={0.18 + 0.15 * rnd(seed, j + 5)}
      at={[at[0] + Math.cos(ang) * r, at[1] + 0.2 + a * (0.7 + 0.4 * rnd(seed, j + 9)), at[2] + Math.sin(ang) * r]} />);
  }
  for (let j = 0; j < 2; j++) {
    const t = u / 30, ang = rnd(seed, j + 20) * Math.PI * 2, sp = 0.6 + 0.5 * rnd(seed, j + 21), up = 2.2 + rnd(seed, j + 22);
    const y = at[1] + 0.1 + up * t - 0.5 * 16 * t * t;
    if (u < 0 || y < at[1] - 0.05) continue;
    motes.push({ p: [at[0] + Math.cos(ang) * sp * t, y, at[2] + Math.sin(ang) * sp * t], s: 0.05, c: j ? "#ffd04a" : "#ff7a1a" });
  }
  return <React.Fragment key={key}>{nodes}</React.Fragment>;
};

/** every item entity of a shot. actorAt(id, f) = that actor's feet this frame (for pickups) */
export const Items: React.FC<{ items: LiveItem[]; lw: LoadedWorld; worlds: WorldMap; fx: FxTex; actorAt: (id: string, f: number) => V3 | null; rt?: RaidTex }> = ({ items, lw, worlds, fx, actorAt, rt }) => {
  const frame = useMcFrame();
  const made = useMemo(() => items.map((s) => makeItem(s.item, !!s.ghost, lw, worlds, fx, rt)), [items, lw, worlds, fx, rt]);
  const nodes: React.ReactNode[] = [], motes: Mote[] = [];
  items.forEach((s, i) => {
    const m = made[i];
    const pose = itemPose(s, frame, actorAt);
    if (m && pose) nodes.push(<ItemBody key={`i${i}`} s={s} pose={pose} frame={frame} made={m} fx={fx} />);
    if (s.burn !== undefined && frame >= s.burn && frame < s.burn + 26) {
      const at = pathPose(s, s.burn).p;
      nodes.push(fizz(`z${i}`, at, frame - s.burn, s.seed, fx, motes));
    }
  });
  return <>{nodes}<Motes motes={motes} lit={false} /></>;
};
