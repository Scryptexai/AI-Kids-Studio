// N3 fire on blocks and lava embers (drawn outside the merged world mesh, like Build.tsx).
// Fire: the game's own fire models with the animated fire_0 / fire_1 textures (20 tps, every fire in sync as in the game):
//   - on a block's top face: the floor fire (four planes crossing in an X, 1.4 blocks tall) in the cell above
//   - on a side face: the side fire (one plane 1.4 tall, a hair off the face; stacked planes sit at different depths
//     so their 0.4 overlap never z-fights)
// Each burning cell has its own ignition frame, so fire spreads (cells keyed in order). Flames grow in over 5 f, a
// warm flicker light sits on the burning cells, embers (glowing squares) and dark smoke puffs rise. `char` darkens the
// block as it burns, `gone` breaks it into ash motes (then the flames die): the block is drawn here, not in the mesh.
// Lava: an ember popping out of the lake and arcing to a target (a pop splash where it leaves, sparks where it lands),
// and random small pops over a lake surface.
import React, { useMemo } from "react";
import * as THREE from "three";
import { KEY_FPS, keyNoise, useMcFrame } from "./mcTime";
import { Motes, blockAt, breakMotes, protoOf, type Mote } from "./Build";
import type { LoadedWorld } from "./VoxelWorld";
import { stepFx, type FxTex } from "./fxTextures";

type V3 = [number, number, number];
type Face = "up" | "north" | "south" | "east" | "west";

export type FireSpec = {
  /** burning blocks in ignition order: [x,y,z] (frames spread evenly f0..f1) or [x,y,z,f] */
  cells: number[][];
  f0?: number; f1?: number;
  /** faces that carry flames (default: every face but the bottom whose neighbour is air in the shot's set) */
  faces?: Face[];
  /** frames from ignition until the flames die out (default: they burn on) */
  life?: number;
  /** frames from ignition until the block is fully charred (darkened); the block is drawn by the fire layer */
  char?: number;
  /** frames from ignition until the block is gone: it breaks into ash motes, its flames die 6 f later */
  gone?: number;
  /** strength of the warm flicker light (default 1, 0 = none) */
  light?: number;
  /** embers and smoke (default true) */
  smoke?: boolean;
  /** flame height in blocks (default 1.4, the game's) */
  h?: number;
};

export type EmberSpec = {
  /** the frame it pops out of the lava */
  f: number;
  /** where it leaves the surface */
  at: V3;
  /** where it lands (default: it hops and falls back into the lava) */
  to?: V3;
  /** flight frames (default 20) */
  len?: number;
  /** apex height above the higher end (default 1.4) */
  h?: number;
  /** sprite size in blocks (default 0.22) */
  size?: number;
};

export type LavaPopSpec = {
  /** the lake rectangle [x0, z0] .. [x1, z1] and its surface y */
  min: [number, number]; max: [number, number]; y: number;
  /** a pop about every n frames (default 10) */
  every?: number;
  /** frames the pops run between (default the whole shot) */
  f0?: number; f1?: number;
  seed?: number;
};

const c01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const k = c01(v); return k * k * (3 - 2 * k); };
const rnd = (i: number, k: number) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

const N: Record<Face, V3> = { up: [0, 1, 0], north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0] };
const SIDES: Face[] = ["up", "north", "south", "east", "west"];

/** each cell with its ignition frame */
export const fireCells = (s: FireSpec): { c: V3; f: number }[] => {
  const n = s.cells.length, f0 = s.f0 ?? 0, f1 = s.f1 ?? f0;
  return s.cells.map((c, i) => ({ c: [c[0], c[1], c[2]] as V3, f: c.length > 3 ? c[3] : f0 + (n > 1 ? ((f1 - f0) * i) / (n - 1) : 0) }));
};
/** cells the fire layer draws itself (charring / burning away): left out of the merged mesh */
export const fireKeys = (specs: FireSpec[] | undefined) =>
  (specs ?? []).filter((s) => s.char !== undefined || s.gone !== undefined).flatMap((s) => fireCells(s).map(({ c }) => c.join(",")));

// ---------------------------------------------------------------- flame planes
/** one flame quad: bottom-left, bottom-right, the full-height up vector; which texture, mirrored */
type Plane = { bl: THREE.Vector3; br: THREE.Vector3; up: THREE.Vector3; tex: 0 | 1; flip: boolean };

/** the game's floor fire (fire_floor0): four 16 x 22.4 px planes, each turned 22.5 deg about x or z through the cell
 *  centre with rescale, in the cell whose corner is `o` */
const floorPlanes = (o: V3, h: number, seed: number): Plane[] => {
  const s = 1 / Math.cos(Math.PI / 8), out: Plane[] = [];
  const defs: { axis: "x" | "z"; at: number; ang: number }[] = [
    { axis: "x", at: 0.55, ang: -22.5 }, { axis: "x", at: 0.45, ang: 22.5 }, { axis: "z", at: 0.55, ang: -22.5 }, { axis: "z", at: 0.45, ang: 22.5 }];
  defs.forEach((d, i) => {
    const a = (d.ang * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    // a point of the unrotated plane (cell space) -> rotated, rescaled, world
    const P = (u: number, y: number) => {
      let x: number, z: number;
      if (d.axis === "x") { x = u; z = d.at; } else { x = d.at; z = u; }
      let py = (y - 0.5) * s, pz = (z - 0.5) * s, px = (x - 0.5) * s;
      if (d.axis === "x") { const ny = py * ca - pz * sa, nz = py * sa + pz * ca; py = ny; pz = nz; px = x - 0.5; }
      else { const nx = px * ca - py * sa, ny = px * sa + py * ca; px = nx; py = ny; pz = z - 0.5; }
      return new THREE.Vector3(o[0] + 0.5 + px, o[1] + 0.5 + py, o[2] + 0.5 + pz);
    };
    const bl = P(0, 0), br = P(1, 0), tl = P(0, h);
    out.push({ bl, br, up: tl.sub(bl), tex: ((i + seed) % 2) as 0 | 1, flip: rnd(seed, i) > 0.5 });
  });
  return out;
};

/** the game's side fire (fire_side0): one plane 1.4 tall against a block face, `off` out from it */
const sidePlane = (c: V3, f: Face, h: number, off: number, seed: number): Plane => {
  const n = N[f];
  // the face's bottom edge, along the face (any order: the material is double sided)
  const cx = c[0] + 0.5 + n[0] * (0.5 + off), cz = c[2] + 0.5 + n[2] * (0.5 + off);
  const along = n[0] !== 0 ? new THREE.Vector3(0, 0, 0.5) : new THREE.Vector3(0.5, 0, 0);
  const mid = new THREE.Vector3(cx, c[1], cz);
  return { bl: mid.clone().sub(along), br: mid.clone().add(along), up: new THREE.Vector3(0, h, 0), tex: (seed % 2) as 0 | 1, flip: rnd(seed, 3) > 0.5 };
};

/** a quad buffer with a fixed capacity, refilled each frame (one draw per texture) */
const quadBuffer = (cap: number) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(cap * 4 * 3), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(cap * 4 * 2), 2));
  const idx = new Uint32Array(cap * 6);
  for (let i = 0; i < cap; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
};
const fill = (g: THREE.BufferGeometry, quads: { p: THREE.Vector3[]; flip: boolean }[]) => {
  const pos = g.getAttribute("position") as THREE.BufferAttribute, uv = g.getAttribute("uv") as THREE.BufferAttribute;
  quads.forEach((q, i) => {
    q.p.forEach((v, j) => pos.setXYZ(i * 4 + j, v.x, v.y, v.z));
    const [u0, u1] = q.flip ? [1, 0] : [0, 1];
    uv.setXY(i * 4, u0, 0); uv.setXY(i * 4 + 1, u1, 0); uv.setXY(i * 4 + 2, u1, 1); uv.setXY(i * 4 + 3, u0, 1);
  });
  pos.needsUpdate = true; uv.needsUpdate = true;
  g.setDrawRange(0, quads.length * 6);
};

/** flame size 0..1 at u frames after ignition: grows in over 5 f, dies over 8 f after `end` */
const flameK = (u: number, end: number) => (u < 0 ? 0 : Math.min(smooth(0.25 + u / 5), 1 - smooth((u - end) / 8)));

const EMBER = ["#ffd25a", "#ff8a1e", "#ffb43c", "#fff1a0"];

/** a square smoke particle k (0..1) into its life: the game's generic frames run 7 -> 0 as it ages, growing a little */
const sqMats = new Map<string, THREE.SpriteMaterial>();
export const SmokeSq: React.FC<{ fx: FxTex; at: V3; k: number; size: number; grey: number }> = ({ fx, at, k, size, grey }) => {
  if (k < 0 || k >= 1) return null;
  const fr = Math.max(0, 7 - Math.floor(k * 8)), g = Math.round(grey * 20) / 20, key = `${fr}|${g}`, tex = fx.tex[`particle/generic_${fr}`];
  let m = sqMats.get(key);
  if (!m || m.map !== (tex ?? null)) {
    m = new THREE.SpriteMaterial({ map: tex ?? null, color: new THREE.Color().setRGB(g, g, g, THREE.SRGBColorSpace), alphaTest: 0.5, depthWrite: true, toneMapped: false });
    sqMats.set(key, m);
  }
  const s = size * (0.7 + 0.5 * k);
  return <sprite position={at} scale={[s, s, 1]} material={m} renderOrder={13} />;
};

/** one fire spec: flames on every burning cell, its light, embers, smoke, charring blocks */
const Fire: React.FC<{ lw: LoadedWorld; spec: FireSpec; fx: FxTex; si: number }> = ({ lw, spec, fx, si }) => {
  const frame = useMcFrame();
  const h = spec.h ?? 1.4;
  const cells = useMemo(() => {
    const at = blockAt(lw);
    const air = (x: number, y: number, z: number) => { const b = at.get(`${x},${y},${z}`); return !b || b.shape === "cross"; };
    return fireCells(spec).map(({ c, f }, ci) => {
      const seed = si * 977 + ci * 31;
      const faces = (spec.faces ?? SIDES).filter((fc) => air(c[0] + N[fc][0], c[1] + N[fc][1], c[2] + N[fc][2]));
      // stacked side planes overlap by 0.4: give each row its own depth so they never z-fight
      const off = 0.012 + 0.007 * (((c[1] % 3) + 3) % 3) + 0.003 * (((c[0] + c[2]) % 2 + 2) % 2);
      const planes = faces.flatMap((fc) => (fc === "up" ? floorPlanes([c[0], c[1] + 1, c[2]], h, seed) : [sidePlane(c, fc, h, off, seed + fc.length)]));
      // where embers and smoke leave: the tops of the flames
      const tops = planes.map((p) => p.bl.clone().add(p.br).multiplyScalar(0.5).add(p.up));
      const emit = tops.length ? tops.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / tops.length) : new THREE.Vector3(c[0] + 0.5, c[1] + 1.2, c[2] + 0.5);
      // which way the smoke drifts off: out of the burning faces (sides) and up
      const out = faces.reduce((a, fc) => a.add(new THREE.Vector3(...N[fc])), new THREE.Vector3());
      out.y = 0; if (out.lengthSq() > 0) out.normalize();
      const block = spec.char !== undefined || spec.gone !== undefined ? at.get(c.join(",")) : undefined;
      let obj: THREE.Object3D | null = null, mats: THREE.MeshLambertMaterial[] = [];
      if (block) {
        obj = protoOf(block, lw, lw).clone();
        obj.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
          mats = mats.concat(m.material as THREE.MeshLambertMaterial | THREE.MeshLambertMaterial[]);
        });
      }
      return { c, f, seed, planes, emit, out, obj, mats };
    });
  }, [lw, spec, si, h]);
  const geos = useMemo(() => [0, 1].map(() => quadBuffer(Math.max(1, cells.reduce((n, c) => n + c.planes.length, 0)))), [cells]);
  const mats = useMemo(() => [0, 1].map(() => new THREE.MeshBasicMaterial({ transparent: false, alphaTest: 0.5, side: THREE.DoubleSide, depthWrite: true, toneMapped: false, color: new THREE.Color(1, 1, 1) })), []);
  const t0 = stepFx(fx, "block/fire_0", frame, KEY_FPS), t1 = stepFx(fx, "block/fire_1", frame, KEY_FPS);
  mats[0].map = t0 ?? null; mats[1].map = t1 ?? t0 ?? null;
  mats.forEach((m) => { if (m.userData.hasMap !== !!m.map) { m.needsUpdate = true; m.userData.hasMap = !!m.map; } });
  if (!t0) { mats[0].color.set("#ff7a1a"); mats[1].color.set("#ffb030"); }

  const quads: { p: THREE.Vector3[]; flip: boolean }[][] = [[], []];
  const motes: Mote[] = [], nodes: React.ReactNode[] = [];
  const lit: THREE.Vector3[] = [];
  const life = spec.life ?? Infinity;
  cells.forEach((cell, ci) => {
    const u = frame - cell.f;
    const goneAt = spec.gone ?? Infinity, end = Math.min(life, goneAt + 6);
    // the block itself: darkens, then breaks into ash
    if (cell.obj) {
      if (u < goneAt) {
        const k = spec.char !== undefined ? smooth(u / spec.char) : 0;
        for (const m of cell.mats) m.color.setRGB(1 - 0.7 * k, 1 - 0.74 * k, 1 - 0.77 * k);
        nodes.push(<primitive key={`b${ci}`} object={cell.obj} position={[cell.c[0] + 0.5, cell.c[1], cell.c[2] + 0.5]} />);
      }
      breakMotes(motes, cell.c, u - goneAt, ci % 3 ? "#2a2420" : "#4a3e36", 6, cell.seed, cell.c[1] >= 0 ? 0 : cell.c[1] + 1);
    }
    const k = flameK(u, end);
    if (k <= 0.01) return;
    lit.push(cell.emit);
    // a slow per-cell height flicker (every 3 f a new target), on top of the texture's own animation
    const wob = 0.9 + 0.2 * rnd(cell.seed, Math.floor((frame + cell.seed) / 3));
    for (const p of cell.planes) {
      const up = p.up.clone().multiplyScalar(k * wob);
      quads[p.tex].push({ p: [p.bl, p.br, p.br.clone().add(up), p.bl.clone().add(up)], flip: p.flip });
    }
    if (spec.smoke === false) return;
    // embers: glowing squares rising with a sideways drift (18 f)
    for (let e = Math.ceil(frame - 18); e <= frame; e++) {                 // spawns on whole key frames
      if (e < cell.f || rnd(cell.seed + 7, e) > 0.16 * k) continue;
      const a = (frame - e) / 18, s0 = cell.seed * 13 + e;
      const p = cell.emit.clone().add(new THREE.Vector3((rnd(s0, 1) - 0.5) * 0.8, -0.5 + rnd(s0, 2) * 0.4, (rnd(s0, 3) - 0.5) * 0.8));
      p.y += a * (1.2 + rnd(s0, 4) * 1.4);
      p.x += Math.sin(a * 6 + s0) * 0.15 * a; p.z += Math.cos(a * 5 + s0) * 0.15 * a;
      motes.push({ p: p.toArray() as V3, s: (0.045 + 0.035 * rnd(s0, 5)) * (1 - a * 0.7), c: EMBER[s0 % 4], r: a * 5 });
    }
    // smoke: the game's square smoke particles (generic_7 -> generic_0), dark grey, rising and drifting (30 f each)
    for (let e = Math.ceil(frame - 30); e <= frame; e++) {
      if (e < cell.f || rnd(cell.seed + 3, e) > 0.12 * k) continue;
      const a = (frame - e) / 30, s0 = cell.seed * 7 + e;
      // pushed off the face it burns on (0.25 -> 0.9), so it never sits flat against the wall
      const o = 0.25 + 0.65 * a;
      nodes.push(<SmokeSq key={`s${ci}:${e}`} fx={fx} k={a} size={0.4 + 0.25 * rnd(s0, 1)} grey={0.2 + 0.16 * rnd(s0, 2)}
        at={[cell.emit.x + cell.out.x * o + (rnd(s0, 3) - 0.5) * 0.7 + Math.sin(a * 4 + s0) * 0.25 * a, cell.emit.y - 0.1 + a * (1.8 + rnd(s0, 4)), cell.emit.z + cell.out.z * o + (rnd(s0, 5) - 0.5) * 0.7 + Math.cos(a * 3 + s0) * 0.25 * a]} />);
    }
  });
  fill(geos[0], quads[0]); fill(geos[1], quads[1]);
  // the warm light: at the middle of what burns now, stronger the more burns, flickering (two fast sines + noise)
  const L = spec.light ?? 1;
  let light: React.ReactNode = null;
  if (L > 0 && lit.length) {
    const c = lit.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / lit.length);
    const flick = 0.82 + 0.1 * Math.sin(frame * 1.7 + si) + 0.08 * Math.sin(frame * 3.1) + 0.08 * (keyNoise((k) => rnd(si, k), frame) - 0.5);
    const spread = Math.max(...lit.map((p) => p.distanceTo(c)));
    light = <pointLight position={[c.x, c.y + 0.4, c.z]} color="#ff9440" intensity={L * (14 + 9 * Math.sqrt(lit.length)) * flick} distance={10 + spread * 1.5} decay={1.6} />;
  }
  return (
    <>
      <mesh geometry={geos[0]} material={mats[0]} renderOrder={11} frustumCulled={false} />
      <mesh geometry={geos[1]} material={mats[1]} renderOrder={11} frustumCulled={false} />
      {light}
      {nodes}
      <Motes motes={motes} lit={false} />
    </>
  );
};

export const Fires: React.FC<{ lw: LoadedWorld; specs: FireSpec[]; fx: FxTex }> = ({ lw, specs, fx }) => <>{specs.map((s, i) => <Fire key={i} lw={lw} spec={s} fx={fx} si={i} />)}</>;

// ---------------------------------------------------------------- lava
const glowTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,0.35)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    t = new THREE.CanvasTexture(c); return t;
  };
})();

/** a flying ember: where it is u frames into its flight (null when not flying) */
const emberAt = (s: EmberSpec, u: number): V3 | null => {
  const len = s.len ?? 20;
  if (u < 0 || u > len) return null;
  const k = u / len, to = s.to ?? [s.at[0] + 0.3, s.at[1], s.at[2] + 0.2];
  const H = (s.h ?? 1.4) + Math.abs(to[1] - s.at[1]) / 2;
  return [s.at[0] + (to[0] - s.at[0]) * k, s.at[1] + (to[1] - s.at[1]) * k + 4 * H * k * (1 - k), s.at[2] + (to[2] - s.at[2]) * k];
};

/** the lava pop where an ember leaves: bright drops hop out and fall back in (10 f), a wisp of smoke */
const popSplash = (out: Mote[], at: V3, u: number, seed: number, n = 7) => {
  if (u < 0 || u > 12) return;
  const t = u / 30;
  for (let i = 0; i < n; i++) {
    const s0 = seed * 11 + i, a = rnd(s0, 1) * Math.PI * 2, sp = 0.6 + rnd(s0, 2) * 0.9, up = 1.8 + rnd(s0, 3) * 1.6;
    const y = at[1] + up * t - 0.5 * 18 * t * t;
    if (y < at[1] - 0.05) continue;
    out.push({ p: [at[0] + Math.cos(a) * sp * t, y, at[2] + Math.sin(a) * sp * t], s: 0.06 + 0.04 * rnd(s0, 4), c: EMBER[i % 4], r: u * 0.4 });
  }
};

/** a flying ember's nodes for this frame (its splash and landing sparks go to `motes`) */
const emberNodes = (s: EmberSpec, fx: FxTex, seed: number, motes: Mote[], frame: number, key: string): React.ReactNode => {
  const u = frame - s.f, len = s.len ?? 20, size = s.size ?? 0.22;
  popSplash(motes, s.at, u, seed);
  // sparks where it lands (a spark shower thrown back off the surface, 10 f)
  if (s.to && u >= len && u <= len + 10) {
    const t = (u - len) / 30;
    const back = [s.at[0] - s.to[0], s.at[2] - s.to[2]], bl = Math.hypot(back[0], back[1]) || 1;
    for (let i = 0; i < 8; i++) {
      const s0 = seed * 7 + i, a = rnd(s0, 1) * Math.PI * 2;
      const vx = (back[0] / bl) * (0.8 + rnd(s0, 2)) + Math.cos(a) * 0.7, vz = (back[1] / bl) * (0.8 + rnd(s0, 2)) + Math.sin(a) * 0.7;
      motes.push({ p: [s.to[0] + vx * t, s.to[1] + (1 + rnd(s0, 3) * 1.5) * t - 0.5 * 16 * t * t, s.to[2] + vz * t], s: 0.05 * (1 - (u - len) / 11), c: EMBER[i % 4] });
    }
  }
  const p = emberAt(s, u);
  // it keeps glowing a moment where it landed (6 f), then the fire layer takes over
  const rest = s.to && !p && u > len && u <= len + 6 ? s.to : null;
  const at = p ?? rest;
  if (!at) return null;
  const fade = rest ? 1 - (u - len) / 6 : 1;
  const tex = fx.tex["particle/lava"];
  const trail: React.ReactNode[] = [];
  if (p) for (let i = 1; i <= 5; i++) {
    const q = emberAt(s, u - i * 0.6);
    if (!q) break;
    const w = size * 0.45 * (1 - i / 7);
    trail.push(<mesh key={i} position={q} renderOrder={26}><boxGeometry args={[w, w, w]} /><meshBasicMaterial color={i < 3 ? "#ffd060" : "#ff8a20"} transparent opacity={0.9 * (1 - i / 6)} toneMapped={false} depthWrite={false} /></mesh>);
  }
  return (
    <group key={key}>
      <sprite position={at} scale={[size, size, 1]} renderOrder={27}>
        <spriteMaterial map={tex ?? null} color={tex ? new THREE.Color(1.6, 1.45, 1.2) : "#ffb030"} alphaTest={tex ? 0.4 : 0} transparent opacity={fade} toneMapped={false} depthWrite={false} />
      </sprite>
      <sprite position={at} scale={[size * 4, size * 4, 1]} renderOrder={26}>
        <spriteMaterial map={glowTex()} color="#ff8a2a" transparent opacity={0.7 * fade} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      {trail}
      <pointLight position={at} color="#ff8a30" intensity={6 * fade} distance={3.5} decay={1.6} />
    </group>
  );
};

/** the pops of a lake: seeded times and places; each one a small hop that falls back in */
const popsOf = (s: LavaPopSpec, i: number, frame: number): EmberSpec[] => {
  const every = s.every ?? 10, seed = (s.seed ?? 0) * 101 + i * 7, out: EmberSpec[] = [];
  const f0 = s.f0 ?? -40, f1 = s.f1 ?? 100000;
  for (let k = Math.floor((frame - 30 - f0) / every) - 1; k <= Math.floor((frame - f0) / every) + 1; k++) {
    if (k < 0) continue;
    const f = f0 + k * every + Math.floor(rnd(seed + k, 1) * every * 0.8);
    if (f > f1 || frame - f < 0 || frame - f > 30) continue;
    const x = s.min[0] + rnd(seed + k, 2) * (s.max[0] - s.min[0]), z = s.min[1] + rnd(seed + k, 3) * (s.max[1] - s.min[1]);
    // no `to`: it hops and falls back where it left (no spark shower)
    out.push({ f, at: [x, s.y, z], len: 12 + Math.floor(rnd(seed + k, 6) * 8), h: 0.5 + rnd(seed + k, 7) * 0.7, size: 0.14 + rnd(seed + k, 8) * 0.06 });
  }
  return out;
};

/** every lava ember and lake pop of a shot */
export const LavaFx: React.FC<{ embers?: EmberSpec[]; pops?: LavaPopSpec[]; fx: FxTex }> = ({ embers = [], pops = [], fx }) => {
  const frame = useMcFrame();
  const motes: Mote[] = [];
  const all = [...embers.map((s, i) => ({ s, seed: 500 + i })), ...pops.flatMap((p, i) => popsOf(p, i, frame).map((s) => ({ s, seed: s.f * 13 + i })))];
  const nodes = all.map(({ s, seed }, i) => emberNodes(s, fx, seed, motes, frame, `${i}:${s.f}`));
  return <>{nodes}<Motes motes={motes} lit={false} /></>;
};
