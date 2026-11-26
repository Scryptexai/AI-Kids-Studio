// Wave A (mc-cobblegen): fluid bodies that flow, contact blocks (cobblestone / obsidian forming where lava meets
// water), cutaways and soft glowing outlines. Drawn outside the merged world mesh, like Build.tsx: every cell a fluid
// spec or contact names is left out of the world mesh (fluidKeys) and drawn here, per frame.
//
// Fluids look like the game: a source is a full block at 8/9 height (never coplanar with a block top), each step
// sideways is one level thinner (lava 2 levels, water 1), each top corner averages the cells around it (a source
// weighs 10, open air pulls the edge down), so flows slope down from the source; a fall into a hole is a full column.
// Sloped tops and sides use the animated *_flow texture (its centre half, turned down the slope), flat tops *_still.
// Lava is emissive and casts a warm flickering light. A new cell does not pop: the front creeps in from the cell it
// came from over `fill` frames (rising as it goes); a source swells from a puddle; a scooped flow pulls back the way it
// came and the source shrinks up into the bucket as a stream. Everything is a pure function of the (fractional) key
// frame, so it is smooth at 60 fps. Spec types: types.ts (FluidSpec, ContactSpec, CutawaySpec, SoftOutlineSpec).
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { KEY_FPS, keyNoise, useMcFrame } from "./mcTime";
import { Motes, SmokePuff, blockAt, breakMotes, popScale, protoOf, type Mote, type WorldMap } from "./Build";
import { Outline, avgColor } from "./BlockFx";
import { SmokeSq } from "./Fire";
import { blockObject } from "./Actors";
import type { LoadedWorld } from "./VoxelWorld";
import type { CBlock, ContactSpec, CutawaySpec, FluidSpec, SoftOutlineSpec, WaveAFx } from "./types";
import { stepFx, type FxTex } from "./fxTextures";

type V3 = [number, number, number];
const K = (x: number, y: number, z: number) => `${x},${y},${z}`;
const c01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const k = c01(v); return k * k * (3 - 2 * k); };
const rnd = (i: number, k: number) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const FAR = -1e6, NEVER = 1e9;

const DEF = {
  lava: { rate: 12, drop: 2, spread: 3, slope: 2 },
  water: { rate: 5, drop: 1, spread: 7, slope: 4 },
} as const;

// ---------------------------------------------------------------- cutaway
const boxCells = (a: V3, b: V3): V3[] => {
  const out: V3[] = [];
  for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++)
    for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++)
      for (let z = Math.min(a[2], b[2]); z <= Math.max(a[2], b[2]); z++) out.push([x, y, z]);
  return out;
};
/** "x,y,z" keys hidden by the cutaways at this frame (sorted, so the join is a stable signature) */
export const cutKeysAt = (specs: CutawaySpec[] | undefined, frame: number): string[] => {
  if (!specs?.length) return [];
  const s = new Set<string>();
  for (const c of specs) {
    if (frame < (c.f0 ?? FAR) || frame >= (c.f1 ?? NEVER)) continue;
    for (const p of c.cells ?? []) s.add(K(p[0], p[1], p[2]));
    if (c.from && c.to) for (const p of boxCells(c.from, c.to)) s.add(K(...p));
  }
  return [...s].sort();
};

// ---------------------------------------------------------------- flow cells (static per spec)
type FCell = { c: V3; key: string; level: number; up: number; din: V3 | null; fall: boolean; a: number; src: boolean };
/** a span of frames a cell holds fluid: in over gin from s, out over gout from e */
type Iv = { s: number; e: number; gin: number; gout: number };
type Body = { spec: FluidSpec; kind: "lava" | "water"; cells: FCell[]; ivs: Iv[][]; fill: number };

const contactCells = (contacts: ContactSpec[] | undefined) => {
  const s = new Set<string>();
  for (const c of contacts ?? []) { s.add(K(...c.at)); for (const p of c.clear ?? []) s.add(K(p[0], p[1], p[2])); }
  return s;
};

/** the cells of one fluid body: the explicit path, or the game's spread over the set */
const flowCells = (spec: FluidSpec, lw: LoadedWorld, skip: Set<string>): FCell[] => {
  const d = DEF[spec.kind], rate = spec.rate ?? d.rate, fallStep = Math.max(2, Math.round(rate * 0.35));
  const at = blockAt(lw), minY = lw.world.bounds.min[1];
  const solid = (x: number, y: number, z: number) => {
    if (y < minY) return true;                                    // the bottom of the set: stop falling
    const k = K(x, y, z), b = at.get(k);
    return !!b && b.shape !== "fluid" && b.shape !== "cross" && !skip.has(k);
  };
  const f0 = spec.f0 ?? FAR, grow = spec.grow ?? 4;
  const start = spec.start ?? (spec.f0 !== undefined ? f0 + grow : FAR);
  const src: FCell = { c: spec.source, key: K(...spec.source), level: 0, up: -1, din: null, fall: false, a: f0, src: true };
  const cells: FCell[] = [src];
  if (spec.path) {
    spec.path.forEach((p, i) => {
      const prev = cells[cells.length - 1], c: V3 = [p[0], p[1], p[2]];
      const din: V3 = [c[0] - prev.c[0], c[1] - prev.c[1], c[2] - prev.c[2]];
      const fall = din[1] < 0;
      const level = spec.levels?.[i] ?? (fall ? 8 : Math.min(7, (prev.fall ? 0 : prev.level) + d.drop));
      const a = p.length > 3 ? p[3] : i === 0 ? start : prev.a + (fall ? fallStep : rate);
      cells.push({ c, key: K(...c), level, up: cells.length - 1, din, fall, a, src: false });
    });
    return cells;
  }
  // the game's spread: down first (a cell that can fall does not spread sideways), else sideways toward the nearest
  // drop within `slope` cells (all ways when there is none), one level thinner per step
  const reach = spec.spread ?? d.spread;
  const seen = new Map<string, number>([[src.key, 0]]);
  const open = (x: number, y: number, z: number) => !solid(x, y, z);
  const SIDES: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  /** steps to the nearest hole from n (moving away from `from`), or Infinity */
  const holeDist = (n: V3, max: number) => {
    let ring: V3[] = [n]; const vis = new Set([K(...n)]);
    for (let s = 0; s < max; s++) {
      const next: V3[] = [];
      for (const p of ring) {
        if (open(p[0], p[1] - 1, p[2])) return s;
        for (const v of SIDES) { const q: V3 = [p[0] + v[0], p[1], p[2] + v[2]], k = K(...q); if (!vis.has(k) && open(...q)) { vis.add(k); next.push(q); } }
      }
      ring = next;
    }
    return Infinity;
  };
  const queue = [0];
  const startA = (i: number) => (i === 0 ? start : cells[i].a);
  while (queue.length && cells.length < 256) {
    queue.sort((p, q) => startA(p) - startA(q));
    const i = queue.shift()!, cur = cells[i], [x, y, z] = cur.c;
    const t0 = i === 0 ? start - rate : cur.a;                     // the source "arrives" so its first cell is at start
    if (open(x, y - 1, z)) {
      const c: V3 = [x, y - 1, z], k = K(...c);
      if (!seen.has(k)) { seen.set(k, cells.length); queue.push(cells.length); cells.push({ c, key: k, level: 8, up: i, din: [0, -1, 0], fall: true, a: (i === 0 ? start : t0 + fallStep), src: false }); }
      continue;
    }
    const level = cur.fall ? d.drop : cur.level + d.drop;
    const dist = cur.fall ? 1 : cur.level / d.drop + 1;
    if (level > 7 || dist > reach) continue;
    let sides = SIDES.map((v) => [x + v[0], y, z + v[2]] as V3).filter((n) => open(...n));
    const hd = sides.map((n) => holeDist(n, d.slope));
    const best = Math.min(...hd);
    if (best < Infinity) sides = sides.filter((_, j) => hd[j] === best);
    for (const c of sides) {
      const k = K(...c);
      if (seen.has(k)) continue;
      seen.set(k, cells.length); queue.push(cells.length);
      cells.push({ c, key: k, level, up: i, din: [c[0] - x, 0, c[2] - z], fall: false, a: t0 + rate, src: false });
    }
  }
  return cells;
};

/** cut [s, e) pieces out of an interval list by blocked spans (a contact block sits in the cell) */
const subtract = (ivs: Iv[], blocks: [number, number][], refill: number): Iv[] => {
  let out = ivs;
  for (const [b0, b1] of blocks) {
    const next: Iv[] = [];
    for (const iv of out) {
      const end = iv.e + iv.gout;
      if (b1 <= iv.s || b0 >= end) { next.push(iv); continue; }
      if (b0 > iv.s) next.push({ ...iv, e: Math.min(iv.e, b0), gout: b0 < iv.e ? 2 : iv.gout });   // gone under the pop
      if (b1 < iv.e) next.push({ s: b1 + 1, e: iv.e, gin: refill, gout: iv.gout });                // flows back in
    }
    out = next;
  }
  return out;
};

/** every body of a shot, with the frames each cell holds fluid */
const prepBodies = (specs: FluidSpec[], contacts: ContactSpec[] | undefined, lw: LoadedWorld): Body[] => {
  const skip = contactCells(contacts);
  const blocksAt = new Map<string, [number, number][]>();
  for (const c of contacts ?? []) for (const p of [c.at, ...(c.clear ?? [])]) {
    const k = K(p[0], p[1], p[2]), list = blocksAt.get(k) ?? [];
    list.push([c.f, c.until ?? NEVER]); blocksAt.set(k, list);
  }
  return specs.map((spec) => {
    const d = DEF[spec.kind], rate = spec.rate ?? d.rate, fill = spec.fill ?? Math.min(rate, 8);
    const cells = flowCells(spec, lw, skip);
    // the source: swells in; ends when scooped, drained or a contact lands on it (it does not come back)
    let srcEnd = NEVER, srcOut = 3;
    const onSrc = (contacts ?? []).filter((c) => K(...c.at) === cells[0].key).map((c) => c.f);
    if (onSrc.length) { srcEnd = Math.min(...onSrc); srcOut = 2; }
    if (spec.drain !== undefined && spec.drain < srcEnd) { srcEnd = spec.drain; srcOut = 3; }
    const L = spec.scoop ? spec.scoop.len ?? 16 : 0;
    if (spec.scoop && spec.scoop.f + 0.4 * L < srcEnd) { srcEnd = spec.scoop.f + 0.4 * L; srcOut = 0.6 * L; }
    const ivs: Iv[][] = [[{ s: cells[0].a, e: srcEnd, gin: spec.f0 !== undefined ? spec.grow ?? 4 : 0, gout: srcOut }]];
    // scooped cells pull back from the far end: rank by arrival, last first
    const order = cells.map((c, i) => i).filter((i) => i > 0).sort((p, q) => cells[q].a - cells[p].a);
    const n = order.length;
    cells.forEach((cell, i) => {
      if (i === 0) return;
      const up = ivs[cell.up], step = cell.a - cells[cell.up].a;
      let mine: Iv[] = up.map((u) => ({
        s: u.s + (u.s === cells[cell.up].a || u.s <= FAR / 2 ? step : Math.max(2, step * 0.5)),
        e: u.e >= NEVER ? NEVER : u.e + (u.gout <= 3 ? Math.max(3, rate * 0.5) : 0), gin: cell.fall ? Math.max(4, fill * 0.7) : fill, gout: fill,
      }));
      if (cells[cell.up].src && cell.a <= FAR / 2) mine = mine.map((m) => ({ ...m, s: FAR }));
      if (spec.scoop) {
        const r = order.indexOf(i), e = spec.scoop.f + (r / Math.max(1, n)) * 0.4 * L, g = Math.max(3, ((0.4 * L) / Math.max(1, n)) * 1.6);
        mine = mine.map((m) => (m.e > e ? { ...m, e, gout: g } : m));
      }
      ivs[i] = subtract(mine, blocksAt.get(cell.key) ?? [], fill);
    });
    return { spec, kind: spec.kind, cells, ivs, fill };
  });
};

const amountOf = (ivs: Iv[], f: number) => {
  let k = 0;
  for (const iv of ivs) {
    if (f < iv.s) continue;
    const kin = iv.gin > 0 ? smooth((f - iv.s) / iv.gin) : 1;
    const kout = f <= iv.e ? 1 : iv.gout > 0 ? 1 - smooth((f - iv.e) / iv.gout) : 0;
    k = Math.max(k, kin * kout);
  }
  return k;
};

/** "x,y,z" keys of every cell the Wave A layer draws (left out of the merged world mesh) */
const bodyCache = new WeakMap<object, WeakMap<LoadedWorld, Body[]>>();
const bodiesOf = (fx: WaveAFx, lw: LoadedWorld): Body[] => {
  const specs = fx.fluids ?? [];
  let m = bodyCache.get(specs);
  if (!m) { m = new WeakMap(); bodyCache.set(specs, m); }
  let b = m.get(lw);
  if (!b) { b = prepBodies(specs, fx.contacts, lw); m.set(lw, b); }
  return b;
};
export const fluidKeys = (fx: WaveAFx | undefined, lw: LoadedWorld): string[] => {
  if (!fx?.fluids?.length && !fx?.contacts?.length) return [];
  const s = contactCells(fx.contacts);
  for (const b of bodiesOf(fx, lw)) for (const c of b.cells) s.add(c.key);
  return [...s];
};

// ---------------------------------------------------------------- geometry (rebuilt per frame, a few dozen quads)
type RCell = { x: number; y: number; z: number; k: number; h: number; src: boolean; fall: boolean; din: V3 | null };
const levelH = (lv: number) => (lv === 0 || lv >= 8 ? 8 / 9 : (8 - lv) / 9);

const buildGeo = (cells: RCell[], solid: (x: number, y: number, z: number) => boolean, tint: string, still: string, flow: string) => {
  const same = new Map(cells.map((c) => [K(c.x, c.y, c.z), c]));
  const has = (x: number, y: number, z: number, min = 0.01) => (same.get(K(x, y, z))?.k ?? 0) > min;
  /** a cell's surface height for the corner average (a column under more fluid is full) */
  const hOf = (c: RCell) => (has(c.x, c.y + 1, c.z, 0.5) ? 1 : c.h);
  const corner = (cx: number, y: number, cz: number) => {
    let sum = 0, w = 0;
    for (const [x, z] of [[cx - 1, cz - 1], [cx, cz - 1], [cx - 1, cz], [cx, cz]]) {
      if (has(x, y + 1, z, 0.5)) return 1;
      const n = same.get(K(x, y, z));
      const air = solid(x, y, z) ? 0 : 1;
      if (n && n.k > 0) {
        const hh = hOf(n), ww = hh >= 0.8 ? 10 : 1, k = n.fall && n.k < 1 ? 0 : smooth(n.k);
        sum += hh * ww * k; w += ww * k + air * (1 - k);
      } else w += air;
    }
    return w ? sum / w : 8 / 9;
  };
  const tc = new THREE.Color(tint);
  const B: Record<string, { pos: number[]; nrm: number[]; uv: number[]; col: number[] }> = { [still]: { pos: [], nrm: [], uv: [], col: [] }, [flow]: { pos: [], nrm: [], uv: [], col: [] } };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  /** a quad, wound to face `n` (game face shade from it) */
  const quad = (tex: string, p: THREE.Vector3[], uv: [number, number][], n: THREE.Vector3) => {
    const g = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0]));
    const order = g.dot(n) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    const sh = n.x * n.x * 0.6 + n.y * n.y * (n.y > 0 ? 1 : 0.5) + n.z * n.z * 0.8;
    const b = B[tex];
    for (const i of order) { b.pos.push(p[i].x, p[i].y, p[i].z); b.nrm.push(n.x, n.y, n.z); b.uv.push(uv[i][0], uv[i][1]); b.col.push(tc.r * sh, tc.g * sh, tc.b * sh); }
  };
  /** flow uvs: the frame's centre half, turned so the ripples run along angle a (0 = +z) */
  const flowUV = (a: number, pts: [number, number][]) => pts.map(([s, t]) => {
    const c = Math.cos(a), sn = Math.sin(a), du = s - 0.5, dv = t - 0.5;
    return [0.5 + 0.5 * (du * c - dv * sn), 0.5 + 0.5 * (du * sn + dv * c)] as [number, number];
  });
  /** a vertical wall quad from (ax, az) to (bx, bz), bottom yb, tops ya / yb2, facing n */
  const wall = (ax: number, az: number, bx: number, bz: number, y0: number, ta: number, tb: number, n: THREE.Vector3) => {
    if (ta - y0 < 0.002 && tb - y0 < 0.002) return;
    const len = Math.hypot(bx - ax, bz - az);
    quad(flow, [V(ax, ta, az), V(bx, tb, bz), V(bx, y0, bz), V(ax, y0, az)],
      flowUV(0, [[0, 0.5 + 0.5 * c01(ta - y0)], [len, 0.5 + 0.5 * c01(tb - y0)], [len, 0.5], [0, 0.5]]), n);
  };
  for (const c of cells) {
    if (c.k <= 0.002) continue;
    const { x, y, z } = c;
    const above = has(x, y + 1, z, 0.5);
    // ---- a fall filling a hole: the stream comes down first (k 0..0.3), then the pool rises under it
    if (c.fall && c.k < 0.999 && !above) {
      const kf = c01(c.k / 0.3), pool = c.k > 0.3 ? levelH(8) * smooth((c.k - 0.3) / 0.7) : 0;
      const top = y + 1, bot = c.k < 0.3 ? top - kf : y + pool, e = 0.14;
      if (top - bot > 0.01) for (const [n, ax, az, bx, bz] of [
        [V(0, 0, -1), x + e, z + e, x + 1 - e, z + e], [V(0, 0, 1), x + 1 - e, z + 1 - e, x + e, z + 1 - e],
        [V(-1, 0, 0), x + e, z + 1 - e, x + e, z + e], [V(1, 0, 0), x + 1 - e, z + e, x + 1 - e, z + 1 - e]] as [THREE.Vector3, number, number, number, number][]) wall(ax, az, bx, bz, bot, top, top, n);
      if (pool > 0.01) {
        quad(still, [V(x, y + pool, z), V(x + 1, y + pool, z), V(x + 1, y + pool, z + 1), V(x, y + pool, z + 1)], [[0, 1], [1, 1], [1, 0], [0, 0]], V(0, 1, 0));
        if (!solid(x, y, z - 1)) wall(x + 1, z, x, z, y, y + pool, y + pool, V(0, 0, -1));
        if (!solid(x, y, z + 1)) wall(x, z + 1, x + 1, z + 1, y, y + pool, y + pool, V(0, 0, 1));
        if (!solid(x - 1, y, z)) wall(x, z, x, z + 1, y, y + pool, y + pool, V(-1, 0, 0));
        if (!solid(x + 1, y, z)) wall(x + 1, z + 1, x + 1, z, y, y + pool, y + pool, V(1, 0, 0));
      }
      continue;
    }
    // ---- the extent: a source swells from its centre, a flow creeps in from the face it came from
    let u0 = 0, u1 = 1, v0 = 0, v1 = 1, hs = 1;
    const k = smooth(c.k);
    if (c.src) { const r = 0.5 * Math.min(1, 0.25 + 0.75 * Math.sqrt(k)); u0 = v0 = 0.5 - r; u1 = v1 = 0.5 + r; hs = 0.15 + 0.85 * k; }
    else if (c.din && c.din[1] === 0 && k < 0.999) {
      if (c.din[0] > 0) u1 = k; else if (c.din[0] < 0) u0 = 1 - k;
      if (c.din[2] > 0) v1 = k; else if (c.din[2] < 0) v0 = 1 - k;
    }
    // corners of the cell (NW, NE, SE, SW), bilinear inside it
    const g = above ? [1, 1, 1, 1] : [corner(x, y, z), corner(x + 1, y, z), corner(x + 1, y, z + 1), corner(x, y, z + 1)];
    const hAt = (u: number, v: number) => {
      const t = g[0] * (1 - u) + g[1] * u, b = g[3] * (1 - u) + g[2] * u;
      return Math.max(0.02, Math.min(above ? 1 : 8 / 9, (t * (1 - v) + b * v) * hs));
    };
    const hNW = hAt(u0, v0), hNE = hAt(u1, v0), hSE = hAt(u1, v1), hSW = hAt(u0, v1);
    const X0 = x + u0, X1 = x + u1, Z0 = z + v0, Z1 = z + v1;
    if (!above) {
      const gx = (hNE + hSE) - (hNW + hSW), gz = (hSW + hSE) - (hNW + hNE);
      const flat = Math.hypot(gx, gz) < 0.02;
      const pts = [V(X0, y + hNW, Z0), V(X1, y + hNE, Z0), V(X1, y + hSE, Z1), V(X0, y + hSW, Z1)];
      const base: [number, number][] = [[u0, 1 - v0], [u1, 1 - v0], [u1, 1 - v1], [u0, 1 - v1]];
      quad(flat ? still : flow, pts, flat ? base : flowUV(Math.atan2(gx, -gz), base), V(0, 1, 0));
    }
    // sides: an inner edge (the creeping front) always; a cell face toward open air / a cut cell / the other fluid
    const side = (inner: boolean, nx: number, nz: number) => inner || (!solid(nx, y, nz) && !has(nx, y, nz));
    if (side(v0 > 0.001, x, z - 1)) wall(X1, Z0, X0, Z0, y, y + hNE, y + hNW, V(0, 0, -1));
    if (side(v1 < 0.999, x, z + 1)) wall(X0, Z1, X1, Z1, y, y + hSW, y + hSE, V(0, 0, 1));
    if (side(u0 > 0.001, x - 1, z)) wall(X0, Z0, X0, Z1, y, y + hNW, y + hSW, V(-1, 0, 0));
    if (side(u1 < 0.999, x + 1, z)) wall(X1, Z1, X1, Z0, y, y + hSE, y + hNE, V(1, 0, 0));
    if (!solid(x, y - 1, z) && !has(x, y - 1, z)) quad(still, [V(X0, y, Z1), V(X1, y, Z1), V(X1, y, Z0), V(X0, y, Z0)], [[0, 1], [1, 1], [1, 0], [0, 0]], V(0, -1, 0));
  }
  const geo = new THREE.BufferGeometry();
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [], keys: string[] = [];
  for (const [tex, b] of Object.entries(B)) {
    if (!b.pos.length) continue;
    geo.addGroup(pos.length / 3, b.pos.length / 3, keys.length);
    keys.push(tex);
    pos.push(...b.pos); nrm.push(...b.nrm); uv.push(...b.uv); col.push(...b.col);
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return { geo, keys };
};

// ---------------------------------------------------------------- materials
const matCache = new Map<string, THREE.MeshLambertMaterial>();
const fluidMat = (kind: "lava" | "water", tex: THREE.Texture | undefined, role: string) => {
  const key = `${kind}|${role}|${tex?.uuid ?? "none"}`;
  let m = matCache.get(key);
  if (!m) {
    m = kind === "lava"
      ? new THREE.MeshLambertMaterial({ map: tex ?? null, vertexColors: true, color: tex ? "#ffffff" : "#ff7a1a", emissive: new THREE.Color("#ffffff"), emissiveMap: tex ?? null, emissiveIntensity: 0.75 })
      // water: see-through like the game's translucent layer (no depth write, drawn after the opaque world)
      : new THREE.MeshLambertMaterial({ map: tex ?? null, vertexColors: true, transparent: true, depthWrite: false, opacity: tex ? 1 : 0.7 });
    matCache.set(key, m);
  }
  return m;
};
const bodyMats = new Map<string, THREE.Material>();
const waterBody = (tint: string) => {
  let m = bodyMats.get(tint);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false }); bodyMats.set(tint, m); }
  return m;
};
const texFor = (fx: FxTex, lw: LoadedWorld, key: string, frame: number) => stepFx(fx, key, frame, KEY_FPS) ?? lw.textures[key];

const STREAM_GEO = new THREE.BoxGeometry(1, 1, 1);

/** every fluid of one kind in one mesh (+ the lava light, + scoop streams) */
const FluidKind: React.FC<{ kind: "lava" | "water"; bodies: Body[]; frame: number; solid: (x: number, y: number, z: number) => boolean; lw: LoadedWorld; fx: FxTex }> = ({ kind, bodies, frame, solid, lw, fx }) => {
  const cells: RCell[] = [];
  const byKey = new Map<string, RCell>();
  for (const b of bodies) b.cells.forEach((c, i) => {
    const k = amountOf(b.ivs[i], frame);
    if (k <= 0.002) return;
    const key = c.key, prev = byKey.get(key);
    const r: RCell = { x: c.c[0], y: c.c[1], z: c.c[2], k, h: levelH(c.level), src: c.src, fall: c.fall, din: c.din };
    // two bodies in one cell: the fuller one wins (a source beats a flow)
    if (prev && (prev.k > k || (prev.src && !r.src))) return;
    if (prev) cells.splice(cells.indexOf(prev), 1);
    byKey.set(key, r); cells.push(r);
  });
  const still = `block/${kind}_still`, flow = `block/${kind}_flow`;
  const tint = kind === "water" ? fx.water : "#ffffff";
  const built = cells.length ? buildGeo(cells, solid, tint, still, flow) : null;
  const prev = useRef<THREE.BufferGeometry | null>(null);
  useEffect(() => { const old = prev.current; prev.current = built?.geo ?? null; if (old && old !== built?.geo) old.dispose(); });
  const mats = built?.keys.map((t) => fluidMat(kind, texFor(fx, lw, t, frame), t)) ?? [];
  // scoop streams: the source rises out of the trench into the bucket
  const streams: React.ReactNode[] = [];
  for (const [bi, b] of bodies.entries()) {
    const sc = b.spec.scoop;
    if (!sc) continue;
    const L = sc.len ?? 16, a = sc.f + 0.3 * L, e = sc.f + L;
    if (frame < a || frame > e + 2) continue;
    const s = b.cells[0].c, from = new THREE.Vector3(s[0] + 0.5, s[1] + 0.5, s[2] + 0.5), to = new THREE.Vector3(...sc.to);
    const head = smooth((frame - a) / 3), tail = smooth((frame - (e - 4)) / 6);
    const bot = from.clone().lerp(to, tail), top = from.clone().lerp(to, head);
    const len = bot.distanceTo(top);
    if (len < 0.02) continue;
    const mid = bot.clone().add(top).multiplyScalar(0.5), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize());
    const w = 0.22 * (1 - 0.5 * tail);
    streams.push(<mesh key={`sc${bi}`} geometry={STREAM_GEO} position={mid} quaternion={q} scale={[w, len, w]} material={fluidMat(kind, texFor(fx, lw, flow, frame), "stream")} renderOrder={kind === "water" ? 13 : 0} />);
  }
  // lava light: warm, flickering, at the middle of what glows, stronger the more there is
  let light: React.ReactNode = null;
  if (kind === "lava" && cells.length) {
    const L = Math.max(...bodies.map((b) => b.spec.light ?? 1));
    if (L > 0) {
      let sx = 0, sy = 0, sz = 0, sk = 0;
      for (const c of cells) { sx += (c.x + 0.5) * c.k; sy += (c.y + 0.9) * c.k; sz += (c.z + 0.5) * c.k; sk += c.k; }
      const fl = 0.86 + 0.08 * Math.sin(frame * 0.9) + 0.06 * Math.sin(frame * 2.3 + 1) + 0.08 * (keyNoise((n) => rnd(77, n), frame / 2) - 0.5);
      light = <pointLight position={[sx / sk, sy / sk + 0.5, sz / sk]} color="#ff8a34" intensity={L * (3 + 2.5 * Math.sqrt(sk)) * fl} distance={4 + Math.sqrt(sk)} decay={1.6} />;
    }
  }
  return (
    <>
      {/* water: a faint blue body under the see-through texture, so a column seen from the side (a cutaway) reads as water */}
      {built && kind === "water" && <mesh geometry={built.geo} material={waterBody(tint)} renderOrder={1} />}
      {built && <mesh geometry={built.geo} material={mats} receiveShadow renderOrder={kind === "water" ? 2 : 0} />}
      {streams}
      {light}
    </>
  );
};

// ---------------------------------------------------------------- contacts
const cubeOf = (id: string): CBlock => ({
  key: `fx:${id}`, id, shape: "cube", layer: "opaque", tint: null, rotX: 0, rotY: 0, light: 0, positions: [],
  elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: Object.fromEntries((["down", "up", "north", "south", "west", "east"] as const).map((d) => [d, { tex: `block/${id}`, uv: [0, 0, 16, 16] as [number, number, number, number] }])) }],
});
const fxProtos = new Map<string, THREE.Group>();
/** a contact block's object and mote colour: from any loaded set, else from the shared fx textures */
export const contactBlock = (id: string, lw: LoadedWorld, worlds: WorldMap, fx: FxTex): { obj: THREE.Object3D; color: string } | null => {
  for (const w of [lw, ...Object.values(worlds)]) {
    const b = w.world.blocks.find((x) => x.id === id && x.shape === "cube");
    if (b) { const tex = b.elements[0]?.faces.north?.tex; return { obj: protoOf(b, w, lw).clone(), color: avgColor(tex ? w.textures[tex] : undefined, `${w.dir}|${b.key}`) }; }
  }
  const t = fx.tex[`block/${id}`];
  if (!t) return null;
  let g = fxProtos.get(id);
  if (!g) { g = blockObject(cubeOf(id), fx.tex); fxProtos.set(id, g); }
  return { obj: g.clone(), color: avgColor(t, `fx|${id}`) };
};

const crackMats = new WeakMap<THREE.Texture, THREE.Material>();
/** the game's crack stage multiplied over the block (2 * src * dst) */
export const crackMat = (tex: THREE.Texture) => {
  let m = crackMats.get(tex);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, alphaTest: 0.1, depthWrite: false, toneMapped: false, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    crackMats.set(tex, m);
  }
  return m;
};
const CUBE = new THREE.BoxGeometry(1, 1, 1);

const Contacts: React.FC<{ specs: ContactSpec[]; lw: LoadedWorld; worlds: WorldMap; fx: FxTex; frame: number }> = ({ specs, lw, worlds, fx, frame }) => {
  const items = useMemo(() => specs.map((s, i) => ({ s, i, blk: contactBlock(s.block ?? "cobblestone", lw, worlds, fx) })), [specs, lw, worlds, fx]);
  const nodes: React.ReactNode[] = [], motes: Mote[] = [];
  for (const { s, i, blk } of items) {
    const [x, y, z] = s.at, u = frame - s.f, seed = 3100 + i * 37;
    const standing = u >= 0 && (s.until === undefined || frame < s.until);
    if (blk && standing) {
      const sc = popScale(u);
      const crack = s.until !== undefined && s.crack ? Math.floor(10 * c01((frame - (s.until - s.crack)) / s.crack)) : -1;
      const ct = crack >= 0 && frame >= (s.until ?? 0) - (s.crack ?? 0) ? fx.tex[`block/destroy_stage_${Math.min(9, crack)}`] : undefined;
      nodes.push(
        <group key={`c${i}`} position={[x + 0.5, y + 0.5, z + 0.5]} scale={sc}>
          <primitive object={blk.obj} position={[0, -0.5, 0]} />
          {ct && <mesh geometry={CUBE} material={crackMat(ct)} scale={1.002} renderOrder={6} />}
        </group>,
      );
      // hot: an orange glow on the new block, fading
      const hot = s.hot ?? 8, gk = hot > 0 ? 1 - c01(u / hot) : 0;
      if (gk > 0) nodes.push(
        <mesh key={`h${i}`} geometry={CUBE} position={[x + 0.5, y + 0.5, z + 0.5]} scale={1.012 * sc} renderOrder={12}>
          <meshBasicMaterial color="#ff5000" transparent opacity={0.32 * gk * gk} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>,
      );
    }
    // the hiss: two white puffs rising and a burst of small white smoke squares (Minecraft's extinguish particles)
    if (s.hiss !== false && u >= 0 && u <= 26) {
      const top: V3 = [x + 0.5, y + 1.0, z + 0.5];
      nodes.push(<SmokePuff key={`p${i}a`} fx={fx} at={[top[0] - 0.15, top[1], top[2] + 0.1]} u={u} seed={seed} life={24} rise={1.4} size={1.15} color="#ffffff" opacity={0.95} />);
      nodes.push(<SmokePuff key={`p${i}b`} fx={fx} at={[top[0] + 0.2, top[1] - 0.1, top[2] - 0.1]} u={u - 3} seed={seed + 1} life={22} rise={1.1} size={0.9} color="#ffffff" opacity={0.85} />);
      for (let j = 0; j < 8; j++) {
        const a = u / 18;
        if (a < 0 || a >= 1) continue;
        const ang = (j / 8) * Math.PI * 2 + rnd(seed, j) * 0.7, r = 0.2 + (0.35 + 0.35 * rnd(seed, j + 9)) * (1 - (1 - a) ** 2);
        nodes.push(<SmokeSq key={`q${i}:${j}`} fx={fx} k={a} size={0.22 + 0.1 * rnd(seed, j + 20)} grey={0.92}
          at={[top[0] + Math.cos(ang) * r, top[1] - 0.1 + a * (0.9 + 0.6 * rnd(seed, j + 30)), top[2] + Math.sin(ang) * r]} />);
      }
    }
    // the fluid cells it clears fizzle with a small puff each
    (s.clear ?? []).forEach((p, j) => {
      if (u < 0 || u > 18) return;
      nodes.push(<SmokePuff key={`cl${i}:${j}`} fx={fx} at={[p[0] + 0.5, p[1] + 0.9, p[2] + 0.5]} u={u - 1} seed={seed + 50 + j} life={16} rise={0.9} size={0.55} color="#ffffff" opacity={0.7} />);
    });
    // mined: breaks into motes of its colour
    if (blk && s.until !== undefined) breakMotes(motes, s.at, frame - s.until, blk.color, 6, seed, y);
  }
  return <>{nodes}<Motes motes={motes} /></>;
};

// ---------------------------------------------------------------- the layer
/** every Wave A fluid and contact of a shot. cut = the cutaway keys hidden this frame (they read as open air) */
export const Fluids: React.FC<{ lw: LoadedWorld; worlds: WorldMap; dir: WaveAFx; cut: string[]; fx: FxTex }> = ({ lw, worlds, dir, cut, fx }) => {
  const frame = useMcFrame();
  const bodies = bodiesOf(dir, lw);
  const at = blockAt(lw), mine = useMemo(() => new Set(fluidKeys(dir, lw)), [dir, lw]);
  const cutSet = new Set(cut);
  // contact blocks standing now are solid; cells this layer draws are otherwise open; cut cells are open
  const standing = new Set((dir.contacts ?? []).filter((c) => frame >= c.f && (c.until === undefined || frame < c.until)).map((c) => K(...c.at)));
  const solid = (x: number, y: number, z: number) => {
    const k = K(x, y, z);
    if (standing.has(k)) return true;
    if (mine.has(k) || cutSet.has(k)) return false;
    const b = at.get(k);
    return !!b && b.shape !== "fluid" && b.shape !== "cross";
  };
  const lava = bodies.filter((b) => b.kind === "lava"), water = bodies.filter((b) => b.kind === "water");
  return (
    <>
      {lava.length > 0 && <FluidKind kind="lava" bodies={lava} frame={frame} solid={solid} lw={lw} fx={fx} />}
      {water.length > 0 && <FluidKind kind="water" bodies={water} frame={frame} solid={solid} lw={lw} fx={fx} />}
      {dir.contacts?.length ? <Contacts specs={dir.contacts} lw={lw} worlds={worlds} fx={fx} frame={frame} /> : null}
    </>
  );
};

// ---------------------------------------------------------------- soft outline
const BAR = new THREE.BoxGeometry(1, 1, 1);
const SoftOutline: React.FC<{ s: SoftOutlineSpec }> = ({ s }) => {
  const frame = useMcFrame();
  const k = smooth((frame - s.f) / 8) * (s.out !== undefined ? 1 - smooth((frame - s.out) / 8) : 1);
  if (k <= 0.01) return null;
  const pulse = s.pulse === false ? 1 : 0.8 + 0.2 * Math.sin(frame / 7);
  const a = [Math.min(s.from[0], s.to[0]), Math.min(s.from[1], s.to[1]), Math.min(s.from[2], s.to[2])];
  const b = [Math.max(s.from[0], s.to[0]) + 1, Math.max(s.from[1], s.to[1]) + 1, Math.max(s.from[2], s.to[2]) + 1];
  const pad = 0.02, lo = a.map((v) => v - pad), hi = b.map((v) => v + pad);
  const mid = (i: number) => (lo[i] + hi[i]) / 2, len = (i: number) => hi[i] - lo[i];
  const bars = (w: number) => {
    const out: { p: V3; sc: V3 }[] = [];
    for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) out.push({ p: [mid(0), y, z], sc: [len(0) + w, w, w] });
    for (const x of [lo[0], hi[0]]) for (const z of [lo[2], hi[2]]) out.push({ p: [x, mid(1), z], sc: [w, len(1) + w, w] });
    for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) out.push({ p: [x, y, mid(2)], sc: [w, w, len(2) + w] });
    return out;
  };
  const halo = s.halo ?? 0.16;
  return (
    <>
      <Outline from={s.from} to={s.to} color={s.color} f={s.f} out={s.out} width={s.width ?? 0.04} />
      {[[halo, 0.32], [halo * 2, 0.14]].map(([w, o], j) => bars(w).map((bb, i) => (
        <mesh key={`${j}:${i}`} position={bb.p} scale={bb.sc} geometry={BAR} renderOrder={21}>
          <meshBasicMaterial color={s.color} transparent opacity={o * k * pulse} blending={THREE.AdditiveBlending} toneMapped={false} depthWrite={false} />
        </mesh>
      )))}
    </>
  );
};
export const SoftOutlines: React.FC<{ specs: SoftOutlineSpec[] }> = ({ specs }) => <>{specs.map((s, i) => <SoftOutline key={i} s={s} />)}</>;
