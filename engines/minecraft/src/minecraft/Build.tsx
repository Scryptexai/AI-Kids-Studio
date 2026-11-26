// N1 build waves and N7 water pours: cells that change from one block to another over a shot, drawn outside the
// merged world mesh (like BlockFx). The shot plays on one staged set (the "base", usually the END state); each wave
// names where its old and new blocks come from: "base", another staged set (looked up at the same cell, so a stage
// swap is just a diff of two variants), or "air". Build timelapse language (same every time):
//   - an old block breaks into ~6 motes of its own colour (thrown out, falling) and is gone
//   - `gap` frames later the new block pops in about its centre: scale 0.6 -> 1.08 -> 1.0 over 6 f, with a small dust puff
//   - style "fizz" (lava cooled by water): the new block is there at once, glowing orange that fades, steam rising
//   - style "ghost" (itw-02, an imagined block forming inside rock): the cell holds a solid filler block (`under`) the
//     whole shot, and the new block pops in over it as a translucent tinted ghost (kept in colour under `imagine`)
// A fluid cell of the base set stays in the merged mesh (a cube can pop in over lava); an old fluid from another set
// is drawn as a flat source block (its surface) until it changes.
// Pours: a falling water stream from a bucket point, a thin water film spreading over the cells it reaches, splashes.
import React, { useMemo } from "react";
import * as THREE from "three";
import { KEY_FPS, useMcFrame } from "./mcTime";
import { blockObject } from "./Actors";
import { avgColor } from "./BlockFx";
import { animFrame, makeMaterial, type LoadedWorld } from "./VoxelWorld";
import type { CBlock } from "./types";
import { stepFx, type FxTex } from "./fxTextures";

type V3 = [number, number, number];
export type WorldMap = Record<string, LoadedWorld>;

export type WaveSpec = {
  /** cells in pop order: [x, y, z] (frames spread evenly from f0 to f1) or [x, y, z, f] (its own frame) */
  cells: number[][];
  f0?: number; f1?: number;
  /** where the old block comes from: "base" (the shot's set), a staged set id (same cell), or "air" (default "air") */
  from?: string;
  /** where the new block comes from (default "base") */
  to?: string;
  /** frames between the old block breaking and the new one popping in (default 2) */
  gap?: number;
  /** "pop" (default), "fizz" (lava turning to obsidian: no pop, orange glow fading, steam) or "cut" (an instant swap
   *  on the frame: no motes, no pop, no dust; e.g. ground scorched by a blast, hidden under its flash) or "ghost"
   *  (itw-02: a solid `under` block all shot, the new block pops in over it as a translucent ghost; no dust by default) */
  style?: "pop" | "fizz" | "cut" | "ghost";
  /** ghost: the filler block id in the cell (default: the most common solid neighbour of the base set, else "deepslate") */
  under?: string;
  /** ghost: the ghost's tint (default "#ff3a2a") and opacity (default 0.4) */
  ghostColor?: string;
  ghostAlpha?: number;
  /** motes per broken block (default 6) */
  motes?: number;
  /** dust puff per popped block (default true) */
  dust?: boolean;
};

export type PourSpec = {
  /** the bucket mouth: where the stream starts */
  from: V3;
  /** the stream runs from f0 (reaches the surface 3 f later) to f1 (the tail falls in 4 f) */
  f0: number; f1: number;
  /** cells the water reaches, [x, y, z, f] (y = the fluid cell): a thin film spreads over the cell from f */
  cells: number[][];
  /** frames after a cell is reached before it turns solid (the film then sits on the new top and boils away) (default 3) */
  cool?: number;
  /** frames the film lasts on the cooled block (default 4: the hot glow shows through once it is gone) */
  life?: number;
  /** stream width in blocks (default 0.26) */
  width?: number;
  /** "water" (default) or "lava" (Wave A, mc-cobblegen): a lava pour is the stream and its splashes only, opaque and
   *  glowing; the pool it makes is a FluidSpec in the Fluids layer (no film is drawn) */
  kind?: "water" | "lava";
  /** where the stream lands when `cells` is empty (default: the first cell's surface) */
  to?: V3;
};

const c01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const k = c01(v); return k * k * (3 - 2 * k); };
const rnd = (i: number, k: number) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

/** the build pop: 0.6 -> 1.08 (3 f, ease out) -> 1.0 (3 f), then exactly 1 */
export const POP_LEN = 6;
export const popScale = (u: number) => (u < 0 ? 0 : u < 3 ? 0.6 + 0.48 * (1 - (1 - u / 3) ** 2) : u < POP_LEN ? 1.08 - 0.08 * smooth((u - 3) / 3) : 1);

/** "x,y,z" -> block, per loaded world (cached) */
const maps = new WeakMap<LoadedWorld, Map<string, CBlock>>();
export const blockAt = (lw: LoadedWorld) => {
  let m = maps.get(lw);
  if (!m) {
    m = new Map();
    for (const b of lw.world.blocks) for (let i = 0; i < b.positions.length; i += 3) m.set(`${b.positions[i]},${b.positions[i + 1]},${b.positions[i + 2]}`, b);
    maps.set(lw, m);
  }
  return m;
};

/** a wave's own cell keys */
const skipOf = (s: WaveSpec) => new Set(s.cells.map((c) => `${c[0]},${c[1]},${c[2]}`));
/** each cell with its frame */
export const waveCells = (s: WaveSpec): { c: V3; f: number }[] => {
  const n = s.cells.length, f0 = s.f0 ?? 0, f1 = s.f1 ?? f0;
  return s.cells.map((c, i) => ({ c: [c[0], c[1], c[2]] as V3, f: c.length > 3 ? c[3] : f0 + (n > 1 ? ((f1 - f0) * i) / (n - 1) : 0) }));
};
/** cells the waves draw themselves (left out of the merged mesh); a fluid of the base set stays in the mesh */
export const waveKeys = (specs: WaveSpec[] | undefined, lw: LoadedWorld) => {
  const at = blockAt(lw), out: string[] = [];
  for (const s of specs ?? []) for (const { c } of waveCells(s)) { const k = c.join(","); if (at.get(k)?.shape !== "fluid") out.push(k); }
  return out;
};
/** staged sets a list of sources names (besides "base" / "air") */
export const sourceSets = (...srcs: (string | undefined)[]) => srcs.filter((s): s is string => !!s && s !== "base" && s !== "air");

/** a block (and the world it comes from) at a cell of a source */
export const resolveBlock = (src: string, key: string, lw: LoadedWorld, worlds: WorldMap): { b: CBlock; w: LoadedWorld } | null => {
  if (src === "air") return null;
  const w = src === "base" ? lw : worlds[src];
  if (!w) return null;
  const b = blockAt(w).get(key);
  return b ? { b, w } : null;
};

/** a block object from any loaded world; a texture the base world also has is taken from the base (its clock animates it) */
const protoCache = new WeakMap<LoadedWorld, Map<string, THREE.Group>>();
export const protoOf = (b: CBlock, w: LoadedWorld, lw: LoadedWorld): THREE.Group => {
  let m = protoCache.get(lw);
  if (!m) { m = new Map(); protoCache.set(lw, m); }
  const k = `${w.dir}|${b.key}`;
  let g = m.get(k);
  if (!g) { g = blockObject(b, w === lw ? lw.textures : { ...w.textures, ...lw.textures }); m.set(k, g); }
  return g;
};
/** the block's mote colour (average of its main texture) */
export const blockColor = (b: CBlock, w: LoadedWorld) => {
  const tex = b.elements[0]?.faces.north?.tex ?? b.elements[0]?.faces.up?.tex;
  return avgColor(tex ? w.textures[tex] : undefined, `${w.dir}|${b.key}`);
};

/** a flat fluid source block (surface at 8/9) with game face shades, origin at the cell's corner */
const FLUID_H = 8 / 9;
const fluidBoxGeo = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => {
    if (g) return g;
    g = new THREE.BoxGeometry(1, FLUID_H, 1).translate(0.5, FLUID_H / 2, 0.5);
    const n = g.getAttribute("normal"), col: number[] = [];
    for (let i = 0; i < n.count; i++) { const x = n.getX(i), y = n.getY(i), z = n.getZ(i); const sh = x * x * 0.6 + y * y * (y > 0 ? 1 : 0.5) + z * z * 0.8; col.push(sh, sh, sh); }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  };
})();
const fluidCache = new WeakMap<LoadedWorld, Map<string, THREE.Material>>();
const fluidMaterial = (b: CBlock, w: LoadedWorld, lw: LoadedWorld) => {
  let m = fluidCache.get(lw);
  if (!m) { m = new Map(); fluidCache.set(lw, m); }
  const key = `block/${b.id}_still`;
  let mat = m.get(`${w.dir}|${key}`);
  if (!mat) { mat = makeMaterial(b, { tex: key, overlay: false }, lw.textures[key] ?? w.textures[key]); m.set(`${w.dir}|${key}`, mat); }
  return mat;
};

// ---------------------------------------------------------------- particles (one instanced mesh per layer)
export type Mote = { p: V3; s: number; c: string; r?: number };
const MOTE_GEO = new THREE.BoxGeometry(1, 1, 1);
const CAP = 4096;
export const Motes: React.FC<{ motes: Mote[]; lit?: boolean }> = ({ motes, lit = true }) => {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(MOTE_GEO, lit ? new THREE.MeshLambertMaterial({ color: "#ffffff" }) : new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), CAP);
    m.frustumCulled = false;
    m.setColorAt(0, new THREE.Color("#ffffff"));
    return m;
  }, [lit]);
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  const n = Math.min(CAP, motes.length);
  for (let i = 0; i < n; i++) {
    const t = motes[i];
    q.setFromEuler(e.set(t.r ?? 0, (t.r ?? 0) * 1.3, 0));
    mx.compose(new THREE.Vector3(...t.p), q, new THREE.Vector3(t.s, t.s, t.s));
    mesh.setMatrixAt(i, mx);
    mesh.setColorAt(i, col.set(t.c));
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return n ? <primitive object={mesh} /> : null;
};

const G = 16; // blocks / s^2 for motes
/** an old block breaking: n motes of its colour thrown out of the cell, falling, shrinking (14 f) */
export const breakMotes = (out: Mote[], c: V3, u: number, color: string, n: number, seed: number, floor: number) => {
  const life = 14;
  if (u < 0 || u > life) return;
  const t = u / 30;
  for (let i = 0; i < n; i++) {
    const s0 = seed * 31 + i;
    const a = rnd(s0, 1) * Math.PI * 2, sp = 1.0 + rnd(s0, 2) * 1.4, up = 1.4 + rnd(s0, 3) * 1.8;
    const x = c[0] + 0.2 + rnd(s0, 4) * 0.6 + Math.cos(a) * sp * t, z = c[2] + 0.2 + rnd(s0, 5) * 0.6 + Math.sin(a) * sp * t;
    const y = Math.max(floor + 0.05, c[1] + 0.3 + rnd(s0, 6) * 0.5 + up * t - 0.5 * G * t * t);
    const s = (0.09 + rnd(s0, 7) * 0.06) * (u > life * 0.6 ? 1 - (u - life * 0.6) / (life * 0.4) : 1);
    out.push({ p: [x, y, z], s, c: color, r: t * 8 * rnd(s0, 8) });
  }
};
/** a new block landing: a small light dust puff from its lower edges (10 f) */
export const dustPuff = (out: Mote[], c: V3, u: number, seed: number, n = 6, color = "#e4ddcf") => {
  const life = 10;
  if (u < 0 || u > life) return;
  const k = u / life;
  for (let i = 0; i < n; i++) {
    const s0 = seed * 17 + i, a = (i / n) * Math.PI * 2 + rnd(s0, 1) * 0.8;
    const r = 0.5 + (0.25 + rnd(s0, 2) * 0.35) * (1 - (1 - k) ** 2);
    out.push({ p: [c[0] + 0.5 + Math.cos(a) * r, c[1] + 0.08 + rnd(s0, 3) * 0.3 + 0.35 * k, c[2] + 0.5 + Math.sin(a) * r], s: (0.07 + 0.06 * rnd(s0, 4)) * (1 - k * k), c: color, r: k * 3 });
  }
};

/** a rising smoke / steam puff: the game's large smoke frames (0..11) as the puff ages */
export const SmokePuff: React.FC<{ fx: FxTex; at: V3; u: number; life?: number; rise?: number; size?: number; color?: string; seed: number; opacity?: number }> = ({ fx, at, u, life = 20, rise = 1.4, size = 0.9, color = "#ececec", seed, opacity = 0.8 }) => {
  if (u < 0 || u > life) return null;
  const k = u / life, frame = Math.min(11, Math.floor(k * 12));
  const tex = fx.tex[`particle/big_smoke_${frame}`];
  const p: V3 = [at[0] + (rnd(seed, 1) - 0.5) * 0.5 * k, at[1] + rise * (1 - (1 - k) ** 2), at[2] + (rnd(seed, 2) - 0.5) * 0.5 * k];
  const s = size * (0.55 + 0.6 * k);
  return (
    <sprite position={p} scale={[s, s, 1]} renderOrder={14}>
      <spriteMaterial map={tex ?? null} color={color} transparent opacity={opacity * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85)} depthWrite={false} alphaTest={tex ? 0.05 : 0} />
    </sprite>
  );
};

const GLOW_GEO = new THREE.BoxGeometry(1.012, 1.012, 1.012);

/** ghost style: the filler block of a cell (the `under` id anywhere in the base set, else its commonest solid neighbour) */
const fillerOf = (lw: LoadedWorld, c: V3, under: string | undefined, skip: Set<string>): CBlock | null => {
  const at = blockAt(lw), solid = (b: CBlock | undefined) => !!b && b.shape === "cube" && b.layer === "opaque";
  if (under) { for (const b of lw.world.blocks) if (b.id === under && solid(b)) return b; }
  const n = new Map<string, { b: CBlock; k: number }>();
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [2, 0, 0], [-2, 0, 0], [0, 0, 2], [0, 0, -2]]) {
    const key = `${c[0] + dx},${c[1] + dy},${c[2] + dz}`, b = at.get(key);
    if (skip.has(key) || !solid(b) || /ore/.test(b!.id)) continue;
    const e = n.get(b!.key) ?? { b: b!, k: 0 }; e.k++; n.set(b!.key, e);
  }
  const best = [...n.values()].sort((a, b) => b.k - a.k)[0]?.b;
  if (best) return best;
  for (const b of lw.world.blocks) if (b.id === "deepslate" && solid(b)) return b;
  return null;
};
/** ghost style: a translucent tinted copy of a block object (cached per object + look); kept in colour by `imagine` */
const ghostCache = new Map<string, THREE.Group>();
const ghostOf = (proto: THREE.Group, color: string, alpha: number) => {
  const key = `${proto.uuid}|${color}|${alpha}`;
  let g = ghostCache.get(key);
  if (!g) {
    g = proto.clone();
    const tint = new THREE.Color(color);
    g.traverse((o) => {
      const me = o as THREE.Mesh;
      if (!me.isMesh) return;
      const one = (m: THREE.Material) => {
        const src = m as THREE.MeshLambertMaterial;
        // depthWrite stays on: one solid layer (no doubled inner faces), and the imagine mask reads it as fully kept
        return new THREE.MeshBasicMaterial({ map: src.map ?? null, color: tint, transparent: true, opacity: alpha, depthWrite: true, alphaTest: src.alphaTest, side: src.side, toneMapped: false });
      };
      me.material = Array.isArray(me.material) ? me.material.map(one) : one(me.material);
      me.renderOrder = 11;
    });
    g.userData.raidKeep = 1;
    ghostCache.set(key, g);
  }
  return g;
};

/** every wave of a shot */
export const Waves: React.FC<{ lw: LoadedWorld; worlds: WorldMap; specs: WaveSpec[]; fx: FxTex }> = ({ lw, worlds, specs, fx }) => {
  const frame = useMcFrame();
  const items = useMemo(() => specs.flatMap((s, si) => waveCells(s).map(({ c, f }, ci) => {
    const key = c.join(","), baseFluid = blockAt(lw).get(key)?.shape === "fluid";
    const pick = (src: string) => {
      const r = resolveBlock(src, key, lw, worlds);
      if (!r || (r.w === lw && baseFluid)) return null;                       // the base fluid stays in the merged mesh
      if (r.b.shape === "fluid") return { fluid: true as const, mat: fluidMaterial(r.b, r.w, lw), color: "#000" };
      return { fluid: false as const, obj: protoOf(r.b, r.w, lw).clone(), color: blockColor(r.b, r.w) };
    };
    const ghost = s.style === "ghost";
    const fb = ghost ? fillerOf(lw, c, s.under, skipOf(s)) : null;
    const neu = pick(s.to ?? "base");
    return { c, f, s, si, seed: si * 1013 + ci * 7, old: ghost ? null : pick(s.from ?? "air"), neu: ghost && neu && !neu.fluid ? { ...neu, obj: ghostOf(neu.obj, s.ghostColor ?? "#ff3a2a", s.ghostAlpha ?? 0.4).clone() } : neu,
      fill: fb ? protoOf(fb, lw, lw).clone() : null, until: Infinity, since: -Infinity };
  })).map((it, _, all) => {
    // a cell a LATER wave changes again (a fresh obsidian block mined out): this wave's new block stops at that frame
    // (and that later wave's old block only shows once the earlier wave has put it there)
    const same = (o: typeof it) => o.c[0] === it.c[0] && o.c[1] === it.c[1] && o.c[2] === it.c[2];
    const later = all.filter((o) => o.si > it.si && o.f > it.f && same(o)), before = all.filter((o) => o.si < it.si && o.f < it.f && same(o));
    return later.length || before.length ? { ...it, until: later.length ? Math.min(...later.map((o) => o.f)) : Infinity,
      since: before.length ? Math.max(...before.map((o) => o.f)) : -Infinity } : it;
  }), [specs, lw, worlds]);
  // animated textures of other sets (a foreign lava keeps flowing)
  const foreign = useMemo(() => [...new Set(specs.flatMap((s) => sourceSets(s.from, s.to)))].map((id) => worlds[id]).filter((w) => w && w !== lw), [specs, worlds, lw]);
  for (const w of foreign) for (const [k, t] of Object.entries(w.world.textures)) if (t.frames > 1 && !lw.textures[k]) w.textures[k].offset.set(0, 1 - (animFrame(t, frame, KEY_FPS) + 1) / t.frames);
  const motes: Mote[] = [], nodes: React.ReactNode[] = [];
  items.forEach((it, i) => {
    const { c, f, s, old, neu } = it;
    const u = frame - f, fizz = s.style === "fizz", cut = s.style === "cut", ghost = s.style === "ghost";
    const floor = c[1] >= 0 ? 0 : c[1] + 1;
    if (it.fill && frame >= it.since && frame < it.until) nodes.push(<primitive key={`u${i}`} object={it.fill} position={[c[0] + 0.5, c[1], c[2] + 0.5]} />);
    if (old && u < 0 && frame >= it.since) {
      nodes.push(old.fluid
        ? <mesh key={`o${i}`} geometry={fluidBoxGeo()} material={old.mat} position={c} receiveShadow />
        : <primitive key={`o${i}`} object={old.obj} position={[c[0] + 0.5, c[1], c[2] + 0.5]} />);
    }
    if (old && !old.fluid && !cut) breakMotes(motes, c, u, old.color, s.motes ?? 6, it.seed, floor);
    if (!neu || frame >= it.until) return;
    const un = frame - (f + (old && !fizz && !cut ? s.gap ?? 2 : 0));
    if (un < 0) return;
    if (neu.fluid) { nodes.push(<mesh key={`n${i}`} geometry={fluidBoxGeo()} material={neu.mat} position={c} receiveShadow />); return; }
    const sc = fizz || cut ? 1 : popScale(un) * (ghost ? 1.012 : 1);
    nodes.push(
      <group key={`n${i}`} position={[c[0] + 0.5, c[1] + 0.5, c[2] + 0.5]} scale={sc}>
        <primitive object={neu.obj} position={[0, -0.5, 0]} />
      </group>,
    );
    if (!fizz && !cut && (ghost ? s.dust === true : s.dust !== false)) dustPuff(motes, c, un, it.seed);
    if (fizz) {
      const g = 1 - c01(un / 18);
      if (g > 0) nodes.push(
        <mesh key={`g${i}`} geometry={GLOW_GEO} position={[c[0] + 0.5, c[1] + 0.5, c[2] + 0.5]} renderOrder={12}>
          <meshBasicMaterial color="#ff4a00" transparent opacity={0.55 * g * g} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>,
      );
      for (let k = 0; k < 3; k++) nodes.push(<SmokePuff key={`st${i}:${k}`} fx={fx} at={[c[0] + 0.3 + 0.4 * rnd(it.seed, k), c[1] + 1.05, c[2] + 0.3 + 0.4 * rnd(it.seed, k + 5)]} u={un + 1 - k * 4} seed={it.seed + k} life={22} size={0.85} />);
    }
  });
  return <>{nodes}<Motes motes={motes} /></>;
};

const STREAM_GEO = new THREE.BoxGeometry(1, 1, 1);
const FILM_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** a water bucket poured out: stream, splashes, a thin film over the cells it reaches */
export const Pour: React.FC<{ spec: PourSpec; fx: FxTex }> = ({ spec, fx }) => {
  const frame = useMcFrame();
  const lava = spec.kind === "lava";
  const flow = stepFx(fx, lava ? "block/lava_flow" : "block/water_flow", frame, KEY_FPS), still = lava ? undefined : stepFx(fx, "block/water_still", frame, KEY_FPS);
  const tint = lava ? "#ffffff" : fx.water;
  const cells = spec.cells.map((c) => ({ c: [c[0], c[1], c[2]] as V3, f: c[3] ?? spec.f0 + 3 }));
  const first = cells.length ? cells.reduce((a, b) => (b.f < a.f ? b : a), cells[0]) : null;
  const land: V3 = spec.to ?? (first ? [first.c[0] + 0.5, first.c[1] + FLUID_H + 0.02, first.c[2] + 0.5] : spec.from);
  const nodes: React.ReactNode[] = [], motes: Mote[] = [];
  // the stream: grows down to the surface in 3 f, its tail follows it down in 4 f after f1
  const head = c01((frame - spec.f0) / 3), tail = c01((frame - spec.f1) / 4);
  if (head > 0 && tail < 1) {
    const a = new THREE.Vector3(...spec.from), b = new THREE.Vector3(...land);
    const top = a.clone().lerp(b, tail * tail), bot = a.clone().lerp(b, head);
    const len = top.distanceTo(bot);
    if (len > 0.01) {
      const mid = top.clone().add(bot).multiplyScalar(0.5), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize());
      const w = spec.width ?? 0.26;
      nodes.push(
        lava
          ? <mesh key="stream" geometry={STREAM_GEO} position={mid} quaternion={q} scale={[w, len, w]}>
              <meshLambertMaterial map={flow ?? null} color="#ffffff" emissive="#ffffff" emissiveMap={flow ?? null} emissiveIntensity={0.9} />
            </mesh>
          : <mesh key="stream" geometry={STREAM_GEO} position={mid} quaternion={q} scale={[w, len, w]} renderOrder={13}>
              <meshLambertMaterial map={flow ?? null} color={tint} transparent opacity={0.92} depthWrite={false} />
            </mesh>,
      );
    }
    // splashes where it lands: drops hop out and fall back (8 f each, two a frame)
    if (head >= 1) for (let e = Math.ceil(Math.max(spec.f0 + 3, frame - 8)); e <= Math.min(frame, spec.f1 + 2); e++) for (let j = 0; j < 2; j++) {
      const s0 = e * 7 + j, u = (frame - e) / 30, a2 = rnd(s0, 1) * Math.PI * 2, sp = 0.8 + rnd(s0, 2) * 1.2, up = 1.6 + rnd(s0, 3) * 1.4;
      const y = land[1] + up * u - 0.5 * 20 * u * u;
      if (y < land[1] - 0.02) continue;
      motes.push({ p: [land[0] + Math.cos(a2) * sp * u, y, land[2] + Math.sin(a2) * sp * u], s: 0.05 + 0.03 * rnd(s0, 4), c: lava ? (j ? "#ffd04a" : "#ff7a1a") : j ? "#dfeeff" : "#8fb6f5" });
    }
  }
  // the film: spreads over a cell in 4 f; once the cell has cooled it sits on the new top and boils away
  const cool = spec.cool ?? 3, life = spec.life ?? 4;
  if (!lava) cells.forEach(({ c, f }, i) => {
    const u = frame - f;
    if (u < 0) return;
    const cooled = u >= cool, k = cooled ? 1 - c01((u - cool) / life) : 1;
    if (k <= 0) return;
    const sc = 0.35 + 0.65 * smooth(u / 4);
    // the water texture is see-through (alpha ~0.7): over glowing lava it read lilac, so a solid blue sheet goes under it
    const y0 = c[1] + (cooled ? 1.012 : FLUID_H + 0.02);
    nodes.push(
      <mesh key={`fu${i}`} geometry={FILM_GEO} position={[c[0] + 0.5, y0, c[2] + 0.5]} scale={[sc, 1, sc]} renderOrder={13}>
        <meshLambertMaterial color={tint} transparent opacity={0.9 * k} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>,
      <mesh key={`f${i}`} geometry={FILM_GEO} position={[c[0] + 0.5, y0 + 0.005, c[2] + 0.5]} scale={[sc, 1, sc]} renderOrder={14}>
        <meshLambertMaterial map={still ?? null} color={tint} transparent opacity={k} depthWrite={false} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
      </mesh>,
    );
  });
  return <>{nodes}<Motes motes={motes} lit={false} /></>;
};
