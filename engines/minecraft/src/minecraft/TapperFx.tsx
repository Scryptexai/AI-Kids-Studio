// The Tapper's fx layer, in one place so McShort only wires it once. Per-shot fields (direction.json, see
// projects/itw-01/FX.md for every field with an example) live in TapperFxDir and are drawn here:
//   in the 3D scene (TapperLayers):  cracks, drips / trickles / sprays (Water.tsx), texts / signs (BlockText.tsx),
//     books (Book.tsx), glints (Glint.tsx), crowds (Crowd.tsx), beams (light shafts that follow the day/night cycle),
//     sunDisc (a square sun / moon riding the `cycle`), curtains (a vine curtain that parts), fishLines (line + bobber),
//     held fx items' light (torch / lantern)
//   into BlockFx: ripples (a ring of SOLID tap flashes running out from a point, both ways along a wall)
//   on the world: fxProps / "fx:<name>" held items (props/FxItems.ts sprites), crowd templates hidden, actor sizes
//   on the picture (TapperScreen): flashback (warm faded grade, no card), whip (8 f directional blur), memories
//     (a soft double-exposed sign behind a close-up)
// Every piece is a pure function of the (key) frame.
import React from "react";
import { AbsoluteFill } from "remotion";
import * as THREE from "three";
import { useMcFrame } from "./mcTime";
import type { LoadedWorld } from "./VoxelWorld";
import { cycleLook, SKY } from "./VoxelWorld";
import { keyed, keysAt, heldAt, pathAt, type ShotDirection } from "./direction";
import type { BlockFxSpec } from "./BlockFx";
import type { MobCue } from "./Actors";
import { Cracks, type CrackSpec } from "./Crack";
import { Water, type DripSpec, type SpraySpec, type TrickleSpec } from "./Water";
import { BlockTexts, signImage, type SignSpec, type TextSpec } from "./BlockText";
import { Book, type BookSpec } from "./Book";
import { Glints, type GlintSpec } from "./Glint";
import { Crowds, crowdTemplates, type CrowdSpec } from "./Crowd";
import { FX_GLOW, FX_ITEM, fxItemTexture } from "./props/FxItems";
import { c01, FACE, facePoint, rnd, smooth, softDot, yawFwd, type FaceDir, type V3 } from "./fxCommon";

export type BeamSpec = {
  /** where the shaft enters (a chink in the wall) and where it lands */
  from: V3; to: V3;
  /** width in blocks at the entry (default 0.25) and at the landing (default 0.6) */
  width?: number; spread?: number;
  /** warm light colour (default "#ffe2a6") and base opacity (default 0.32) */
  color?: string; opacity?: number;
  /** [frame, 0..1] strength keys (eased); without keys always on */
  keys?: [number, number][];
  /** follow the shot's `cycle`: full by day, out at night (the chink flipping light / dark) */
  daylight?: boolean;
  /** a soft light pool where it lands (default true) */
  pool?: boolean;
};
export type CurtainSpec = {
  /** bottom centre of the gap the curtain covers (a point on the face) and the face it hangs on */
  at: V3; face: FaceDir;
  /** width and height in blocks (default 1, 2) */
  w?: number; h?: number;
  /** frame hands part it (strands swing to both sides over `len`, default 12) */
  f: number; len?: number;
  /** leaf texture key from the set (default "block/vine"), tinted (default "#5f9b3a"); falls back to drawn leaves */
  tex?: string; tint?: string;
};
export type FishLineSpec = {
  /** the rod holder (mob id): the tip sits ahead of and above them; or a fixed tip point */
  actor?: string; tip?: V3;
  /** the bobber on the water (it bobs); y = the water surface */
  bobber: V3;
  /** frames the line is out (default always) */
  f0?: number; f1?: number;
  /** a bite: the bobber dips under from this frame (4 f) */
  bite?: number;
  /** draw the rod itself from the holder's hands to the tip (default true with `actor`: a villager's crossed arms
   *  hide a held item, so the pole is drawn here; set false when a player holds `fx:rod` and you give `tip`) */
  rod?: boolean;
  /** the actor's size (Young Ruby 0.75); default 1 */
  scale?: number;
};
export type RippleSpec = {
  /** where the tap lands (a block) and the box of blocks the ring runs through */
  origin: V3; from: V3; to: V3;
  /** frame of the tap, speed in blocks per frame (default 0.6), max reach in blocks (default all) */
  f: number; speed?: number; reach?: number;
};
export type WhipSpec = { f: number; len?: number; dir?: "h" | "v"; amt?: number };
export type MemorySpec = {
  /** a sign's text (drawn like the NO TAPPER board) */
  sign: string; lit?: boolean;
  /** centre on the picture (% of width / height) and width (% of the frame width) */
  x: number; y: number; w: number;
  /** [frame, opacity] keys (eased) */
  keys: [number, number][];
  /** blur in px at 1080 wide (default 6) */
  blur?: number;
};

export type TapperFxDir = {
  cracks?: CrackSpec[];
  drips?: DripSpec[]; trickles?: TrickleSpec[]; sprays?: SpraySpec[];
  texts?: TextSpec[]; signs?: SignSpec[];
  books?: BookSpec[];
  glints?: GlintSpec[];
  crowds?: CrowdSpec[];
  beams?: BeamSpec[];
  /** draw a square sun (day) / moon (night) that rides `cycle`; size in blocks at 170 out (default 16) */
  sunDisc?: { size?: number };
  curtains?: CurtainSpec[];
  fishLines?: FishLineSpec[];
  ripples?: RippleSpec[];
  /** fx items placed in the world (flying via `props` paths, resting at `at`): id -> item name (props/FxItems.ts) */
  fxProps?: Record<string, { item: string; at?: V3; facing?: number; scale?: number; tint?: string }>;
  /** actor size per mob id (Young Ruby 0.75): scales about the feet, act targets and looks corrected */
  sizes?: Record<string, number>;
  /** warm faded flashback grade: [frame, 0..1] keys (eased) */
  flashback?: [number, number][];
  whip?: WhipSpec[];
  memories?: MemorySpec[];
};
type D = (ShotDirection & TapperFxDir) | undefined;

/** does this shot use any Tapper fx (McShort skips all of this otherwise) */
export const hasTapperFx = (d: D) => !!d && !!(d.cracks || d.drips || d.trickles || d.sprays || d.texts || d.signs || d.books || d.glints || d.crowds || d.beams || d.sunDisc || d.curtains || d.fishLines || d.ripples || d.fxProps || d.sizes || d.flashback || d.whip || d.memories || Object.values(d.held ?? {}).some((ks) => ks.some((k) => k.item?.startsWith("fx:"))));

// ---------------------------------------------------------------- ripples -> blockfx taps
const boxCells = (a: V3, b: V3): V3[] => {
  const out: V3[] = [];
  for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++)
    for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++)
      for (let z = Math.min(a[2], b[2]); z <= Math.max(a[2], b[2]); z++) out.push([x, y, z]);
  return out;
};
/** the shot's blockfx with each ripple's ring of taps added (cells already in a blockfx spec are left to it) */
export const tapperBlockFx = (d: D): BlockFxSpec[] | undefined => {
  if (!d?.ripples?.length) return d?.blockfx;
  const own = new Set<string>();
  for (const s of d.blockfx ?? []) for (const c of s.at ? [s.at] : boxCells(s.from!, s.to!)) own.add(c.join(","));
  const taps = new Map<string, { at: V3; taps: number[] }>();
  for (const r of d.ripples) for (const c of boxCells(r.from, r.to)) {
    const k = c.join(","), dist = Math.hypot(c[0] - r.origin[0], c[1] - r.origin[1], c[2] - r.origin[2]);
    if (own.has(k) || dist > (r.reach ?? 1e9)) continue;
    const e = taps.get(k) ?? { at: c, taps: [] };
    e.taps.push(r.f + Math.round(dist / (r.speed ?? 0.6)));
    taps.set(k, e);
  }
  return [...(d.blockfx ?? []), ...[...taps.values()].map((t) => ({ at: t.at, taps: t.taps }))];
};

// ---------------------------------------------------------------- world: fx props / held items, templates, sizes
/** the shot's world with its fx items added as props (held "fx:<name>" items, fxProps); the same object when none */
export const tapperWorld = (lw: LoadedWorld, d: D): LoadedWorld => {
  const add: LoadedWorld["world"]["props"] = [];
  const tex: Record<string, THREE.Texture> = {};
  const use = (name: string, tint?: string) => { const key = `fx/${name}${tint ? `@${tint}` : ""}`; tex[key] = fxItemTexture(name, tint); return key; };
  for (const [mob, keys] of Object.entries(d?.held ?? {})) {
    const seen = new Set<string>();
    for (const k of keys) {
      if (!k.item?.startsWith("fx:") || seen.has(k.item)) continue;
      seen.add(k.item);
      const name = k.item.slice(3);
      add.push({ id: k.item, item: FX_ITEM[name] ?? `fx_${name}`, sprite: use(name), heldBy: mob, at: null, facing: 0 });
    }
  }
  for (const [id, p] of Object.entries(d?.fxProps ?? {}))
    add.push({ id, item: FX_ITEM[p.item] ?? `fx_${p.item}`, sprite: use(p.item, p.tint), heldBy: null, at: p.at ?? [0, -999, 0], facing: p.facing ?? 0, scale: p.scale });
  if (!add.length) return lw;
  return { ...lw, world: { ...lw.world, props: [...lw.world.props, ...add] }, textures: { ...lw.textures, ...tex } };
};

/** wraps McShort's mob cue: hides crowd templates, scales sized actors (targets / looks moved so the scaled body
 *  still reaches the same world points) */
export const tapperMobCue = (d: D, id: string, f: number, cue: MobCue | undefined, base: V3 | null): MobCue | undefined => {
  if (!d) return cue;
  if (d.crowds && crowdTemplates(d.crowds).has(id)) return { ...(cue ?? {}), hidden: true };
  const s = d.sizes?.[id];
  if (!s || s === 1) return cue;
  const at = cue?.at ?? base;
  const out: MobCue = { ...(cue ?? {}), scale: (cue?.scale ?? 1) * s };
  if (at) {
    const fix = (t: V3): V3 => [at[0] + (t[0] - at[0]) / s, at[1] + (t[1] - at[1]) / s, at[2] + (t[2] - at[2]) / s];
    if (out.acts) out.acts = out.acts.map((a) => (a.target ? { ...a, target: fix(a.target) } : a));
    if (out.look) out.look = fix(out.look);
  }
  return out;
};

// ---------------------------------------------------------------- beams, sun disc, curtains, fishing lines, held lights
const daylightAt = (days: number) => {
  const p = ((days % 1) + 1) % 1, s = (a: number, b: number, x: number) => smooth((x - a) / (b - a));
  return 1 - s(0.5, 0.62, p) * (1 - s(0.9, 1.0, p));
};

const beamTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas"); c.width = 64; c.height = 128;
    const g = c.getContext("2d")!;
    for (let y = 0; y < 128; y++) {
      const along = y / 127, a = Math.sin(Math.PI * Math.min(1, along * 1.2)) ** 0.6 * (1 - 0.35 * along);
      const gr = g.createLinearGradient(0, 0, 64, 0);
      gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, y, 64, 1);
    }
    t = new THREE.CanvasTexture(c);
    return t;
  };
})();

const Beam: React.FC<{ s: BeamSpec; frame: number; days?: number }> = ({ s, frame, days }) => {
  const k = (s.keys ? keyed(s.keys, frame, 0) : 1) * (s.daylight && days !== undefined ? daylightAt(days) : 1);
  const mat = React.useMemo(() => new THREE.MeshBasicMaterial({ map: beamTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false }), []);
  const pool = React.useMemo(() => new THREE.SpriteMaterial({ map: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), []);
  const geo = React.useMemo(() => {
    const w0 = s.width ?? 0.25, w1 = s.spread ?? 0.6, L = Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1], s.to[2] - s.from[2]);
    const g = new THREE.BufferGeometry();
    // two crossed tapered quads along +y (0..L), turned onto from -> to below
    const pos = [-w0 / 2, 0, 0, w0 / 2, 0, 0, w1 / 2, -L, 0, -w1 / 2, -L, 0, 0, 0, -w0 / 2, 0, 0, w0 / 2, 0, -L, w1 / 2, 0, -L, -w1 / 2];
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0], 2));
    g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    return g;
  }, [s]);
  React.useEffect(() => () => geo.dispose(), [geo]);
  if (k <= 0.003) return null;
  const col = new THREE.Color(s.color ?? "#ffe2a6");
  mat.color.copy(col).multiplyScalar((s.opacity ?? 0.32) * k);
  pool.color.copy(col).multiplyScalar(0.45 * k);
  const dir = new THREE.Vector3(s.to[0] - s.from[0], s.to[1] - s.from[1], s.to[2] - s.from[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  const w1 = s.spread ?? 0.6;
  return (
    <>
      <mesh geometry={geo} material={mat} position={s.from} quaternion={q} renderOrder={20} />
      {s.pool !== false && <sprite material={pool} position={[s.to[0], s.to[1] + 0.05, s.to[2]]} scale={[w1 * 2.4, w1 * 2.4, 1]} renderOrder={20} />}
    </>
  );
};

const SunDisc: React.FC<{ lw: LoadedWorld; days: number; size?: number }> = ({ lw, days, size = 16 }) => {
  const mats = React.useMemo(() => ({
    sun: new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff3b0").multiplyScalar(1.6), toneMapped: false, fog: false, transparent: true, depthWrite: false }),
    moon: new THREE.MeshBasicMaterial({ color: new THREE.Color("#e6ecff").multiplyScalar(1.2), toneMapped: false, fog: false, transparent: true, depthWrite: false }),
    halo: new THREE.SpriteMaterial({ map: softDot(), color: "#fff0c0", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }),
  }), []);
  const look = cycleLook(SKY[lw.world.sky.preset], days), day = daylightAt(days);
  const p = ((days % 1) + 1) % 1;
  // the sun rides the light direction by day; the moon arcs across the night (0.55..1)
  const a = c01((p - 0.55) / 0.45) * Math.PI;
  const sunV = new THREE.Vector3(...look.sunDir).normalize();
  const moonV = new THREE.Vector3(-Math.cos(a) * 1.2, 0.25 + Math.sin(a), -0.45).normalize();
  const R = 170;
  const put = (v: THREE.Vector3) => v.clone().multiplyScalar(R).toArray() as V3;
  const face = (v: THREE.Vector3) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v.clone().negate());
  mats.sun.opacity = day; mats.moon.opacity = 1 - day; mats.halo.opacity = 0.5 * day;
  return (
    <>
      {day > 0.01 && <mesh position={put(sunV)} quaternion={face(sunV)} material={mats.sun} renderOrder={-5}><planeGeometry args={[size, size]} /></mesh>}
      {day > 0.01 && <sprite position={put(sunV.clone().multiplyScalar(0.99))} material={mats.halo} scale={[size * 3.2, size * 3.2, 1]} renderOrder={-6} />}
      {day < 0.99 && <mesh position={put(moonV)} quaternion={face(moonV)} material={mats.moon} renderOrder={-5}><planeGeometry args={[size * 0.8, size * 0.8]} /></mesh>}
    </>
  );
};

const leafTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas"); c.width = 16; c.height = 16;
    const g = c.getContext("2d")!;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const r = rnd(x * 16 + y, 5);
      if (r < 0.28) continue;
      const v = 0.6 + 0.4 * rnd(x, y);
      g.fillStyle = `rgb(${Math.round(95 * v)},${Math.round(155 * v)},${Math.round(58 * v)})`; g.fillRect(x, y, 1, 1);
    }
    t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
})();

const Curtain: React.FC<{ s: CurtainSpec; lw: LoadedWorld; frame: number }> = ({ s, lw, frame }) => {
  const w = s.w ?? 1, h = s.h ?? 2, n = Math.max(3, Math.round(w * 5));
  const set = lw.textures[s.tex ?? "block/vine"];
  const mat = React.useMemo(() => {
    const m = new THREE.MeshLambertMaterial({ map: set ?? leafTex(), alphaTest: 0.4, side: THREE.DoubleSide, color: set ? (s.tint ?? "#5f9b3a") : "#ffffff" });
    return m;
  }, [set, s.tint]);
  const F = FACE[s.face], plane = s.at[F.axis], u0 = F.axis === 2 ? s.at[0] : s.at[2];
  const k = smooth((frame - s.f) / (s.len ?? 12));
  const out: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5, side = t < 0 ? -1 : 1;
    // hang from the top edge, sway gently; part: strands swing out and bunch to the sides
    const sway = 0.06 * Math.sin(frame / 13 + i * 1.7) + 0.03 * Math.sin(frame / 5.3 + i);
    const u = u0 + t * w + side * k * (w * 0.62 - Math.abs(t) * w * 0.55);
    const top = facePoint(s.face, plane, u, s.at[1] + h, 0.03 + 0.01 * (i % 2));
    const swing = sway + side * k * 0.16;   // parted strands bunch to the sides, hanging nearly straight
    const len = h * (1 - 0.1 * k * (1 - Math.abs(t)));
    const rotZ = F.axis === 2 ? swing * (F.n[2] < 0 ? -1 : 1) : 0, rotX = F.axis === 0 ? swing * (F.n[0] > 0 ? -1 : 1) : 0;
    out.push(
      <group key={i} position={top} rotation={[rotX, F.axis === 2 ? 0 : Math.PI / 2, rotZ]}>
        <mesh position={[0, -len / 2, 0]} material={mat} castShadow><planeGeometry args={[w / n + 0.05, len]} /></mesh>
      </group>,
    );
  }
  return <>{out}</>;
};

const lineMat = new THREE.LineBasicMaterial({ color: "#e8e4d8", transparent: true, opacity: 0.85 });
const FishLine: React.FC<{ s: FishLineSpec; frame: number; actorAt: (id: string, f: number) => V3 | null; facingOf: (id: string, f: number) => number }> = ({ s, frame, actorAt, facingOf }) => {
  const geo = React.useMemo(() => new THREE.BufferGeometry(), []);
  React.useEffect(() => () => geo.dispose(), [geo]);
  if ((s.f0 !== undefined && frame < s.f0) || (s.f1 !== undefined && frame > s.f1)) return null;
  let tip = s.tip, hand: V3 | null = null;
  const bite0 = s.bite !== undefined && frame >= s.bite ? smooth((frame - s.bite) / 4) : 0;
  if (!tip && s.actor) {
    const a = actorAt(s.actor, frame);
    if (!a) return null;
    const fw = yawFwd(facingOf(s.actor, frame)), sc = s.scale ?? 1;
    // hands at the crossed arms; the pole leans out ahead and up, its tip nodding a little (and dipping on a bite)
    hand = [a[0] + fw[0] * 0.38 * sc, a[1] + 1.12 * sc, a[2] + fw[2] * 0.38 * sc];
    const nod = 0.04 * Math.sin(frame / 11) - 0.22 * bite0;
    tip = [a[0] + fw[0] * 1.75 * sc, a[1] + (2.2 + nod) * sc, a[2] + fw[2] * 1.75 * sc];
  }
  if (!tip) return null;
  const b: V3 = [s.bobber[0], s.bobber[1] + 0.03 * Math.sin(frame / 9) - 0.18 * bite0, s.bobber[2]];
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, sag = 0.35 * (1 - bite0 * 0.8) * Math.sin(Math.PI * t);
    pts.push(new THREE.Vector3(tip[0] + (b[0] - tip[0]) * t, tip[1] + (b[1] + 0.08 - tip[1]) * t - sag, tip[2] + (b[2] - tip[2]) * t));
  }
  geo.setFromPoints(pts);
  const pole = hand && s.rod !== false ? (() => {
    const v = new THREE.Vector3(tip[0] - hand[0], tip[1] - hand[1], tip[2] - hand[2]), L = v.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    return (
      <group position={hand} quaternion={q}>
        <mesh position={[0, L / 2, 0]} castShadow><boxGeometry args={[0.055, L, 0.055]} /><meshLambertMaterial color="#6b4a2b" /></mesh>
        <mesh position={[0, 0.12, 0]}><boxGeometry args={[0.08, 0.16, 0.08]} /><meshLambertMaterial color="#3d3a36" /></mesh>
      </group>
    );
  })() : null;
  return (
    <>
      {pole}
      <primitive object={new THREE.Line(geo, lineMat)} />
      <group position={b}>
        <mesh position={[0, 0.05, 0]}><boxGeometry args={[0.1, 0.06, 0.1]} /><meshLambertMaterial color="#f2efe6" /></mesh>
        <mesh position={[0, 0.0, 0]}><boxGeometry args={[0.1, 0.05, 0.1]} /><meshLambertMaterial color="#3f6fbf" /></mesh>
      </group>
    </>
  );
};

/** a warm light at the hand of every mob holding a lit fx item (torch, lantern) */
const HeldLights: React.FC<{ d: NonNullable<D>; frame: number; actorAt: (id: string, f: number) => V3 | null; facingOf: (id: string, f: number) => number }> = ({ d, frame, actorAt, facingOf }) => {
  const out: React.ReactNode[] = [];
  for (const [mob, keys] of Object.entries(d.held ?? {})) {
    const h = heldAt(keys, frame), name = h?.item?.startsWith("fx:") ? h.item.slice(3) : null;
    const col = name ? FX_GLOW[name] : undefined, a = actorAt(mob, frame);
    if (!col || !a) continue;
    const fw = yawFwd(facingOf(mob, frame)), sc = d.sizes?.[mob] ?? 1;
    const flick = 0.85 + 0.1 * Math.sin(frame * 0.9 + mob.length) + 0.05 * Math.sin(frame * 2.3);
    out.push(<pointLight key={mob} position={[a[0] + fw[0] * 0.5 * sc - fw[2] * 0.35 * sc, a[1] + 1.5 * sc, a[2] + fw[2] * 0.5 * sc + fw[0] * 0.35 * sc]} color={col} intensity={3.2 * flick * (h?.pop ?? 1)} distance={7} decay={1.5} />);
  }
  return <>{out}</>;
};

/** everything 3D: put inside VoxelWorld's actors */
export const TapperLayers: React.FC<{ d: D; lw: LoadedWorld; actorAt: (id: string, f: number) => V3 | null; cam: V3 }> = ({ d, lw, actorAt, cam }) => {
  const frame = useMcFrame();
  if (!d) return null;
  const days = d.cycle ? keysAt(d.cycle, frame) : undefined;
  const facingOf = (id: string, f: number) => pathAt(d.mobs?.[id], f)?.facing ?? lw.world.mobs.find((m) => m.id === id)?.facing ?? 0;
  const sized = (id: string, f: number) => actorAt(id, f);
  return (
    <>
      {d.cracks && <Cracks specs={d.cracks} />}
      {(d.drips || d.trickles || d.sprays) && <Water drips={d.drips} trickles={d.trickles} sprays={d.sprays} />}
      {(d.texts || d.signs) && <BlockTexts texts={d.texts} signs={d.signs} lw={lw} />}
      {d.books?.map((b, i) => <Book key={`book${i}`} spec={b} />)}
      {d.glints && <Glints specs={d.glints.map((g) => (d.sizes?.[g.actor] && g.scale === undefined ? { ...g, scale: d.sizes[g.actor] } : g))} actorAt={sized} cam={cam} />}
      {d.crowds && <Crowds specs={d.crowds} lw={lw} />}
      {d.beams?.map((b, i) => <Beam key={`beam${i}`} s={b} frame={frame} days={days} />)}
      {d.sunDisc && days !== undefined && <SunDisc lw={lw} days={days} size={d.sunDisc.size} />}
      {d.curtains?.map((c, i) => <Curtain key={`cur${i}`} s={c} lw={lw} frame={frame} />)}
      {d.fishLines?.map((s, i) => <FishLine key={`fl${i}`} s={s} frame={frame} actorAt={actorAt} facingOf={facingOf} />)}
      {d.held && <HeldLights d={d} frame={frame} actorAt={actorAt} facingOf={facingOf} />}
    </>
  );
};

// ---------------------------------------------------------------- picture: flashback grade, whip blur, memories
/** the CSS filter for the 3D picture this frame ("" = none) */
export const tapperFilter = (d: D, frame: number): string => {
  if (!d) return "";
  const parts: string[] = [];
  const fb = d.flashback ? keyed(d.flashback, frame, 0) : 0;
  if (fb > 0.002) parts.push(`sepia(${0.38 * fb}) saturate(${1 - 0.22 * fb}) contrast(${1 - 0.1 * fb}) brightness(${1 + 0.06 * fb})`);
  const w = whipAt(d, frame);
  if (w) parts.push(`url(#tapperWhip${w.dir})`);
  return parts.join(" ");
};
const whipAt = (d: NonNullable<D>, frame: number): { dir: "h" | "v"; px: number } | null => {
  for (const w of d.whip ?? []) {
    const len = w.len ?? 8, u = (frame - w.f) / len;
    if (u < 0 || u > 1) continue;
    return { dir: w.dir ?? "h", px: Math.sin(Math.PI * u) * 46 * (w.amt ?? 1) };
  }
  return null;
};

/** DOM layers over the 3D picture: the flashback vignette and glow, the whip filter defs, memory double-exposures */
export const TapperScreen: React.FC<{ d: D }> = ({ d }) => {
  const frame = useMcFrame();
  if (!d) return null;
  const fb = d.flashback ? keyed(d.flashback, frame, 0) : 0;
  const w = whipAt(d, frame);
  return (
    <>
      {w && (
        <svg width={0} height={0} style={{ position: "absolute" }}>
          <filter id={`tapperWhip${w.dir}`} x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation={w.dir === "h" ? `${w.px} 0` : `0 ${w.px}`} edgeMode="duplicate" />
          </filter>
        </svg>
      )}
      {fb > 0.002 && (
        <>
          <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 55% at 50% 45%, rgba(255,214,150,0.10) 0%, rgba(255,190,120,0) 55%, rgba(150,90,40,0.38) 88%, rgba(90,50,20,0.62) 100%)", opacity: fb }} />
          <AbsoluteFill style={{ background: "rgba(255,226,170,0.10)", mixBlendMode: "screen", opacity: fb }} />
        </>
      )}
      {d.memories?.map((m, i) => {
        const o = keyed(m.keys, frame, 0);
        if (o <= 0.003) return null;
        const drift = 1 + 0.02 * Math.sin(frame / 17 + i);
        return (
          <AbsoluteFill key={`mem${i}`} style={{ pointerEvents: "none" }}>
            <img src={signImage(m.sign, m.lit ?? false)} style={{ position: "absolute", left: `${m.x - m.w / 2}%`, top: `${m.y}%`, width: `${m.w}%`, transform: `translateY(-50%) scale(${drift})`, imageRendering: "pixelated", opacity: o, filter: `blur(${m.blur ?? 6}px) sepia(0.3)`, mixBlendMode: "screen" }} />
          </AbsoluteFill>
        );
      })}
    </>
  );
};
