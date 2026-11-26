// Block geometry from compiled Minecraft model elements. One BufferGeometry per palette key (blockstate rotation
// baked in), with a material group per (texture, overlay) pair. Positions are in block units, 0..1 inside the block.
import * as THREE from "three";
import type { CBlock, CElement, CFace, Dir } from "./types";

// face corners [TL, TR, BR, BL] seen from outside, as (x, y, z) picks from [from, to]: 0 = from, 1 = to
const CORNERS: Record<Dir, [number, number, number][]> = {
  north: [[1, 1, 0], [0, 1, 0], [0, 0, 0], [1, 0, 0]],
  south: [[0, 1, 1], [1, 1, 1], [1, 0, 1], [0, 0, 1]],
  west: [[0, 1, 0], [0, 1, 1], [0, 0, 1], [0, 0, 0]],
  east: [[1, 1, 1], [1, 1, 0], [1, 0, 0], [1, 0, 1]],
  up: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]],
  down: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]],
};
export const DIR_VEC: Record<Dir, [number, number, number]> = {
  north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0], up: [0, 1, 0], down: [0, -1, 0],
};

/** Minecraft's directional face shade from the final normal: up 1.0, down 0.5, N/S 0.8, E/W 0.6 */
const shadeOf = (n: THREE.Vector3) => n.x * n.x * 0.6 + n.y * n.y * (n.y > 0 ? 1 : 0.5) + n.z * n.z * 0.8;

/** the blockstate rotation (x first, then y; clockwise looking down the axis, like the game) about the block centre */
export const stateMatrix = (rotX: number, rotY: number) => {
  const c = new THREE.Matrix4().makeTranslation(0.5, 0.5, 0.5);
  const r = new THREE.Matrix4().makeRotationY((-rotY * Math.PI) / 180).multiply(new THREE.Matrix4().makeRotationX((-rotX * Math.PI) / 180));
  return c.multiply(r).multiply(new THREE.Matrix4().makeTranslation(-0.5, -0.5, -0.5));
};

const elementMatrix = (e: CElement) => {
  if (!e.rotation || !e.rotation.angle) return new THREE.Matrix4();
  const { origin, axis, angle, rescale } = e.rotation;
  const a = (angle * Math.PI) / 180;
  const o = new THREE.Vector3(...origin).divideScalar(16);
  const rot = axis === "x" ? new THREE.Matrix4().makeRotationX(a) : axis === "y" ? new THREE.Matrix4().makeRotationY(a) : new THREE.Matrix4().makeRotationZ(a);
  const s = rescale ? 1 / Math.cos(a) : 1;
  const sc = new THREE.Matrix4().makeScale(axis === "x" ? 1 : s, axis === "y" ? 1 : s, axis === "z" ? 1 : s);
  return new THREE.Matrix4().makeTranslation(o.x, o.y, o.z).multiply(rot).multiply(sc).multiply(new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z));
};

export type GroupKey = { tex: string; overlay: boolean };
export type FaceFilter = (dir: Dir, face: CFace) => boolean;

/** collects quads; build() returns one geometry with a group per GroupKey (same order as keys) */
export class QuadBuilder {
  private buckets = new Map<string, { key: GroupKey; pos: number[]; nrm: number[]; uv: number[]; col: number[] }>();
  add(block: CBlock, offset: [number, number, number], filter?: FaceFilter) {
    const st = stateMatrix(block.rotX, block.rotY);
    const nm = new THREE.Matrix3();
    const tint = new THREE.Color(block.tint ?? "#ffffff");
    block.elements.forEach((e, ei) => {
      const m = st.clone().multiply(elementMatrix(e));
      nm.getNormalMatrix(m);
      const f = e.from.map((v) => v / 16), t = e.to.map((v) => v / 16);
      // a later element of a full cube sits on the same planes (grass overlay): draw it with a depth offset
      const overlay = ei > 0 && block.shape === "cube";
      for (const d of Object.keys(e.faces) as Dir[]) {
        const face = e.faces[d]!;
        if (filter && !filter(d, face)) continue;
        const k = `${face.tex}|${overlay ? 1 : 0}`;
        let b = this.buckets.get(k);
        if (!b) { b = { key: { tex: face.tex, overlay }, pos: [], nrm: [], uv: [], col: [] }; this.buckets.set(k, b); }
        // plants (cross) are lit like a top face from both sides, as in the game (no dark back side)
        const plant = block.shape === "cross";
        const n = plant ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(...DIR_VEC[d]).applyMatrix3(nm).normalize();
        const sh = e.shade === false || plant ? 1 : shadeOf(n);
        const c = face.tint ? tint : new THREE.Color(1, 1, 1);
        const [u1, v1, u2, v2] = face.uv;
        // uv per corner TL, TR, BR, BL (texture pixels), then rotated by rot/90 steps
        const uvs = [[u1, v1], [u2, v1], [u2, v2], [u1, v2]];
        const steps = ((face.rot ?? 0) / 90) % 4;
        const quad = CORNERS[d].map((pick, i) => {
          const p = new THREE.Vector3(pick[0] ? t[0] : f[0], pick[1] ? t[1] : f[1], pick[2] ? t[2] : f[2]).applyMatrix4(m);
          const [u, v] = uvs[(i - steps + 4) % 4];
          return { p: p.add(new THREE.Vector3(...offset)), u: u / 16, v: 1 - v / 16 };
        });
        for (const i of [0, 3, 2, 0, 2, 1]) {
          const q = quad[i];
          b.pos.push(q.p.x, q.p.y, q.p.z);
          b.nrm.push(n.x, n.y, n.z);
          b.uv.push(q.u, q.v);
          b.col.push(c.r * sh, c.g * sh, c.b * sh);
        }
      }
    });
  }
  build(): { geometry: THREE.BufferGeometry; keys: GroupKey[] } {
    const g = new THREE.BufferGeometry();
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [];
    const keys: GroupKey[] = [];
    for (const b of this.buckets.values()) {
      g.addGroup(pos.length / 3, b.pos.length / 3, keys.length);
      keys.push(b.key);
      for (const v of b.pos) pos.push(v);
      for (const v of b.nrm) nrm.push(v);
      for (const v of b.uv) uv.push(v);
      for (const v of b.col) col.push(v);
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return { geometry: g, keys };
  }
}

/** one block's geometry at the origin (for an InstancedMesh) */
export const blockGeometry = (block: CBlock) => { const q = new QuadBuilder(); q.add(block, [0, 0, 0]); return q.build(); };

// ---- fluids: the game's sloped water. Height per cell from its level (source 8/9, flowing (8-level)/9, 1 under more
// fluid); each top corner averages the cells that share it (air counts 0, a drain 0), so water slopes down toward
// thinner water and into a hole. The top uses the still texture when flat, else the flow texture turned down the slope;
// sides facing air use the flow texture running down. A falling column (level 8+ with fluid below) is open on top
// and shows a curtain of falling water on its inner walls, so a hole visibly swallows the water.
export type FluidCell = { x: number; y: number; z: number; level: number };
export const fluidGeometry = (cells: FluidCell[], solid: (x: number, y: number, z: number) => boolean, tint: string, still: string, flow: string) => {
  const K = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const lv = new Map(cells.map((c) => [K(c.x, c.y, c.z), c.level]));
  const isF = (x: number, y: number, z: number) => lv.has(K(x, y, z));
  /** a falling cell that pours into fluid below: no surface of its own */
  const drain = (x: number, y: number, z: number) => (lv.get(K(x, y, z)) ?? 0) >= 8 && isF(x, y - 1, z) && !isF(x, y + 1, z);
  const height = (x: number, y: number, z: number) => {
    if (isF(x, y + 1, z)) return 1;
    const l = lv.get(K(x, y, z))!;
    return drain(x, y, z) ? 0 : l === 0 || l >= 8 ? 8 / 9 : (8 - l) / 9;
  };
  /** top corner (cx, cz) = the grid corner between cells cx-1..cx and cz-1..cz */
  const corner = (cx: number, y: number, cz: number) => {
    let sum = 0, w = 0;
    for (const [x, z] of [[cx - 1, cz - 1], [cx, cz - 1], [cx - 1, cz], [cx, cz]]) {
      if (isF(x, y + 1, z)) return 1;
      if (isF(x, y, z)) { const h = height(x, y, z), k = lv.get(K(x, y, z)) === 0 ? 3 : 1; sum += h * k; w += k; }
      else if (!solid(x, y, z)) { w += 1; } // open air pulls the edge down
    }
    return w ? sum / w : 8 / 9;
  };
  const tc = new THREE.Color(tint);
  const buckets: Record<string, { pos: number[]; nrm: number[]; uv: number[]; col: number[] }> = { [still]: { pos: [], nrm: [], uv: [], col: [] }, [flow]: { pos: [], nrm: [], uv: [], col: [] } };
  /** a quad from 4 corners (TL, TR, BR, BL seen from outside) with uvs */
  const quad = (tex: string, p: THREE.Vector3[], uv: [number, number][]) => {
    const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[3], p[0])).normalize().negate();
    const sh = n.x * n.x * 0.6 + n.y * n.y * (n.y > 0 ? 1 : 0.5) + n.z * n.z * 0.8;
    const b = buckets[tex];
    for (const i of [0, 3, 2, 0, 2, 1]) {
      b.pos.push(p[i].x, p[i].y, p[i].z); b.nrm.push(n.x, n.y, n.z); b.uv.push(uv[i][0], uv[i][1]); b.col.push(tc.r * sh, tc.g * sh, tc.b * sh);
    }
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  /** flow-texture uvs: the frame's centre half, turned so the ripples run along angle a (radians, 0 = +z) */
  const flowUV = (a: number, pts: [number, number][]) => pts.map(([s, t]) => {
    const c = Math.cos(a), sn = Math.sin(a), du = s - 0.5, dv = t - 0.5;
    return [0.5 + 0.5 * (du * c - dv * sn), 0.5 + 0.5 * (du * sn + dv * c)] as [number, number];
  });
  for (const c of cells) {
    const { x, y, z } = c;
    if (c.level >= 8 && (isF(x, y - 1, z) || isF(x, y + 1, z))) { // falling column: a curtain on the four inner walls (inset), facing in
      // the top cell's curtain starts at the surrounding surface (its corners), not at the top of the block
      const top = isF(x, y + 1, z), cNW = top ? 1 : corner(x, y, z), cNE = top ? 1 : corner(x + 1, y, z), cSE = top ? 1 : corner(x + 1, y, z + 1), cSW = top ? 1 : corner(x, y, z + 1);
      const e = 0.06, wall = (a: THREE.Vector3[], h0: number, h1: number) => quad(flow, a, flowUV(0, [[0, 0.5 + 0.5 * h0], [1, 0.5 + 0.5 * h1], [1, 0], [0, 0]]));
      wall([V(x + e, y + cSW, z + 1), V(x + e, y + cNW, z), V(x + e, y, z), V(x + e, y, z + 1)], cSW, cNW);
      wall([V(x + 1 - e, y + cNE, z), V(x + 1 - e, y + cSE, z + 1), V(x + 1 - e, y, z + 1), V(x + 1 - e, y, z)], cNE, cSE);
      wall([V(x, y + cNW, z + e), V(x + 1, y + cNE, z + e), V(x + 1, y, z + e), V(x, y, z + e)], cNW, cNE);
      wall([V(x + 1, y + cSE, z + 1 - e), V(x, y + cSW, z + 1 - e), V(x, y, z + 1 - e), V(x + 1, y, z + 1 - e)], cSE, cSW);
      continue;
    }
    const full = isF(x, y + 1, z);
    // corner heights NW (x,z), NE (x+1,z), SE (x+1,z+1), SW (x,z+1)
    const hNW = full ? 1 : corner(x, y, z), hNE = full ? 1 : corner(x + 1, y, z), hSE = full ? 1 : corner(x + 1, y, z + 1), hSW = full ? 1 : corner(x, y, z + 1);
    if (!full && !solid(x, y + 1, z)) {
      const gx = (hNE + hSE) - (hNW + hSW), gz = (hSW + hSE) - (hNW + hNE); // uphill
      const flat = Math.hypot(gx, gz) < 0.02;
      const pts = [V(x, y + hNW, z), V(x + 1, y + hNE, z), V(x + 1, y + hSE, z + 1), V(x, y + hSW, z + 1)];
      const base: [number, number][] = [[0, 1], [1, 1], [1, 0], [0, 0]]; // NW, NE, SE, SW (v 1 = north)
      // ripples in the flow texture move toward -v (down the image); turn that onto the downhill direction (-gx, -gz)
      quad(flat ? still : flow, pts, flat ? base : flowUV(Math.atan2(gx, -gz), base));
    }
    // sides: toward air, or toward lower water (a drain), from the floor (or the neighbour's surface) up to our edge
    const sides: [number, number, THREE.Vector3[], number, number][] = [
      [0, -1, [V(x + 1, 0, z), V(x, 0, z)], hNE, hNW],
      [0, 1, [V(x, 0, z + 1), V(x + 1, 0, z + 1)], hSW, hSE],
      [-1, 0, [V(x, 0, z), V(x, 0, z + 1)], hNW, hSW],
      [1, 0, [V(x + 1, 0, z + 1), V(x + 1, 0, z)], hSE, hNE],
    ];
    for (const [dx, dz, [a, b], ha, hb] of sides) {
      const nx = x + dx, nz = z + dz;
      if (solid(nx, y, nz)) continue;
      const lowTo = isF(nx, y, nz) ? (drain(nx, y, nz) ? 0 : null) : 0;
      if (lowTo === null) continue;
      const pts = [V(a.x, y + ha, a.z), V(b.x, y + hb, b.z), V(b.x, y + lowTo, b.z), V(a.x, y + lowTo, a.z)];
      quad(flow, pts, flowUV(0, [[0, 0.5 + 0.5 * ha], [1, 0.5 + 0.5 * hb], [1, 0.5], [0, 0.5]]));
    }
    if (!isF(x, y - 1, z) && !solid(x, y - 1, z)) quad(still, [V(x, y, z + 1), V(x + 1, y, z + 1), V(x + 1, y, z), V(x, y, z)], [[0, 1], [1, 1], [1, 0], [0, 0]]);
  }
  const g = new THREE.BufferGeometry();
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [];
  const keys: GroupKey[] = [];
  for (const [tex, b] of Object.entries(buckets)) {
    if (!b.pos.length) continue;
    g.addGroup(pos.length / 3, b.pos.length / 3, keys.length);
    keys.push({ tex, overlay: false });
    pos.push(...b.pos); nrm.push(...b.nrm); uv.push(...b.uv); col.push(...b.col);
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return { geometry: g, keys };
};

// ---- chest (a block entity in the game: the manifest's block/chest model is empty, so the compiled set block has no
// elements). Built from ChestRenderer's single-chest model (bottom 14x10x14 at texOffs 0,19; lid 14x5x14 at 0,0 on a
// pivot 9 px up; lock 2x4x1) with box UVs mapped by hand onto the 64x64 entity atlas `entity/chest/normal` (the atlas
// is stored upside down since 1.15, so side faces read v from the bottom up). The bottom stops at 9 px instead of 10
// so it never shares the lid's side planes (no z-fight); hidden faces (the bottom's top, the lid's underside, the
// lock's back) are left out. Model front = +z (south); CHEST_ROT gives the y turn for a facing (north by default).
export const CHEST_TEX = "entity/chest/normal";
export const CHEST_ROT: Record<"north" | "south" | "east" | "west", number> = { south: 0, north: 180, east: 270, west: 90 };
export const chestElements = (tex = CHEST_TEX): CElement[] => {
  // atlas px [u0, vTop, u1, vBottom] -> CFace uv (the atlas is 64 px: 16 uv units = 64 px)
  const F = (u0: number, v0: number, u1: number, v1: number) => ({ tex, uv: [u0 / 4, v0 / 4, u1 / 4, v1 / 4] as [number, number, number, number] });
  return [
    // bottom: sides v 33..43 (visual top = v 42 after dropping the last row), underside 14..28 x 19..33
    { from: [1, 0, 1], to: [15, 9, 15], faces: {
      down: F(14, 19, 28, 33), north: F(14, 42, 28, 33), south: F(42, 42, 56, 33), west: F(0, 42, 14, 33), east: F(28, 42, 42, 33) } },
    // lid: sides v 14..19, top 28..42 x 0..14
    { from: [1, 9, 1], to: [15, 14, 15], faces: {
      up: F(28, 14, 42, 0), north: F(14, 19, 28, 14), south: F(42, 19, 56, 14), west: F(0, 19, 14, 14), east: F(28, 19, 42, 14) } },
    // lock on the front
    { from: [7, 7, 15], to: [9, 11, 16], faces: {
      up: F(3, 1, 5, 0), down: F(1, 0, 3, 1), south: F(4, 5, 6, 1), west: F(0, 5, 1, 1), east: F(3, 5, 4, 1) } },
  ];
};
