// Blocks that break apart with physics: on frame f every block of the spec splits into split^3 chunks (its own
// textures, a smaller block each) that are thrown away from `origin`, fall, bounce off the voxel world, slide, tumble
// and settle flat; chunks stack on resting chunks, water slows them. The whole flight is simulated ONCE per spec
// (fixed 1/120 s steps, seeded randoms), then each frame just reads its row: frames rendered out of order or in
// parallel all agree. Before f the blocks stand as built (they are left out of the merged world mesh).
import React, { useMemo } from "react";
import * as THREE from "three";
import { useMcFrame } from "./mcTime";
import { blockObject } from "./Actors";
import type { LoadedWorld } from "./VoxelWorld";
import type { CBlock } from "./types";

type V3 = [number, number, number];
export type ShatterSpec = {
  /** frame the blocks break */
  f: number;
  /** one block [x,y,z], or a box from..to (inclusive) */
  at?: V3; from?: V3; to?: V3;
  /** or any list of cells (an explosion's crater) */
  cells?: V3[];
  /** where the hit comes from: chunks fly away from it (default: the middle of the box's bottom face) */
  origin?: V3;
  /** outward speed, blocks/s (default 6) */
  power?: number;
  /** extra upward speed, blocks/s (default 3) */
  up?: number;
  /** chunks per block edge: 1 = whole blocks tumble, 2 = eight chunks a block (default 2) */
  split?: number;
  /** a velocity every chunk also carries (the thing was already moving), blocks/s */
  vel?: V3;
  /** gravity, blocks/s^2 (default 24) */
  gravity?: number;
  /** spin, rad/s (default 9) */
  spin?: number;
  /** frames after f before the chunks shrink away (12 f); default: they stay */
  life?: number;
  /** bodies the chunks must not pass through (the character who hit it): upright cylinders, centre [x, z],
   *  radius r, from y0 to y1. Chunks starting inside are pushed out on the spot; chunks reaching one bounce off it. */
  avoid?: { at: [number, number]; r?: number; y0: number; y1: number }[];
};

export const shatterCells = (s: ShatterSpec): V3[] => {
  if (s.cells) return s.cells;
  if (s.at) return [s.at];
  const out: V3[] = [], a = s.from!, b = s.to!;
  for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++)
    for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++)
      for (let z = Math.min(a[2], b[2]); z <= Math.max(a[2], b[2]); z++) out.push([x, y, z]);
  return out;
};

const HORIZON = 240, SUB = 4, DT = 1 / 30 / SUB;
const rnd = (i: number, k: number) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const nearestQuarter = (a: number) => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);

type Piece = { block: CBlock; size: number; track: Float32Array };

/** the whole flight: per chunk, HORIZON rows of [x, y, z, rx, ry, rz] (chunk centre, euler) */
const simulate = (s: ShatterSpec, cells: { cell: V3; block: CBlock }[], solid: (x: number, y: number, z: number) => boolean, fluid: (x: number, y: number, z: number) => boolean): Piece[] => {
  const n = Math.max(1, Math.round(s.split ?? 2)), size = 1 / n, h = size / 2;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const { cell } of cells) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], cell[k]); hi[k] = Math.max(hi[k], cell[k] + 1); }
  const origin = s.origin ?? [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2];
  const power = s.power ?? 6, up = s.up ?? 3, g = s.gravity ?? 24, spin = s.spin ?? 9, vel = s.vel ?? [0, 0, 0];
  type P = { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Vector3; w: THREE.Vector3; rest: boolean; piece: Piece };
  const ps: P[] = [];
  const avoid = (s.avoid ?? []).map((a) => ({ ...a, r: a.r ?? 0.45 }));
  /** inside a body: push the chunk to its surface (radially) and turn its velocity outward */
  const keepOut = (p: THREE.Vector3, v: THREE.Vector3) => {
    for (const a of avoid) {
      if (p.y + h < a.y0 || p.y - h > a.y1) continue;
      let dx = p.x - a.at[0], dz = p.z - a.at[1];
      const R = a.r + h, d = Math.hypot(dx, dz);
      if (d >= R) continue;
      if (d < 1e-4) { dx = 0; dz = 1; } else { dx /= d; dz /= d; }
      p.x = a.at[0] + dx * R; p.z = a.at[1] + dz * R;
      const vn = v.x * dx + v.z * dz;
      if (vn < 0) { v.x -= 1.4 * vn * dx; v.z -= 1.4 * vn * dz; }
    }
  };
  let id = 0;
  for (const { cell, block } of cells) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    const p = new THREE.Vector3(cell[0] + (i + 0.5) * size, cell[1] + (j + 0.5) * size, cell[2] + (k + 0.5) * size);
    const d = p.clone().sub(new THREE.Vector3(...origin)).add(new THREE.Vector3(rnd(id, 1) - 0.5, rnd(id, 2) - 0.5, rnd(id, 3) - 0.5).multiplyScalar(0.6));
    if (d.lengthSq() < 1e-6) d.set(0, 1, 0);
    const v = d.normalize().multiplyScalar(power * (0.55 + 0.7 * rnd(id, 4))).add(new THREE.Vector3(vel[0], vel[1] + up * (0.5 + rnd(id, 5)), vel[2]));
    const w = new THREE.Vector3(rnd(id, 6) - 0.5, rnd(id, 7) - 0.5, rnd(id, 8) - 0.5).multiplyScalar(2 * spin);
    keepOut(p, v);
    ps.push({ p, v, r: new THREE.Vector3(), w, rest: false, piece: { block, size, track: new Float32Array(HORIZON * 6) } });
    id++;
  }
  // resting chunks stack: the top of the pile per chunk-sized column
  const pile = new Map<string, number>();
  const col = (x: number, z: number) => `${Math.floor(x / size)},${Math.floor(z / size)}`;
  const fl = Math.floor;
  for (let f = 0; f < HORIZON; f++) {
    for (const q of ps) {
      if (!q.rest) for (let st = 0; st < SUB; st++) {
        const wet = fluid(fl(q.p.x), fl(q.p.y), fl(q.p.z));
        q.v.y -= g * DT * (wet ? 0.25 : 1);
        if (wet) { q.v.multiplyScalar(0.97); q.w.multiplyScalar(0.98); }
        const np = q.p.clone().addScaledVector(q.v, DT);
        // walls: bounce back off a solid block beside
        if (solid(fl(np.x + Math.sign(q.v.x) * h), fl(np.y), fl(q.p.z))) { q.v.x *= -0.3; np.x = q.p.x; }
        if (solid(fl(np.x), fl(np.y), fl(np.z + Math.sign(q.v.z) * h))) { q.v.z *= -0.3; np.z = q.p.z; }
        if (q.v.y > 0 && solid(fl(np.x), fl(np.y + h), fl(np.z))) { q.v.y *= -0.2; np.y = q.p.y; }
        // floor: the block below, or the pile of resting chunks
        let floor = -Infinity;
        if (solid(fl(np.x), fl(np.y - h), fl(np.z))) floor = fl(np.y - h) + 1;
        const top = pile.get(col(np.x, np.z));
        if (top !== undefined && q.p.y - h >= top - 0.02) floor = Math.max(floor, top);
        if (q.v.y <= 0 && np.y - h < floor) {
          np.y = floor + h;
          q.v.y = q.v.y < -2 ? -q.v.y * 0.28 : 0;
          q.v.x *= 0.7; q.v.z *= 0.7; q.w.multiplyScalar(0.55);
          if (q.v.y === 0 && Math.hypot(q.v.x, q.v.z) < 0.5) {
            q.rest = true; q.v.set(0, 0, 0); q.w.set(0, 0, 0);
            pile.set(col(np.x, np.z), np.y + h);
          }
        }
        keepOut(np, q.v);
        q.p.copy(np); q.r.addScaledVector(q.w, DT);
        if (q.rest || q.p.y < -40) break;
      }
      // resting: tip over flat (x and z to the nearest quarter turn), keep the y turn
      if (q.rest) { q.r.x += (nearestQuarter(q.r.x) - q.r.x) * 0.3; q.r.z += (nearestQuarter(q.r.z) - q.r.z) * 0.3; }
      q.piece.track.set([q.p.x, q.p.y, q.p.z, q.r.x, q.r.y, q.r.z], f * 6);
    }
  }
  return ps.map((q) => q.piece);
};

export const Shatter: React.FC<{ lw: LoadedWorld; spec: ShatterSpec }> = ({ lw, spec }) => {
  const frame = useMcFrame();
  const { cells, pieces, protos } = useMemo(() => {
    const byPos = new Map<string, CBlock>();
    for (const b of lw.world.blocks) for (let i = 0; i < b.positions.length; i += 3) byPos.set(`${b.positions[i]},${b.positions[i + 1]},${b.positions[i + 2]}`, b);
    const mine = new Set(shatterCells(spec).map((c) => c.join(",")));
    const cells = shatterCells(spec).flatMap((cell) => { const block = byPos.get(cell.join(",")); return block ? [{ cell, block }] : []; });
    const solid = (x: number, y: number, z: number) => {
      const k = `${x},${y},${z}`, b = byPos.get(k);
      return !!b && !mine.has(k) && (b.shape === "cube" || b.shape === "model");
    };
    const fluid = (x: number, y: number, z: number) => byPos.get(`${x},${y},${z}`)?.shape === "fluid";
    const protos = new Map<string, THREE.Group>();
    for (const { block } of cells) if (!protos.has(block.key)) protos.set(block.key, blockObject(block, lw.textures));
    return { cells, pieces: simulate(spec, cells, solid, fluid), protos };
  }, [lw, spec]);
  const objs = useMemo(() => pieces.map((p) => protos.get(p.block.key)!.clone()), [pieces, protos]);
  const standing = useMemo(() => cells.map(({ block }) => protos.get(block.key)!.clone()), [cells, protos]);
  const t = frame - spec.f;
  if (t < 0) return <>{cells.map(({ cell }, i) => <primitive key={i} object={standing[i]} position={[cell[0] + 0.5, cell[1], cell[2] + 0.5]} />)}</>;
  // the track has one row per key frame: blend the rows around a fractional frame (60 fps in-betweens)
  const row = Math.min(HORIZON - 1, t), r0 = Math.floor(row), r1 = Math.min(HORIZON - 1, r0 + 1), w = row - r0;
  const fade = spec.life !== undefined ? 1 - Math.max(0, Math.min(1, (t - spec.life) / 12)) : 1;
  if (fade <= 0) return null;
  return (
    <>
      {pieces.map((p, i) => {
        const tr = p.track, at = (j: number) => tr[r0 * 6 + j] + (tr[r1 * 6 + j] - tr[r0 * 6 + j]) * w;
        if (at(1) < -30) return null;
        return (
          <group key={i} position={[at(0), at(1), at(2)]} rotation={[at(3), at(4), at(5)]} scale={p.size * fade}>
            <primitive object={objs[i]} position={[0, -0.5, 0]} />
          </group>
        );
      })}
    </>
  );
};
